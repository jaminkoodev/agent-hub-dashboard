/**
 * HealthMonitor: Polls each agent's /api/health every 30 seconds.
 * 3-state model: online / degraded / offline.
 *
 * State transitions:
 *   - 1 failure → degraded
 *   - 3 consecutive failures → offline
 *   - 1 success → online (immediate recovery)
 *   - WS disconnect (external signal) → immediate degraded
 */

import type { AgentClient } from './agentClient.ts';
import type { MachineStatus } from './types.ts';

const POLL_INTERVAL_MS = 30_000;
const OFFLINE_THRESHOLD = 3;

export interface MachineHealth {
  machineId: string;
  status: MachineStatus;
  lastSeen: number; // epoch ms, 0 if never seen
  consecutiveFailures: number;
}

type StatusChangeCallback = (machineId: string, prev: MachineStatus, next: MachineStatus) => void;

export class HealthMonitor {
  private readonly clients: Map<string, AgentClient>;
  private readonly state: Map<string, MachineHealth> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private onStatusChange: StatusChangeCallback | null = null;

  constructor(clients: AgentClient[]) {
    this.clients = new Map(clients.map((c) => [c.machineId, c]));
    for (const c of clients) {
      this.state.set(c.machineId, {
        machineId: c.machineId,
        status: 'offline', // start as offline until first successful poll
        lastSeen: 0,
        consecutiveFailures: 0,
      });
    }
  }

  setStatusChangeCallback(cb: StatusChangeCallback): void {
    this.onStatusChange = cb;
  }

  start(): void {
    if (this.timer) return;
    // Initial poll immediately
    this.pollAll();
    this.timer = setInterval(() => this.pollAll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(machineId: string): MachineHealth | undefined {
    return this.state.get(machineId);
  }

  getAllStatuses(): MachineHealth[] {
    return Array.from(this.state.values());
  }

  /**
   * External signal: WS connection dropped unexpectedly.
   * Immediately transitions to degraded (unless already offline).
   */
  markWsDisconnected(machineId: string): void {
    const h = this.state.get(machineId);
    if (!h) return;
    if (h.status === 'offline') return; // already worse
    this.transition(h, 'degraded');
  }

  private async pollAll(): Promise<void> {
    const promises = Array.from(this.clients.entries()).map(([id, client]) =>
      this.pollOne(id, client),
    );
    await Promise.allSettled(promises);
  }

  private async pollOne(machineId: string, client: AgentClient): Promise<void> {
    const h = this.state.get(machineId)!;
    try {
      await client.health();
      // Success
      h.consecutiveFailures = 0;
      h.lastSeen = Date.now();
      this.transition(h, 'online');
    } catch {
      h.consecutiveFailures++;
      if (h.consecutiveFailures >= OFFLINE_THRESHOLD) {
        this.transition(h, 'offline');
      } else {
        this.transition(h, 'degraded');
      }
    }
  }

  private transition(h: MachineHealth, next: MachineStatus): void {
    const prev = h.status;
    if (prev === next) return;
    h.status = next;
    if (this.onStatusChange) {
      try {
        this.onStatusChange(h.machineId, prev, next);
      } catch (err) {
        console.error(`[HealthMonitor] Status change callback error for ${h.machineId}:`, err);
      }
    }
  }
}
