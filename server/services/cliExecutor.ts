import type { MessageBus } from '../bus/index.ts';
import type { Subprocess } from 'bun';
import { ulid } from 'ulid';
import { getMachineId } from '../types.ts';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export interface CliSession {
  id: string;
  pid: number;
  claudeSessionId?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  startedAt: number;
  endedAt?: number;
  projectPath: string;
  allowedTools: string[];
  messages: CliStreamEvent[];
}

export interface CliExecuteOptions {
  prompt: string;
  projectPath?: string;
  allowedTools?: string[];
  continueSession?: string;
  bare?: boolean;
  appendSystemPrompt?: string;
}

export interface CliStreamEvent {
  type: string;
  subtype?: string;
  timestamp: string;
  // stream-json fields
  session_id?: string;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string;
    }>;
    model?: string;
    stop_reason?: string;
  };
  // partial message fields
  content_block_start?: { type: string; text?: string; name?: string };
  content_block_delta?: { type: string; text?: string };
  content_block_stop?: Record<string, unknown>;
  // tool events
  tool_use_id?: string;
  result?: string;
  // raw fallback
  [key: string]: unknown;
}

const MAX_SESSION_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CANCEL_SIGINT_WAIT = 3000;
const CANCEL_SIGTERM_WAIT = 3000;
const MAX_MESSAGES = 10000; // Memory limit for in-memory messages

/** Persisted session metadata (without in-memory messages) */
interface PersistedSessionMeta {
  id: string;
  claudeSessionId?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  startedAt: number;
  endedAt?: number;
  projectPath: string;
  allowedTools: string[];
}

const PERSIST_PATH = resolve(import.meta.dir, '../../data/cli-sessions.json');

