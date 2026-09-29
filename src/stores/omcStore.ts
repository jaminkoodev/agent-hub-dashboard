import { create } from 'zustand';

export interface OmcModeState {
  active: boolean;
  started_at?: string;
  original_prompt?: string;
  session_id?: string;
  iteration?: number;
  max_iterations?: number;
  linked_ultrawork?: boolean;
  project_path?: string;
  [key: string]: unknown;
}

export interface OmcStatus {
  activeModes: Record<string, OmcModeState>;
  lastError: {
    tool_name: string;
    error: string;
    timestamp: string;
    retry_count: number;
  } | null;
}

interface OmcStore {
  status: OmcStatus;
  loading: boolean;

  fetchStatus: () => Promise<void>;
  updateMode: (mode: string, active: boolean, data: Record<string, unknown>) => void;
  setError: (error: OmcStatus['lastError']) => void;
}

export const useOmcStore = create<OmcStore>((set) => ({
  status: { activeModes: {}, lastError: null },
  loading: false,

  fetchStatus: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/omc/status');
      if (!res.ok) { set({ loading: false }); return; }
      const data = await res.json();
      if (data.activeModes) set({ status: data, loading: false });
      else set({ loading: false });
    } catch (err) {
      console.error('Failed to fetch OMC status:', err);
      set({ loading: false });
    }
  },

  updateMode: (mode, active, data) => {
    set((state) => ({
      status: {
        ...state.status,
        activeModes: active
          ? { ...state.status.activeModes, [mode]: { active, ...data } as OmcModeState }
          : Object.fromEntries(
              Object.entries(state.status.activeModes).filter(([k]) => k !== mode),
            ),
      },
    }));
  },

  setError: (error) => {
    set((state) => ({ status: { ...state.status, lastError: error } }));
  },
}));
