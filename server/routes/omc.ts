import type { OmcControlService, StartModeOptions } from '../services/omcControl.ts';
import type { CliExecutorService } from '../services/cliExecutor.ts';
import type { MessageBus } from '../bus/index.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function createOmcRoutes(
  omcControl: OmcControlService,
  cliExecutor: CliExecutorService,
  bus: MessageBus,
) {
  return async function handleOmcRoute(path: string, method: string, req: Request): Promise<Response | null> {
    // POST /api/omc/:mode/start
    const startMatch = path.match(/^\/api\/omc\/([^/]+)\/start$/);
    if (startMatch && method === 'POST') {
      const mode = startMatch[1];
      if (!omcControl.isSupportedMode(mode)) {
        return Response.json({ error: `Unsupported mode: ${mode}` }, { status: 400, headers: JSON_HEADERS });
      }

      try {
        const body = await req.json() as Partial<StartModeOptions>;
        if (!body.prompt || typeof body.prompt !== 'string') {
          return Response.json({ error: 'prompt is required' }, { status: 400, headers: JSON_HEADERS });
        }

        const projectPath = body.projectPath || process.cwd();

        await omcControl.startMode(mode, {
          prompt: body.prompt,
          maxIterations: body.maxIterations,
          projectPath,
        });

        // Also start a CLI session to execute the mode
        const cliPrompt = `/${mode} ${body.prompt}`;
        const sessionId = await cliExecutor.execute({
          prompt: cliPrompt,
          projectPath,
        });

        return Response.json({ ok: true, mode, sessionId }, { status: 201, headers: JSON_HEADERS });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return Response.json({ error: errorMessage }, { status: 500, headers: JSON_HEADERS });
      }
    }

    // POST /api/omc/:mode/stop
    const stopMatch = path.match(/^\/api\/omc\/([^/]+)\/stop$/);
    if (stopMatch && method === 'POST') {
      const mode = stopMatch[1];
      if (!omcControl.isSupportedMode(mode)) {
        return Response.json({ error: `Unsupported mode: ${mode}` }, { status: 400, headers: JSON_HEADERS });
      }

      try {
        let projectPath: string | undefined;
        try {
          const body = await req.json() as { projectPath?: string };
          projectPath = body.projectPath;
        } catch (err) {
          // empty body is ok
          console.debug('[OmcRoutes] Empty request body:', err);
        }

        const stopped = await omcControl.stopMode(mode, projectPath);
        if (!stopped) {
          return Response.json({ error: `Mode ${mode} is not active` }, { status: 404, headers: JSON_HEADERS });
        }

        return Response.json({ ok: true, mode }, { headers: JSON_HEADERS });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return Response.json({ error: errorMessage }, { status: 500, headers: JSON_HEADERS });
      }
    }

    return null;
  };
}
