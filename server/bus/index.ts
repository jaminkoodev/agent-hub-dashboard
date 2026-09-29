import { EventEmitter } from 'events';
import type { BusEvent } from './types.ts';

type BusMiddleware = (event: BusEvent) => Promise<void> | void;

export class MessageBus extends EventEmitter {
  private middlewares: BusMiddleware[] = [];

  use(mw: BusMiddleware): void {
    this.middlewares.push(mw);
  }

  async dispatch(event: BusEvent): Promise<void> {
    for (const mw of this.middlewares) {
      await mw(event);
    }
    this.emit(event.type, event);
    this.emit('*', event); // wildcard for WebSocket broadcast
  }
}
