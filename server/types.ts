/**
 * Shared types for Agent Hub multi-machine support.
 * Phase 0: Machine identity, canonical IDs, and additive fields.
 */

import { hostname } from 'os';

// ---------------------------------------------------------------------------
// Machine identity (read once on module load)
// ---------------------------------------------------------------------------

export type AgentHubMode = 'agent' | 'aggregator';
export type MachineStatus = 'online' | 'degraded' | 'offline';

const _machineId = process.env.AGENT_MACHINE_ID || hostname();
const VALID_HUB_MODES: readonly AgentHubMode[] = ['agent', 'aggregator'];
const _rawMode = process.env.AGENT_HUB_MODE;
const _hubMode: AgentHubMode =
  _rawMode && VALID_HUB_MODES.includes(_rawMode as AgentHubMode)
    ? (_rawMode as AgentHubMode)
    : 'agent';

export function getMachineId(): string {
  return _machineId;
}

export function getHubMode(): AgentHubMode {
  return _hubMode;
}

// ---------------------------------------------------------------------------
// Canonical ID helpers
// ---------------------------------------------------------------------------

export function buildCanonicalId(machineId: string, id: string): string {
  return `${machineId}:${id}`;
}

export function parseCanonicalId(canonicalId: string): {
  machineId: string;
  id: string;
} {
  // Use lastIndexOf to handle machineId containing ':'
  const idx = canonicalId.lastIndexOf(':');
  if (idx === -1) return { machineId: '', id: canonicalId };
  return { machineId: canonicalId.slice(0, idx), id: canonicalId.slice(idx + 1) };
}

// ---------------------------------------------------------------------------
// Machine registry type (used by aggregator in Phase 2)
// ---------------------------------------------------------------------------

export interface Machine {
  id: string;
  name: string;
  endpoint: string;
  status: MachineStatus;
  lastSeen: number;
  agentVersion?: string;
  hostname?: string;
}

// ---------------------------------------------------------------------------
// machines.json config (aggregator mode)
// ---------------------------------------------------------------------------

export interface MachineConfig {
  id: string;
  name: string;
  baseUrl: string;
  tokenEnv?: string; // env var name holding the Bearer token — never store plaintext
}

export interface MachinesFileSchema {
  machines: MachineConfig[];
}
