/**
 * WsAggregator: Manages upstream WebSocket connections to agents.
 *
 * - Ref-count table per machineId.
 * - Upstream WS created when ref goes 0→1, closed when ref goes 1→0 (5s grace).
 * - Routes upstream events to downstream clients with machineId tagging.
 * - On unexpected upstream disconnect: signals HealthMonitor, attempts reconnect with backoff.
 */

import type { AgentClient } from './agentClient.ts';
import type { HealthMonitor } from './healthMonitor.ts';
import type { ServerWebSocket, WsData } from './ws.ts';

const GRACE_PERIOD_MS = 5_000;
const BACKOFF_SCHEDULE = [5_000, 10_000, 30_000, 60_000];

interface UpstreamEntry {
  machineId: string;
  ws: WebSocket | null;
  refCount: number;
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting';
  intentionalClose: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
}

// Downstream client tracking for machine-level subscriptions
interface DownstreamClientData {
  subscribedMachines: Set<string>; // machine IDs this client is subscribed to
}

export class WsAggregator {
  private readonly clients: Map<string, AgentClient>;
  private readonly healthMonitor: HealthMonitor;
  private readonly upstreams: Map<string, UpstreamEntry> = new Map();
  private readonly downstreamSubs: Map<ServerWebSocket<WsData>, DownstreamClientData> = new Map();

  constructor(clients: AgentClient[], healthMonitor: HealthMonitor) {
    this.clients = new Map(clients.map((c) => [c.machineId, c]));
    this.healthMonitor = healthMonitor;

    for (const c of clients) {
      this.upstreams.set(c.machineId, {
        machineId: c.machineId,
        ws: null,
        refCount: 0,
        status: 'idle',
        intentionalClose: false,
        graceTimer: null,
        reconnectTimer: null,
        reconnectAttempt: 0,
      });
    }
  }

  /**
   * Handle machine-level subscribe/unsubscribe messages from downstream clients.
   * Protocol: { type: "subscribe"|"unsubscribe", machines: string[] }
   */
  handleDownstreamMessage(ws: ServerWebSocket<WsData>, data: { type: string; machines?: string[] }): boolean {
    if (data.type !== 'subscribe' && data.type !== 'unsubscribe') return false;

    const machines = data.machines;
    if (!Array.isArray(machines)) return false;

    // Resolve "*" to all registered machine IDs
    const targetIds = machines.includes('*')
      ? Array.from(this.clients.keys())
      : machines.filter((id) => this.clients.has(id));

    // Report unknown machines
    const unknowns = machines.filter((id) => id !== '*' && !this.clients.has(id));
    if (unknowns.length > 0) {
      this.sendToClient(ws, { type: 'error', message: `unknown machine(s): ${unknowns.join(', ')}`, ts: Date.now() });
    }

    if (!this.downstreamSubs.has(ws)) {
      this.downstreamSubs.set(ws, { subscribedMachines: new Set() });
    }
    const clientData = this.downstreamSubs.get(ws)!;

    if (data.type === 'subscribe') {
      for (const id of targetIds) {
        if (!clientData.subscribedMachines.has(id)) {
          clientData.subscribedMachines.add(id);
          this.incrementRef(id);
        }
      }
      this.sendToClient(ws, { type: 'subscribed', machines: targetIds, ts: Date.now() });
    } else {
      for (const id of targetIds) {
        if (clientData.subscribedMachines.has(id)) {
          clientData.subscribedMachines.delete(id);
          this.decrementRef(id);
        }
      }
    }

    return true;
  }

  /**
   * Called when a downstream client disconnects.
   * Decrements ref for all machines they were subscribed to.
   */
  handleDownstreamClose(ws: ServerWebSocket<WsData>): void {
    const clientData = this.downstreamSubs.get(ws);
    if (!clientData) return;
    for (const machineId of clientData.subscribedMachines) {
      this.decrementRef(machineId);
    }
    this.downstreamSubs.delete(ws);
  }

