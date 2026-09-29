import type { CliExecutorService, CliExecuteOptions } from '../services/cliExecutor.ts';
import type { SessionParserService } from '../services/sessionParser.ts';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

function validateProjectPath(path?: string): string | null {
  if (!path) return null; // will use cwd default
  const resolved = resolve(path);
  if (!existsSync(resolved)) return `Project path does not exist: ${resolved}`;
  // Must be under the user's home directory or CLAUDE_HOME — block system paths
  const home = process.env.HOME || homedir();
  const claudeHome = process.env.CLAUDE_HOME || resolve(home, '.claude');

  const isUnderHome = resolved.startsWith(home + '/') || resolved === home;
  const isUnderClaude = resolved.startsWith(claudeHome + '/') || resolved === claudeHome;

  if (!isUnderHome && !isUnderClaude) {
    return `Project path must be under user home or CLAUDE_HOME`;
  }
  return null;
}

/** Encode a real filesystem path to Claude's project ID format (dash encoding) */
function encodeProjectPath(realPath: string): string {
  const normalized = resolve(realPath);
  return normalized.replace(/\//g, '-');
}

/**
 * Convert SessionTurns from JSONL parser into the stream-json event format
 * that the frontend's parseStreamEvents() already understands.
 */
function turnsToStreamEvents(
  turns: Array<{
    type: string;
    content?: string;
    toolName?: string;
    toolInput?: string;
    toolResult?: string;
    model?: string;
    timestamp: string;
  }>,
): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];

  for (const turn of turns) {
    if (turn.type === 'user') {
      if (turn.toolResult) {
        // Tool result — skip (internal plumbing, not user-visible)
        continue;
      }
      if (turn.content) {
        events.push({
          type: 'human',
          timestamp: turn.timestamp,
          message: {
            role: 'user',
            content: [{ type: 'text', text: turn.content }],
          },
        });
      }
    } else if (turn.type === 'assistant') {
      const content: Array<Record<string, unknown>> = [];

      if (turn.content) {
        content.push({ type: 'text', text: turn.content });
      }
      if (turn.toolName) {
        let parsedInput: Record<string, unknown> = {};
        if (turn.toolInput) {
          try { parsedInput = JSON.parse(turn.toolInput); } catch {}
        }
        content.push({
          type: 'tool_use',
          name: turn.toolName,
          input: parsedInput,
        });
      }

      if (content.length > 0) {
        events.push({
          type: 'assistant',
          timestamp: turn.timestamp,
          message: {
            role: 'assistant',
            model: turn.model,
            content,
          },
        });
      }
    }
  }

  return events;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function createCliRoutes(cliExecutor: CliExecutorService, sessionParser: SessionParserService) {
  return async function handleCliRoute(path: string, method: string, req: Request): Promise<Response | null> {
    // POST /api/cli/execute
    if (path === '/api/cli/execute' && method === 'POST') {
      try {
        const body = await req.json() as Partial<CliExecuteOptions>;
        if (!body.prompt || typeof body.prompt !== 'string') {
          return Response.json({ error: 'prompt is required' }, { status: 400, headers: JSON_HEADERS });
        }

        const pathError = validateProjectPath(body.projectPath);
        if (pathError) {
          return Response.json({ error: pathError }, { status: 400, headers: JSON_HEADERS });
        }

        const sessionId = await cliExecutor.execute({
          prompt: body.prompt,
          projectPath: body.projectPath,
          allowedTools: body.allowedTools,
          continueSession: body.continueSession,
          bare: body.bare,
          appendSystemPrompt: body.appendSystemPrompt,
        });

        return Response.json({ sessionId }, { status: 201, headers: JSON_HEADERS });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return Response.json({ error: errorMessage }, { status: 500, headers: JSON_HEADERS });
      }
    }

    // GET /api/cli/sessions
    if (path === '/api/cli/sessions' && method === 'GET') {
      const sessions = cliExecutor.list().map((s) => ({
        id: s.id,
        pid: s.pid,
        claudeSessionId: s.claudeSessionId,
        status: s.status,
        prompt: s.prompt.slice(0, 200),
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        projectPath: s.projectPath,
        messageCount: s.messages.length,
      }));
      return Response.json({ sessions }, { headers: JSON_HEADERS });
    }

    // GET /api/cli/sessions/:id
    const sessionDetailMatch = path.match(/^\/api\/cli\/sessions\/([^/]+)$/);
    if (sessionDetailMatch && method === 'GET') {
      const session = cliExecutor.get(sessionDetailMatch[1]);
      if (!session) {
        return Response.json({ error: 'Session not found' }, { status: 404, headers: JSON_HEADERS });
      }

      // If session has in-memory messages (active/recent), return them directly
      let messages = session.messages;

      // If no in-memory messages but we have a claudeSessionId,
      // load conversation history from Claude's JSONL session file
      if (messages.length === 0 && session.claudeSessionId && session.projectPath) {
        try {
          const projectId = encodeProjectPath(session.projectPath);
          const detail = sessionParser.parseSession(projectId, session.claudeSessionId, 0, 500);
          if (detail.turns.length > 0) {
            messages = turnsToStreamEvents(detail.turns) as any;
          }
        } catch (err) {
          console.error('[CLI Routes] Failed to load JSONL history:', err);
        }
      }

      return Response.json({
        id: session.id,
        pid: session.pid,
        claudeSessionId: session.claudeSessionId,
        status: session.status,
        prompt: session.prompt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        projectPath: session.projectPath,
        allowedTools: session.allowedTools,
        messageCount: messages.length,
        messages,
      }, { headers: JSON_HEADERS });
    }

    // POST /api/cli/sessions/:id/cancel
    const cancelMatch = path.match(/^\/api\/cli\/sessions\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      const success = await cliExecutor.cancel(cancelMatch[1]);
      if (!success) {
        return Response.json({ error: 'Session not found or not running' }, { status: 404, headers: JSON_HEADERS });
      }
      return Response.json({ ok: true }, { headers: JSON_HEADERS });
    }

    return null; // not handled
  };
}
