import { create } from 'zustand';

export interface Project {
  machineId: string;
  canonicalId: string;
  id: string;
  path: string;
  name: string;
  sessionCount: number;
  lastActivity: string;
  hasOmcState: boolean;
}

export interface ActiveSession {
  machineId: string;
  canonicalId: string;
  pid: number;
  sessionId: string;
  cwd: string;
  projectId: string;
  startedAt: number;
  isAlive: boolean;
}

interface ProjectStore {
  projects: Project[];
  activeSessions: ActiveSession[];
  loading: boolean;
  fetchProjects: () => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeSessions: [],
  loading: false,

  fetchProjects: async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.projects)) set({ projects: data.projects });
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  },

  fetchActiveSessions: async () => {
    try {
      const res = await fetch('/api/active-sessions');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.sessions)) set({ activeSessions: data.sessions });
    } catch (err) {
      console.error('Failed to fetch active sessions:', err);
    }
  },
}));
