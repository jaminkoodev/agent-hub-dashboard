import type { MessageBus } from './bus/index.ts';
import type { OmcWatcher } from './watchers/omcWatcher.ts';
import type { AgentClient } from './agentClient.ts';
import type { HealthMonitor } from './healthMonitor.ts';
import { getMachineId, getHubMode, buildCanonicalId } from './types.ts';
import { ProjectDiscoveryService } from './services/projectDiscovery.ts';
import { SessionParserService } from './services/sessionParser.ts';
import { CliExecutorService } from './services/cliExecutor.ts';
import { OmcControlService } from './services/omcControl.ts';
import { createCliRoutes } from './routes/cli.ts';
import { createOmcRoutes } from './routes/omc.ts';

export function createRouter(deps: {
  bus: MessageBus;
  omcWatcher: OmcWatcher;
  agentClients?: AgentClient[];
  healthMonitor?: HealthMonitor;
}) {
  const projectService = new ProjectDiscoveryService();
  const sessionParser = new SessionParserService();
  const cliExecutor = new CliExecutorService(deps.bus);
  const omcControl = new OmcControlService();
  const cliRoutes = createCliRoutes(cliExecutor, sessionParser);
  const omcRoutes = createOmcRoutes(omcControl, cliExecutor, deps.bus);

  // Aggregator-mode helpers
  const isAggregator = getHubMode() === 'aggregator';
  const agentClients = deps.agentClients ?? [];
  const clientMap = new Map(agentClients.map((c) => [c.machineId, c]));
  const healthMonitor = deps.healthMonitor;

  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') return new Response(null, { headers });

    try {
      // Health
      if (path === '/api/health' && method === 'GET') {
        return Response.json({
          status: 'ok',
          machineId: getMachineId(),
          hubMode: getHubMode(),
          mode: 'session-browser',
          timestamp: new Date().toISOString(),
        }, { headers });
      }

      // CLI routes
      if (path.startsWith('/api/cli/')) {
        const result = await cliRoutes(path, method, req);
        if (result) return result;
      }

      // OMC control routes (POST)
      if (path.startsWith('/api/omc/') && method === 'POST') {
        const result = await omcRoutes(path, method, req);
        if (result) return result;
      }

      // Stats (overview)
      if (path === '/api/stats' && method === 'GET') {
        const projects = projectService.listProjects();
        const activeSessions = projectService.getActiveSessions();
        const allModes = deps.omcWatcher.getAllActiveModes();
        const cliSessions = cliExecutor.list().filter((s) => s.status === 'running');
        return Response.json({
          totalProjects: projects.length,
          activeSessions: activeSessions.length,
          totalSessions: projects.reduce((sum, p) => sum + p.sessionCount, 0),
          activeModes: allModes,
          cliSessions: cliSessions.length,
        }, { headers });
      }

      // Projects list (aggregator: fan-out to all machines + merge)
      if (path === '/api/projects' && method === 'GET') {
        if (isAggregator && agentClients.length > 0) {
          const machineFilter = url.searchParams.get('machine');
          const targets = machineFilter
            ? agentClients.filter((c) => c.machineId === machineFilter)
            : agentClients;
          const results = await Promise.allSettled(targets.map(async (c) => {
            const data = await c.projects();
            return (data.projects || []).map((p: any) => ({
              ...p,
              machineId: c.machineId,
              canonicalId: buildCanonicalId(c.machineId, p.id),
            }));
          }));
          const projects = results.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
          return Response.json({ projects }, { headers });
        }
        const projects = projectService.listProjects();
        return Response.json({ projects }, { headers });
      }

      // Project detail
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && method === 'GET') {
        const project = projectService.getProject(projectMatch[1]);
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404, headers });
        const sessions = projectService.listSessions(projectMatch[1]);
        return Response.json({ project, sessions }, { headers });
      }

      // Project sessions
      const projSessionsMatch = path.match(/^\/api\/projects\/([^/]+)\/sessions$/);
      if (projSessionsMatch && method === 'GET') {
        const sessions = projectService.listSessions(projSessionsMatch[1]);
        return Response.json({ sessions }, { headers });
      }

      // Session detail (with pagination)
      const projSessionDetailMatch = path.match(/^\/api\/projects\/([^/]+)\/sessions\/([^/]+)$/);
      if (projSessionDetailMatch && method === 'GET') {
        const [, projectId, sessionId] = projSessionDetailMatch;
        const offset = parseInt(url.searchParams.get('offset') ?? '0');
        const limit = parseInt(url.searchParams.get('limit') ?? '200');
        const detail = sessionParser.parseSession(projectId, sessionId, offset, limit);
        return Response.json(detail, { headers });
      }

      // Session summary (fast)
      const projSessionSummaryMatch = path.match(/^\/api\/projects\/([^/]+)\/sessions\/([^/]+)\/summary$/);
      if (projSessionSummaryMatch && method === 'GET') {
        const [, projectId, sessionId] = projSessionSummaryMatch;
        const summary = sessionParser.getSessionSummary(projectId, sessionId);
        if (!summary) return Response.json({ error: 'Session not found' }, { status: 404, headers });
        return Response.json(summary, { headers });
      }

      // Session subagents
      const projSubagentsMatch = path.match(/^\/api\/projects\/([^/]+)\/sessions\/([^/]+)\/subagents$/);
      if (projSubagentsMatch && method === 'GET') {
        const [, projectId, sessionId] = projSubagentsMatch;
        const subagents = sessionParser.listSubagents(projectId, sessionId);
        return Response.json({ subagents }, { headers });
      }

      // Active sessions
      if (path === '/api/active-sessions' && method === 'GET') {
        const sessions = projectService.getActiveSessions();
        return Response.json({ sessions }, { headers });
      }

      // OMC: current project status
      if (path === '/api/omc/status' && method === 'GET') {
        const activeModes = deps.omcWatcher.getActiveModes();
        const lastError = deps.omcWatcher.getLastError();
        return Response.json({ activeModes, lastError }, { headers });
      }

      // OMC: all projects
      if (path === '/api/omc/all' && method === 'GET') {
        const allModes = deps.omcWatcher.getAllActiveModes();
        return Response.json({ modes: allModes }, { headers });
      }

      // ---- Aggregator-only routes ----
      if (isAggregator) {
        // GET /api/machines — list all machines with health status
        if (path === '/api/machines' && method === 'GET') {
          const machines = agentClients.map((c) => {
            const h = healthMonitor?.getStatus(c.machineId);
            return {
              id: c.machineId,
              status: h?.status ?? 'offline',
              lastSeen: h?.lastSeen ?? 0,
            };
          });
          return Response.json({ machines }, { headers });
        }

        // GET /api/machines/:machineId/projects
        const machineProjectsMatch = path.match(/^\/api\/machines\/([^/]+)\/projects$/);
        if (machineProjectsMatch && method === 'GET') {
          const machineId = machineProjectsMatch[1];
          const client = clientMap.get(machineId);
          if (!client) return Response.json({ error: 'Machine not found' }, { status: 404, headers });
          try {
            const data = await client.projects();
            const projects = (data.projects || []).map((p: any) => ({
              ...p,
              machineId,
              canonicalId: buildCanonicalId(machineId, p.id),
            }));
            return Response.json({ projects }, { headers });
          } catch (err: any) {
            return Response.json({ error: err.message }, { status: 502, headers });
          }
        }

        // GET /api/machines/:machineId/projects/:projectId/sessions
        const machineSessionsMatch = path.match(/^\/api\/machines\/([^/]+)\/projects\/([^/]+)\/sessions$/);
        if (machineSessionsMatch && method === 'GET') {
          const [, machineId, projectId] = machineSessionsMatch;
          const client = clientMap.get(machineId);
          if (!client) return Response.json({ error: 'Machine not found' }, { status: 404, headers });
          try {
            const data = await client.projectSessions(projectId);
            const sessions = (data.sessions || []).map((s: any) => ({
              ...s,
              machineId,
              canonicalId: buildCanonicalId(machineId, s.id),
            }));
            return Response.json({ sessions }, { headers });
          } catch (err: any) {
            return Response.json({ error: err.message }, { status: 502, headers });
          }
        }

        // GET /api/machines/:machineId/sessions/:sessionId
        const machineSessionDetailMatch = path.match(/^\/api\/machines\/([^/]+)\/sessions\/([^/]+)$/);
        if (machineSessionDetailMatch && method === 'GET') {
          const [, machineId, sessionId] = machineSessionDetailMatch;
          const client = clientMap.get(machineId);
          if (!client) return Response.json({ error: 'Machine not found' }, { status: 404, headers });
          try {
            // Need to find which project this session belongs to — fetch all projects and search
            const projectsData = await client.projects();
            for (const p of projectsData.projects || []) {
              try {
                const detail = await client.sessionDetail(p.id, sessionId,
                  parseInt(url.searchParams.get('offset') ?? '0'),
                  parseInt(url.searchParams.get('limit') ?? '200'));
                return Response.json({ ...detail, machineId, canonicalId: buildCanonicalId(machineId, sessionId) }, { headers });
              } catch {
                continue; // session not in this project
              }
            }
            return Response.json({ error: 'Session not found' }, { status: 404, headers });
          } catch (err: any) {
            return Response.json({ error: err.message }, { status: 502, headers });
          }
        }
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers });
    } catch (err: unknown) {
      console.error('API Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return Response.json({ error: errorMessage }, { status: 500, headers });
    }
  };
}
