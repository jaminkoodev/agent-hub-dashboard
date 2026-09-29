import type { CliStreamEvent } from '../services/cliExecutor.ts';

export type BusEvent =
  | { type: 'omc.mode.changed'; machineId: string; mode: string; active: boolean; data: Record<string, unknown> }
  | { type: 'omc.error'; machineId: string; toolName: string; error: string; retryCount: number }
  | { type: 'cli.started'; machineId: string; sessionId: string; prompt: string; projectPath: string }
  | { type: 'cli.stream'; machineId: string; sessionId: string; event: CliStreamEvent }
  | { type: 'cli.completed'; machineId: string; sessionId: string; exitCode: number }
  | { type: 'cli.failed'; machineId: string; sessionId: string; exitCode: number; error: string }
  | { type: 'cli.cancelled'; machineId: string; sessionId: string };
