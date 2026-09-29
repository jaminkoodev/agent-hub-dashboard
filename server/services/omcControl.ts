import { resolve } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';

const SUPPORTED_MODES = ['autopilot', 'ralph', 'ultrawork', 'team'] as const;
export type OmcMode = (typeof SUPPORTED_MODES)[number];

export interface StartModeOptions {
  prompt: string;
  maxIterations?: number;
  projectPath: string;
}

export class OmcControlService {
  isSupportedMode(mode: string): mode is OmcMode {
    return SUPPORTED_MODES.includes(mode as OmcMode);
  }

  async startMode(mode: OmcMode, opts: StartModeOptions): Promise<void> {
    const stateDir = resolve(opts.projectPath, '.omc/state');
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }

    const stateFile = resolve(stateDir, `${mode}-state.json`);
    const state = {
      active: true,
      started_at: new Date().toISOString(),
      original_prompt: opts.prompt,
      iteration: 0,
      max_iterations: opts.maxIterations ?? (mode === 'ralph' ? 50 : 10),
      project_path: opts.projectPath,
    };

    await Bun.write(stateFile, JSON.stringify(state, null, 2));
  }

  async stopMode(mode: OmcMode, projectPath?: string): Promise<boolean> {
    const basePath = projectPath || process.cwd();
    const stateFile = resolve(basePath, '.omc/state', `${mode}-state.json`);

    if (!existsSync(stateFile)) return false;

    try {
      const content = readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(content);
      state.active = false;
      state.stopped_at = new Date().toISOString();
      await Bun.write(stateFile, JSON.stringify(state, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  getModeState(mode: OmcMode, projectPath?: string): Record<string, unknown> | null {
    const basePath = projectPath || process.cwd();
    const stateFile = resolve(basePath, '.omc/state', `${mode}-state.json`);

    if (!existsSync(stateFile)) return null;

    try {
      return JSON.parse(readFileSync(stateFile, 'utf-8'));
    } catch {
      return null;
    }
  }
}
