import { watch, readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import { homedir } from 'os';
import type { MessageBus } from '../bus/index.ts';
import { getMachineId } from '../types.ts';

interface OmcModeState {
  active: boolean;
  started_at?: string;
  original_prompt?: string;
  session_id?: string;
  iteration?: number;
  max_iterations?: number;
  [key: string]: unknown;
}

const MODE_FILES: Record<string, string> = {
  'autopilot-state.json': 'autopilot',
  'ralph-state.json': 'ralph',
  'ultrawork-state.json': 'ultrawork',
  'team-state.json': 'team',
};

export class OmcWatcher {
  private stateDir: string;
  private watchers: ReturnType<typeof watch>[] = [];
  private lastStates = new Map<string, string>(); // hash to detect real changes
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private bus: MessageBus,
    private projectDir: string = process.cwd(),
  ) {
    this.stateDir = resolve(this.projectDir, '.omc/state');
  }

  start(): void {
    if (!existsSync(this.stateDir)) {
      console.log(`[OmcWatcher] .omc/state/ not found, starting poll mode`);
      this.startPolling();
      return;
    }

    // Initial scan
    this.scanAllStates();

    // Watch for changes
    try {
      const watcher = watch(this.stateDir, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        this.handleFileChange(filename);
      });
      this.watchers.push(watcher);
      console.log(`[OmcWatcher] Watching ${this.stateDir}`);
    } catch (err) {
      console.warn('[OmcWatcher] fs.watch failed, falling back to polling:', err);
      this.startPolling();
    }
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      if (existsSync(this.stateDir)) {
        this.scanAllStates();
      }
    }, 5000);
  }

  private scanAllStates(): void {
    try {
      const files = readdirSync(this.stateDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          this.handleFileChange(file);
        }
      }
    } catch (err) {
      console.error('[OmcWatcher] Error scanning state directory:', err);
    }
  }

  private handleFileChange(filename: string): void {
    const filePath = resolve(this.stateDir, filename);
    if (!existsSync(filePath)) return;

    try {
      const content = readFileSync(filePath, 'utf-8');

      // Skip if content unchanged
      const lastContent = this.lastStates.get(filename);
      if (lastContent === content) return;
      this.lastStates.set(filename, content);

      const data = JSON.parse(content);

      // Mode state files
      const mode = MODE_FILES[filename];
      if (mode) {
        this.bus.dispatch({
          type: 'omc.mode.changed',
          machineId: getMachineId(),
          mode,
          active: !!data.active,
          data,
        });
        return;
      }

      // Error tracking
      if (filename === 'last-tool-error.json') {
        this.bus.dispatch({
          type: 'omc.error',
          machineId: getMachineId(),
          toolName: data.tool_name ?? 'unknown',
          error: data.error ?? '',
          retryCount: data.retry_count ?? 0,
        });
        return;
      }
    } catch (err) {
      // Ignore parse errors (file might be mid-write) but log for diagnostics
      console.debug('[OmcWatcher] Parse error in handleFileChange:', err);
    }
  }

  getActiveModes(): Record<string, OmcModeState> {
    const modes: Record<string, OmcModeState> = {};
    for (const [filename, modeName] of Object.entries(MODE_FILES)) {
      const filePath = resolve(this.stateDir, filename);
      if (!existsSync(filePath)) continue;
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        if (data.active) {
          modes[modeName] = data;
        }
      } catch (err) {
        console.error(`[OmcWatcher] Error parsing ${filename}:`, err);
      }
    }
    return modes;
  }

  getAllActiveModes(): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};

    // Current project
    const currentModes = this.getActiveModes();
    if (Object.keys(currentModes).length > 0) {
      result[this.projectDir] = currentModes;
    }

    // Scan known project directories from ~/.claude/projects/
    const claudeHome = process.env.CLAUDE_HOME ?? resolve(homedir(), '.claude');
    const projectsDir = resolve(claudeHome, 'projects');
    if (existsSync(projectsDir)) {
      try {
        const dirs = readdirSync(projectsDir);
        for (const dir of dirs) {
          // Decode the slash-separated path stored in the project directory name.
          const realPath = '/' + dir.replace(/^-/, '').replace(/-/g, '/');
          if (realPath === this.projectDir) continue; // skip current (already added)
          const omcStateDir = resolve(realPath, '.omc/state');
          if (!existsSync(omcStateDir)) continue;

          const modes: Record<string, any> = {};
          for (const [filename, modeName] of Object.entries(MODE_FILES)) {
            const filePath = resolve(omcStateDir, filename);
            if (!existsSync(filePath)) continue;
            try {
              const data = JSON.parse(readFileSync(filePath, 'utf-8'));
              if (data.active) modes[modeName] = data;
            } catch (err) {
              console.error(`[OmcWatcher] Error parsing ${filePath}:`, err);
            }
          }
          if (Object.keys(modes).length > 0) {
            result[realPath] = modes;
          }
        }
      } catch (err) {
        console.error('[OmcWatcher] Error scanning project directories:', err);
      }
    }

    return result;
  }

  getLastError(): Record<string, unknown> | null {
    const filePath = resolve(this.stateDir, 'last-tool-error.json');
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.error('[OmcWatcher] Error reading last error:', err);
      return null;
    }
  }
}
