import { create } from 'zustand';

export interface CliSessionInfo {
  id: string;
  pid: number;
  claudeSessionId?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  startedAt: number;
  endedAt?: number;
  projectPath: string;
  messageCount: number;
}

interface CliStore {
  sessions: CliSessionInfo[];
  loading: boolean;
  fetchSessions: () => Promise<void>;
}

export const useCliStore = create<CliStore>((set) => ({
  sessions: [],
  loading: false,

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/cli/sessions');
      if (!res.ok) { set({ loading: false }); return; }
      const data = await res.json() as { sessions: CliSessionInfo[] };
      set({ sessions: data.sessions ?? [], loading: false });
    } catch (err) {
      console.error('Failed to fetch CLI sessions:', err);
      set({ loading: false });
    }
  },
}));
