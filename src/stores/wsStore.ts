import { create } from 'zustand';
import { useOmcStore } from './omcStore';
import { useChatStore } from './chatStore';

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WsStore {
  socket: WebSocket | null;
  status: WsStatus;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connect: () => void;
  disconnect: () => void;
  send: (payload: unknown) => void;
}

const RECONNECT_DELAY_MS = 3000;

function buildWsUrl(): string {
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
}

export const useWsStore = create<WsStore>((set, get) => ({
  socket: null,
  status: 'disconnected',
  reconnectTimer: null,

  connect: () => {
    const { socket, reconnectTimer } = get();
    if (reconnectTimer) { clearTimeout(reconnectTimer); set({ reconnectTimer: null }); }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    set({ status: 'connecting' });
    const ws = new WebSocket(buildWsUrl());
    ws.onopen = () => set({ status: 'connected', socket: ws });
    ws.onmessage = (event) => {
      try { handleWsMessage(JSON.parse(event.data as string)); } catch {}
    };
    ws.onerror = () => set({ status: 'error' });
    ws.onclose = () => {
      set({ socket: null, status: 'disconnected' });
      const timer = setTimeout(() => get().connect(), RECONNECT_DELAY_MS);
      set({ reconnectTimer: timer });
    };
    set({ socket: ws });
  },

  disconnect: () => {
    const { socket, reconnectTimer } = get();
    if (reconnectTimer) { clearTimeout(reconnectTimer); set({ reconnectTimer: null }); }
    if (socket) { socket.onclose = null; socket.close(); set({ socket: null, status: 'disconnected' }); }
  },

  send: (payload) => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  },
}));

function handleWsMessage(msg: Record<string, unknown>) {
  const type = msg.type as string;

  // Route cli.* events to chat store
  if (type?.startsWith('cli.')) {
    useChatStore.getState().addStreamEvent(msg);
    return;
  }

  switch (type) {
    case 'omc.mode.changed': {
      useOmcStore.getState().updateMode(
        msg.mode as string, msg.active as boolean,
        (msg.data as Record<string, unknown>) ?? {}
      );
      break;
    }
    case 'omc.error': {
      useOmcStore.getState().setError({
        tool_name: msg.toolName as string,
        error: msg.error as string,
        timestamp: new Date().toISOString(),
        retry_count: (msg.retryCount as number) ?? 0,
      });
      break;
    }
  }
}
