import { MessageBus } from './bus/index.ts';
import { WebSocketHub, type ServerWebSocket, type WsData } from './ws.ts';
import { OmcWatcher } from './watchers/omcWatcher.ts';
import { createRouter } from './router.ts';
import { authenticateRequest, authenticateWsUpgrade } from './middleware/auth.ts';
import { isAllowedOrigin } from './middleware/origin.ts';
import { getMachineId, getHubMode } from './types.ts';
import { resolve, sep } from 'path';
import { existsSync } from 'fs';

// Aggregator imports (lazy — only used when mode=aggregator)
import { loadMachines } from './config/machines.ts';
import { AgentClient } from './agentClient.ts';
import { HealthMonitor } from './healthMonitor.ts';
import { WsAggregator } from './wsAggregator.ts';

const PORT = parseInt(process.env.PORT ?? '3002');
const HOST = process.env.HOST ?? '127.0.0.1';
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const distDir = resolve(import.meta.dir, '../dist');

// Initialize components
const bus = new MessageBus();
const omcWatcher = new OmcWatcher(bus);

// Aggregator bootstrap
let agentClients: AgentClient[] = [];
let healthMonitor: HealthMonitor | undefined;
let wsAggregator: WsAggregator | undefined;

if (getHubMode() === 'aggregator') {
  const configs = loadMachines();
  agentClients = configs.map((c) => new AgentClient(c));
  healthMonitor = new HealthMonitor(agentClients);
  wsAggregator = new WsAggregator(agentClients, healthMonitor);

  healthMonitor.setStatusChangeCallback((machineId, prev, next) => {
    console.log(`[HealthMonitor] ${machineId}: ${prev} → ${next}`);
    bus.dispatch({
      type: 'omc.mode.changed',
      machineId,
      mode: 'health',
      active: next === 'online',
      data: { status: next, previousStatus: prev },
    });
  });

  healthMonitor.start();
  console.log(`[Aggregator] Monitoring ${agentClients.length} agent(s)`);
}

const wsHub = new WebSocketHub(bus, wsAggregator);
const router = createRouter({ bus, omcWatcher, agentClients, healthMonitor });

// Start OMC watcher
omcWatcher.start();

// Start server
interface BunServer {
  upgrade(req: Request, options?: Record<string, unknown>): boolean;
  stop(): void;
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req: Request, server: BunServer) {
    const url = new URL(req.url);

    if (!isAllowedOrigin(req, HOST, PORT)) {
      return new Response('Forbidden origin', { status: 403 });
    }

    if (url.pathname === '/ws') {
      if (!authenticateWsUpgrade(req)) {
        return new Response('Unauthorized', { status: 401 });
      }
      const success = server.upgrade(req, { data: { subscribedSessions: new Set() } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Auth for API routes
    if (url.pathname.startsWith('/api')) {
      const authError = authenticateRequest(req);
      if (authError) return authError;
    }

    if (!url.pathname.startsWith('/api')) {
      if (isProduction && existsSync(distDir)) {
        const reqPath = url.pathname.slice(1) || 'index.html';
        const filePath = resolve(distDir, reqPath);
        if (!filePath.startsWith(distDir + sep)) {
          return new Response('Not found', { status: 404 });
        }
        const file = Bun.file(filePath);
        if (await file.exists() && file.size > 0) {
          return new Response(file);
        }
        return new Response(Bun.file(resolve(distDir, 'index.html')));
      }
      return new Response('Not found', { status: 404 });
    }

    return router(req);
  },
  websocket: {
    open(ws: ServerWebSocket<any>) { wsHub.handleOpen(ws as ServerWebSocket<WsData>); },
    message(ws: ServerWebSocket<any>, msg: string | Buffer) { wsHub.handleMessage(ws as ServerWebSocket<WsData>, msg); },
    close(ws: ServerWebSocket<any>) { wsHub.handleClose(ws as ServerWebSocket<WsData>); },
  },
});

console.log(`Agent Hub on http://${HOST}:${PORT} [${getHubMode()}] machine=${getMachineId()}`);
console.log(`WebSocket at ws://${HOST}:${PORT}/ws`);
if (isProduction) console.log(`Production — ${distDir}`);

// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.stop();

  // Clean up aggregator
  if (healthMonitor) {
    try { healthMonitor.stop(); } catch (err) { console.error('[Server] Error stopping health monitor:', err); }
  }
  if (wsAggregator) {
    try { wsAggregator.destroy(); } catch (err) { console.error('[Server] Error destroying WS aggregator:', err); }
  }

  // Clean up OMC watcher
  try {
    omcWatcher.stop();
  } catch (err) {
    console.error('[Server] Error stopping OMC watcher:', err);
  }

  // Clean up WebSocket connections
  try {
    const connectionCount = wsHub.getConnectionCount();
    if (connectionCount > 0) {
      console.log(`[Server] Closing ${connectionCount} WebSocket connections...`);
    }
  } catch (err) {
    console.error('[Server] Error closing WebSocket connections:', err);
  }

  console.log('[Server] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
