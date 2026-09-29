/**
 * Loads the machine registry from machines.json.
 * Token values are never stored — only env var names (tokenEnv).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { MachineConfig, MachinesFileSchema } from '../types.ts';

const DEFAULT_PATHS = [
  resolve(process.cwd(), 'machines.json'),
  resolve(process.env.HOME ?? '', '.config/agent-hub/machines.json'),
];

export function loadMachines(): MachineConfig[] {
  const configPath = process.env.MACHINES_CONFIG_PATH
    ?? DEFAULT_PATHS.find((p) => existsSync(p));

  if (!configPath || !existsSync(configPath)) {
    console.warn('[MachinesLoader] No machines.json found. Aggregator has no upstream agents.');
    return [];
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed: MachinesFileSchema = JSON.parse(raw);

    if (!Array.isArray(parsed.machines)) {
      throw new Error('machines.json must have a "machines" array');
    }

    const machines: MachineConfig[] = [];
    for (const m of parsed.machines) {
      if (!m.id || !m.baseUrl) {
        console.warn(`[MachinesLoader] Skipping machine entry with missing id or baseUrl:`, m);
        continue;
      }
      machines.push({
        id: m.id,
        name: m.name || m.id,
        baseUrl: m.baseUrl.replace(/\/+$/, ''), // strip trailing slash
        tokenEnv: m.tokenEnv,
      });
    }

    console.log(`[MachinesLoader] Loaded ${machines.length} machine(s) from ${configPath}`);
    return machines;
  } catch (err) {
    console.error(`[MachinesLoader] Failed to load machines.json from ${configPath}:`, err);
    return [];
  }
}

/**
 * Resolve the Bearer token for a machine from its tokenEnv.
 * Returns undefined if tokenEnv is not set or the env var is empty.
 */
export function resolveToken(machine: MachineConfig): string | undefined {
  if (!machine.tokenEnv) return undefined;
  const token = process.env[machine.tokenEnv];
  if (!token) {
    console.warn(`[MachinesLoader] Token env ${machine.tokenEnv} for machine "${machine.id}" is not set`);
  }
  return token || undefined;
}
