/**
 * AgentClient: HTTP client for communicating with a single agent instance.
 * Handles /api/projects, /api/sessions/:id, /api/health with Bearer auth.
 * 5-second timeout via AbortController.
 */

import type { MachineConfig } from './types.ts';
import { resolveToken } from './config/machines.ts';

const FETCH_TIMEOUT_MS = 5_000;

export class AgentClient {
  readonly machineId: string;
  private readonly baseUrl: string;
  private readonly tokenEnv?: string;

  constructor(config: MachineConfig) {
    this.machineId = config.id;
    this.baseUrl = config.baseUrl;
    this.tokenEnv = config.tokenEnv;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    const token = this.tokenEnv ? resolveToken({ id: this.machineId, name: '', baseUrl: '', tokenEnv: this.tokenEnv }) : undefined;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Agent ${this.machineId} responded ${res.status} for ${path}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<{ status: string; machineId: string; hubMode: string; timestamp: string }> {
    return this.fetchJson('/api/health');
  }

  async projects(): Promise<{ projects: any[] }> {
    return this.fetchJson('/api/projects');
  }

  async projectDetail(projectId: string): Promise<any> {
    return this.fetchJson(`/api/projects/${encodeURIComponent(projectId)}`);
  }

  async projectSessions(projectId: string): Promise<{ sessions: any[] }> {
    return this.fetchJson(`/api/projects/${encodeURIComponent(projectId)}/sessions`);
  }

  async sessionDetail(projectId: string, sessionId: string, offset = 0, limit = 200): Promise<any> {
    return this.fetchJson(
      `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}?offset=${offset}&limit=${limit}`,
    );
  }

  async sessionSummary(projectId: string, sessionId: string): Promise<any> {
    return this.fetchJson(
      `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/summary`,
    );
  }

  async activeSessions(): Promise<{ sessions: any[] }> {
    return this.fetchJson('/api/active-sessions');
  }

  async stats(): Promise<any> {
    return this.fetchJson('/api/stats');
  }

  /** Base URL for constructing WS endpoint */
  get wsUrl(): string {
    return this.baseUrl.replace(/^http/, 'ws') + '/ws';
  }

  /** Resolve current token value (for WS auth) */
  getToken(): string | undefined {
    return this.tokenEnv ? resolveToken({ id: this.machineId, name: '', baseUrl: '', tokenEnv: this.tokenEnv }) : undefined;
  }
}
