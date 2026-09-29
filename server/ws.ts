import type { MessageBus } from './bus/index.ts';
import type { BusEvent } from './bus/types.ts';
import type { WsAggregator } from './wsAggregator.ts';

export interface WsData {
  subscribedSessions: Set<string>;
}

// Minimal ServerWebSocket shape used here (Bun built-in, no package needed at runtime)
export interface ServerWebSocket<T> {
  data: T;
  send(data: string | Buffer): void;
}

export class WebSocketHub {
  private connections = new Set<ServerWebSocket<WsData>>();
  private wsAggregator?: WsAggregator;

  constructor(private bus: MessageBus, wsAggregator?: WsAggregator) {
    this.wsAggregator = wsAggregator;

    // Listen to all bus events and broadcast to subscribed clients
    this.bus.on('*', (event: BusEvent) => {
      this.broadcast(event);
    });
  }

  handleOpen(ws: ServerWebSocket<WsData>) {
    ws.data = { subscribedSessions: new Set() };
    this.connections.add(ws);
  }

  handleMessage(ws: ServerWebSocket<WsData>, message: string | Buffer) {
    try {
      const data = JSON.parse(typeof message === 'string' ? message : message.toString());

      // Delegate machine-level subscribe/unsubscribe to WsAggregator if present
      if (this.wsAggregator && this.wsAggregator.handleDownstreamMessage(ws, data)) {
        return;
      }

      switch (data.event) {
        case 'subscribe':
          ws.data.subscribedSessions.add(data.sessionId);
          break;
        case 'unsubscribe':
          ws.data.subscribedSessions.delete(data.sessionId);
          break;
        case 'ping':
          ws.send(JSON.stringify({ event: 'pong' }));
          break;
      }
    } catch (err) {
      console.error('[WebSocketHub] Failed to parse message:', err);
    }
  }

  handleClose(ws: ServerWebSocket<WsData>) {
    this.connections.delete(ws);
    // Clean up aggregator subscriptions for this client
    if (this.wsAggregator) {
      this.wsAggregator.handleDownstreamClose(ws);
    }
  }

  private broadcast(event: BusEvent) {
    const message = JSON.stringify(event);
    const isCliEvent = event.type.startsWith('cli.');
    for (const ws of this.connections) {
      try {
        // CLI events: send to clients subscribed to that CLI session or to 'cli:*'
        if (isCliEvent && 'sessionId' in event) {
          const subscribed = ws.data.subscribedSessions.has(event.sessionId)
            || ws.data.subscribedSessions.has('cli:*');
          if (!subscribed) continue;
          ws.send(message);
          continue;
        }
        // Non-CLI session-scoped events: filter by subscription
        if ('sessionId' in event && !ws.data.subscribedSessions.has(event.sessionId)) {
          continue;
        }
        ws.send(message);
      } catch (err) {
        console.error('[WebSocketHub] Failed to send message:', err);
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