export class CliExecutorService {
  private sessions = new Map<string, CliSession>();
  private processes = new Map<string, Subprocess>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private bus: MessageBus) {
    this.loadPersistedSessions();
  }

  // ---- Validation ---------------------------------------------------------------

  private validateAllowedTools(tools: string[]): string[] {
    // Whitelist check: filter out suspicious tool names
    const allowedPattern = /^[a-zA-Z0-9_:.\-]+$/;
    return tools.filter(tool => allowedPattern.test(tool));
  }

  // ---- Persistence ----------------------------------------------------------

  private persistSessions(): void {
    const data: PersistedSessionMeta[] = Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      claudeSessionId: s.claudeSessionId,
      status: s.status,
      prompt: s.prompt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      projectPath: s.projectPath,
      allowedTools: s.allowedTools,
    }));
    try {
      const dir = dirname(PERSIST_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(PERSIST_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[CliExecutor] Failed to persist sessions:', err);
    }
  }

  private loadPersistedSessions(): void {
    if (!existsSync(PERSIST_PATH)) return;
    try {
      const raw = readFileSync(PERSIST_PATH, 'utf-8');
      const data = JSON.parse(raw) as PersistedSessionMeta[];
      for (const s of data) {
        // Mark previously-running sessions as failed (server crashed)
        const status = s.status === 'running' ? 'failed' : s.status;
        this.sessions.set(s.id, {
          ...s,
          status,
          pid: 0,
          messages: [],
        });
      }
    } catch (err) {
      console.error('[CliExecutor] Failed to load persisted sessions:', err);
    }
  }

  async execute(opts: CliExecuteOptions): Promise<string> {
    const sessionId = ulid();
    const projectPath = opts.projectPath || process.cwd();

    // Validate allowedTools: whitelist check and sanitize
    const allowedTools = this.validateAllowedTools(opts.allowedTools ?? []);

    const args: string[] = [
      'claude',
      '-p', opts.prompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (opts.bare) args.push('--no-config');
    if (opts.continueSession) args.push('--resume', opts.continueSession);
    if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt);
    if (allowedTools.length) {
      for (const tool of allowedTools) {
        args.push('--allowedTools', tool);
      }
    }

    const proc = Bun.spawn(args, {
      cwd: projectPath,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env },
    });

    const session: CliSession = {
      id: sessionId,
      pid: proc.pid,
      status: 'running',
      prompt: opts.prompt,
      startedAt: Date.now(),
      projectPath,
      allowedTools: opts.allowedTools ?? [],
      messages: [],
    };

    this.sessions.set(sessionId, session);
    this.processes.set(sessionId, proc);
    this.persistSessions();

    // Zombie prevention timeout
    const timeout = setTimeout(() => {
      this.cancel(sessionId).catch(() => {});
    }, MAX_SESSION_AGE_MS);
    this.timeouts.set(sessionId, timeout);

    this.bus.dispatch({
      type: 'cli.started',
      machineId: getMachineId(),
      sessionId,
      prompt: opts.prompt,
      projectPath,
    });

    // Read stdout in background
    this.readStream(sessionId, proc);

    return sessionId;
  }

  private async readStream(sessionId: string, proc: Subprocess): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !proc.stdout || typeof proc.stdout === 'number') return;

    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event: CliStreamEvent = JSON.parse(trimmed);
            event.timestamp = new Date().toISOString();

            // Capture Claude session ID from first message
            if (event.session_id && !session.claudeSessionId) {
              session.claudeSessionId = event.session_id;
              this.persistSessions();
            }

            // Enforce memory limit with circular buffer
            if (session.messages.length >= MAX_MESSAGES) {
              session.messages.shift();
            }
            session.messages.push(event);

            this.bus.dispatch({
              type: 'cli.stream',
              machineId: getMachineId(),
              sessionId,
              event,
            });
          } catch (err) {
            // Non-JSON line — emit as raw text
            console.error(`[CliExecutor] Failed to parse stream line: ${err}`);
            const rawEvent: CliStreamEvent = {
              type: 'raw',
              timestamp: new Date().toISOString(),
              result: trimmed,
            };
            session.messages.push(rawEvent);
            this.bus.dispatch({
              type: 'cli.stream',
              machineId: getMachineId(),
              sessionId,
              event: rawEvent,
            });
          }
        }
      }
    } catch (err) {
      // Stream read error
      console.error(`[CliExecutor] Stream read error for ${sessionId}:`, err);
    }

    // Wait for process exit
    const exitCode = await proc.exited;
    this.clearTimeout(sessionId);
    this.processes.delete(sessionId);

    if (session.status === 'cancelled') return; // already handled

    if (exitCode === 0) {
      session.status = 'completed';
      session.endedAt = Date.now();
      this.persistSessions();
      this.bus.dispatch({
        type: 'cli.completed',
        machineId: getMachineId(),
        sessionId,
        exitCode,
      });
    } else {
      session.status = 'failed';
      session.endedAt = Date.now();
      this.persistSessions();

      // Read stderr for error details
      let stderr = '';
      try {
        if (proc.stderr && typeof proc.stderr !== 'number') {
          stderr = await new Response(proc.stderr as ReadableStream).text();
        }
      } catch (err) {
        console.error(`[CliExecutor] Failed to read stderr for ${sessionId}:`, err);
      }

      this.bus.dispatch({
        type: 'cli.failed',
        machineId: getMachineId(),
        sessionId,
        exitCode,
        error: stderr || `Process exited with code ${exitCode}`,
      });
    }
  }

  list(): CliSession[] {
    return Array.from(this.sessions.values());
  }

  get(id: string): CliSession | undefined {
    return this.sessions.get(id);
  }

  async cancel(id: string): Promise<boolean> {
    const proc = this.processes.get(id);
    const session = this.sessions.get(id);
    if (!proc || !session || session.status !== 'running') return false;

    session.status = 'cancelled';
    session.endedAt = Date.now();
    this.persistSessions();
    this.clearTimeout(id);

    // Graceful shutdown: SIGINT → wait → SIGTERM → wait → SIGKILL
    try {
      proc.kill('SIGINT');
      await this.waitForExit(proc, CANCEL_SIGINT_WAIT);
      if (!proc.killed) {
        proc.kill('SIGTERM');
        await this.waitForExit(proc, CANCEL_SIGTERM_WAIT);
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }
    } catch (err) {
      console.error(`[CliExecutor] Error during graceful shutdown for ${id}:`, err);
      try { proc.kill('SIGKILL'); } catch (killErr) {
        console.error(`[CliExecutor] Failed to SIGKILL process ${id}:`, killErr);
      }
    }

    this.processes.delete(id);

    this.bus.dispatch({
      type: 'cli.cancelled',
      machineId: getMachineId(),
      sessionId: id,
    });

    return true;
  }

  private waitForExit(proc: Subprocess, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      proc.exited.then(() => {
        clearTimeout(timer);
        resolve();
      }).catch(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private clearTimeout(id: string): void {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  /** Clean up completed/failed sessions older than given age */
  pruneOldSessions(maxAgeMs: number = 60 * 60 * 1000): void {
    const now = Date.now();
    let pruned = false;
    for (const [id, session] of this.sessions) {
      if (session.status !== 'running' && session.endedAt && now - session.endedAt > maxAgeMs) {
        this.sessions.delete(id);
        pruned = true;
      }
    }
    if (pruned) this.persistSessions();
  }
}
