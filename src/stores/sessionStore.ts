import { create } from 'zustand';

export interface SessionInfo {
  machineId: string;
  canonicalId: string;
  id: string;
  projectId: string;
  sizeBytes: number;
  modifiedAt: string;
  subagentCount: number;
  isActive: boolean;
}

export interface SessionTurn {
  type: string;
  uuid: string;
  timestamp: string;
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  model?: string;
  tokens?: { input: number; output: number };
  parentUuid?: string;
  isSidechain?: boolean;
}

export interface SessionDetail {
  id: string;
  projectId: string;
  machineId?: string;
  canonicalId?: string;
  turns: SessionTurn[];
  totalTokens: { input: number; output: number };
  models: string[];
  toolUsage: Record<string, number>;
  duration: number;
  subagents: Array<{ id: string; type: string; description: string }>;
}

export interface SessionSummary {
  id: string;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  sizeBytes: number;
}

interface SessionStore {
  sessions: SessionInfo[];
  currentSession: SessionDetail | null;
  currentSummary: SessionSummary | null;
  loading: boolean;
  detailLoading: boolean;

  fetchSessions: (projectId: string) => Promise<void>;
  fetchSessionDetail: (projectId: string, sessionId: string, offset?: number, limit?: number) => Promise<void>;
  fetchSessionSummary: (projectId: string, sessionId: string) => Promise<void>;
  clearSession: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  currentSession: null,
  currentSummary: null,
  loading: false,
  detailLoading: false,

  fetchSessions: async (projectId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/sessions`);
      if (!res.ok) { set({ loading: false }); return; }
      const data = await res.json();
      set({ sessions: data.sessions ?? [], loading: false });
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      set({ loading: false });
    }
  },

  fetchSessionDetail: async (projectId, sessionId, offset = 0, limit = 200) => {
    set({ detailLoading: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/sessions/${sessionId}?offset=${offset}&limit=${limit}`);
      if (!res.ok) { set({ detailLoading: false }); return; }
      const data = await res.json();
      if (data.turns) set({ currentSession: data, detailLoading: false });
      else set({ detailLoading: false });
    } catch (err) {
      console.error('Failed to fetch session detail:', err);
      set({ detailLoading: false });
    }
  },

  fetchSessionSummary: async (projectId, sessionId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sessions/${sessionId}/summary`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.turnCount !== undefined) set({ currentSummary: data });
    } catch (err) {
      console.error('Failed to fetch session summary:', err);
    }
  },

  clearSession: () => set({ currentSession: null, currentSummary: null }),
}));