  /** Clean up all upstream connections on shutdown */
  destroy(): void {
    for (const entry of this.upstreams.values()) {
      if (entry.graceTimer) clearTimeout(entry.graceTimer);
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      if (entry.ws) {
        entry.intentionalClose = true;
        try { entry.ws.close(); } catch {}
      }
    }
    this.upstreams.clear();
    this.downstreamSubs.clear();
  }

  // ---- Ref-count management ----

  private incrementRef(machineId: string): void {
    const entry = this.upstreams.get(machineId);
    if (!entry) return;

    entry.refCount++;

    // Cancel pending grace-period close
    if (entry.graceTimer) {
      clearTimeout(entry.graceTimer);
      entry.graceTimer = null;
    }

    // Create upstream connection if first subscriber
    if (entry.refCount === 1 && entry.status === 'idle') {
      this.connectUpstream(machineId);
    }
  }

  private decrementRef(machineId: string): void {
    const entry = this.upstreams.get(machineId);
    if (!entry || entry.refCount <= 0) return;

    entry.refCount--;

    if (entry.refCount === 0 && entry.ws) {
      // Grace period before closing
      entry.graceTimer = setTimeout(() => {
        entry.graceTimer = null;
        if (entry.refCount === 0 && entry.ws) {
          entry.intentionalClose = true;
          entry.ws.close();
          entry.ws = null;
          entry.status = 'idle';
          entry.reconnectAttempt = 0;
          if (entry.reconnectTimer) {
            clearTimeout(entry.reconnectTimer);
            entry.reconnectTimer = null;
          }
        }
      }, GRACE_PERIOD_MS);
    }
  }

  // ---- Upstream WebSocket management ----

  private connectUpstream(machineId: string): void {
    const entry = this.upstreams.get(machineId);
    const client = this.clients.get(machineId);
    if (!entry || !client) return;

    entry.status = entry.reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    entry.intentionalClose = false;

    const wsUrl = client.wsUrl;
    const token = client.getToken();

    // Bun's WebSocket client supports headers option
    const ws = new WebSocket(wsUrl, token ? [token] : undefined);

    ws.onopen = () => {
      entry.status = 'connected';
      entry.reconnectAttempt = 0;
      // Subscribe to all CLI events on the agent
      ws.send(JSON.stringify({ event: 'subscribe', sessionId: 'cli:*' }));
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : event.data.toString();
      this.fanOutToDownstream(machineId, raw);
    };

    ws.onclose = () => {
      if (entry.intentionalClose) {
        // Intentional close (ref=0 grace period expired) — do nothing to health
        return;
      }
      // Unexpected close
      entry.ws = null;
      entry.status = 'idle';
      this.healthMonitor.markWsDisconnected(machineId);

      // Reconnect if still have subscribers
      if (entry.refCount > 0) {
        this.scheduleReconnect(machineId);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    entry.ws = ws;
  }

  private scheduleReconnect(machineId: string): void {
    const entry = this.upstreams.get(machineId);
    if (!entry || entry.refCount <= 0) return;

    const delay = BACKOFF_SCHEDULE[Math.min(entry.reconnectAttempt, BACKOFF_SCHEDULE.length - 1)];
    entry.reconnectAttempt++;

    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      if (entry.refCount > 0) {
        this.connectUpstream(machineId);
      }
    }, delay);
  }

  // ---- Fan-out to downstream ----

  private fanOutToDownstream(machineId: string, rawMessage: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(rawMessage);
    } catch {
      return;
    }

    const wrapped = JSON.stringify({
      type: 'event',
      machineId,
      payload,
      ts: Date.now(),
    });

    for (const [ws, clientData] of this.downstreamSubs) {
      if (clientData.subscribedMachines.has(machineId)) {
        this.sendToClient(ws, wrapped);
      }
    }
  }

  private sendToClient(ws: ServerWebSocket<WsData>, data: unknown): void {
    try {
      const msg = typeof data === 'string' ? data : JSON.stringify(data);
      ws.send(msg);
    } catch {
      // Client may have disconnected
    }
  }
}
