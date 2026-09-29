import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { resolve, join, basename } from 'path';
import { homedir } from 'os';
import { getMachineId, buildCanonicalId } from '../types.ts';

const CLAUDE_HOME = process.env.CLAUDE_HOME ?? resolve(homedir(), '.claude');
const PROJECTS_DIR = resolve(CLAUDE_HOME, 'projects');
const SESSIONS_DIR = resolve(CLAUDE_HOME, 'sessions');

export interface Project {
  machineId: string;    // machine identifier
  canonicalId: string;  // "${machineId}:${id}"
  id: string;           // path-encoded directory name
  path: string;         // decoded real path
  name: string;         // short display name (last dir segment)
  sessionCount: number;
  lastActivity: string; // ISO date
  hasOmcState: boolean;
}

export interface SessionInfo {
  machineId: string;    // machine identifier
  canonicalId: string;  // "${machineId}:${id}"
  id: string;           // session UUID
  projectId: string;
  sizeBytes: number;
  modifiedAt: string;   // ISO date
  subagentCount: number;
  isActive: boolean;    // true if PID still alive
}

export interface ActiveSession {
  machineId: string;    // machine identifier
  canonicalId: string;  // "${machineId}:${sessionId}"
  pid: number;
  sessionId: string;
  cwd: string;
  projectId: string;    // matched from cwd
  startedAt: number;    // epoch ms
  isAlive: boolean;
}

export class ProjectDiscoveryService {

  decodePath(encoded: string): string {
    // Decode a slash-separated project path encoded with leading dashes.
    const raw = '/' + encoded.replace(/^-/, '').replace(/-/g, '/');
    const normalized = resolve(raw);
    if (!normalized.startsWith('/')) return encoded;
    return normalized;
  }

  encodePath(realPath: string): string {
    // Encode a project path using dashes for slash separators.
    const normalized = resolve(realPath);
    return normalized.replace(/\//g, '-');
  }

  listProjects(): Project[] {
    if (!existsSync(PROJECTS_DIR)) return [];

    try {
      const dirs = readdirSync(PROJECTS_DIR).filter(d => {
        try { return statSync(resolve(PROJECTS_DIR, d)).isDirectory(); }
        catch { return false; }
      });

      return dirs.map(dir => {
        const projectDir = resolve(PROJECTS_DIR, dir);
        const realPath = this.decodePath(dir);
        const name = basename(realPath);

        // Count session JSONL files (exclude directories)
        let sessionCount = 0;
        let lastActivity = '';
        try {
          const files = readdirSync(projectDir);
          for (const f of files) {
            if (f.endsWith('.jsonl') && !f.startsWith('.')) {
              sessionCount++;
              try {
                const st = statSync(resolve(projectDir, f));
                const mtime = st.mtime.toISOString();
                if (mtime > lastActivity) lastActivity = mtime;
              } catch (err) {
                console.debug(`[ProjectDiscovery] Error stat'ing ${f}:`, err);
              }
            }
          }
        } catch (err) {
          console.error(`[ProjectDiscovery] Error reading project directory ${projectDir}:`, err);
        }

        // Check if project has .omc/state/
        const hasOmcState = existsSync(resolve(realPath, '.omc/state'));

        const mid = getMachineId();
        return { machineId: mid, canonicalId: buildCanonicalId(mid, dir), id: dir, path: realPath, name, sessionCount, lastActivity, hasOmcState };
      })
      .filter(p => p.sessionCount > 0) // only show projects with sessions
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
    } catch (err) {
      console.error('[ProjectDiscovery] Error listing projects:', err);
      return [];
    }
  }

  getProject(projectId: string): Project | null {
    const projects = this.listProjects();
    return projects.find(p => p.id === projectId) ?? null;
  }

  listSessions(projectId: string): SessionInfo[] {
    const projectDir = resolve(PROJECTS_DIR, projectId);
    if (!existsSync(projectDir)) return [];

    const activeSessions = this.getActiveSessions();
    const activeSessionIds = new Set(activeSessions.map(s => s.sessionId));

    try {
      const files = readdirSync(projectDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('.'));

      return files.map(f => {
        const sessionId = f.replace('.jsonl', '');
        const filePath = resolve(projectDir, f);
        const stat = statSync(filePath);

        // Subagents live at {projectDir}/{sessionId}/subagents/*.meta.json
        let subagentCount = 0;
        try {
          const subagentDir = resolve(projectDir, sessionId, 'subagents');
          if (existsSync(subagentDir)) {
            const metaFiles = readdirSync(subagentDir).filter(file => file.endsWith('.meta.json'));
            subagentCount = metaFiles.length;
          }
        } catch (err) {
          console.debug(`[ProjectDiscovery] Error reading subagents for ${sessionId}:`, err);
        }

        const mid = getMachineId();
        return {
          machineId: mid,
          canonicalId: buildCanonicalId(mid, sessionId),
          id: sessionId,
          projectId,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          subagentCount,
          isActive: activeSessionIds.has(sessionId),
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    } catch (err) {
      console.error(`[ProjectDiscovery] Error listing sessions for project ${projectId}:`, err);
      return [];
    }
  }

  getActiveSessions(): ActiveSession[] {
    if (!existsSync(SESSIONS_DIR)) return [];

    try {
      const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));

      return files.map(f => {
        try {
          const content = readFileSync(resolve(SESSIONS_DIR, f), 'utf-8');
          const data = JSON.parse(content) as {
            pid?: number;
            sessionId?: string;
            cwd?: string;
            startedAt?: number;
          };
          const pid = data.pid ?? parseInt(basename(f, '.json'), 10);

          // Check if process is still alive
          let isAlive = false;
          try {
            process.kill(pid, 0);
            isAlive = true;
          } catch (err) {
            // Process not alive
            console.debug(`[ProjectDiscovery] Process ${pid} not alive:`, err);
          }

          // Match cwd to a project
          const projectId = this.encodePath(data.cwd ?? '');

          const mid = getMachineId();
          const sid = data.sessionId ?? '';
          return {
            machineId: mid,
            canonicalId: buildCanonicalId(mid, sid),
            pid,
            sessionId: sid,
            cwd: data.cwd ?? '',
            projectId,
            startedAt: data.startedAt ?? Date.now(),
            isAlive,
          } satisfies ActiveSession;
        } catch (err) {
          console.error(`[ProjectDiscovery] Error parsing session file ${f}:`, err);
          return null;
        }
      })
      .filter((s): s is ActiveSession => s !== null && s.isAlive);
    } catch (err) {
      console.error('[ProjectDiscovery] Error listing active sessions:', err);
      return [];
    }
  }
}
