/**
 * sessionParser.ts
 *
 * Parses Claude Code JSONL session files from ~/.claude/projects/<projectId>/<sessionId>.jsonl
 *
 * Actual JSONL record shapes observed:
 *
 * top-level `type` values:
 *   "user"             — human turn; message.content is string OR array of
 *                        {type:"text",text:string} | {type:"tool_result",tool_use_id,content:[{type:"text",text}]}
 *   "assistant"        — model response; message.content is array of
 *                        {type:"text",text} | {type:"thinking",thinking} | {type:"tool_use",id,name,input:{...}}
 *   "progress"         — internal progress; data.type is "hook_progress" | "agent_progress"
 *                        agent_progress carries data.message (a user/assistant mini-record)
 *   "system"           — metadata; subtype is "stop_hook_summary" | "turn_duration" | ...
 *   "queue-operation"  — internal queue bookkeeping, ignored
 *   "file-history-snapshot" — ignored
 *   "last-prompt"      — ignored
 *
 * Token counts live in: record.message.usage.{input_tokens, output_tokens,
 *   cache_creation_input_tokens, cache_read_input_tokens}
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';
import { homedir } from 'os';
import { getMachineId, buildCanonicalId } from '../types.ts';

const CLAUDE_HOME = process.env.CLAUDE_HOME ?? resolve(homedir(), '.claude');
const PROJECTS_DIR = resolve(CLAUDE_HOME, 'projects');

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SessionTurn {
  /** Top-level record type: "user" | "assistant" | "progress" | "system" | other */
  type: string;
  uuid: string;
  timestamp: string;
  /** Extracted plain-text content for user/assistant text turns */
  content?: string;
  /** Name of the tool being called (from assistant tool_use content block) */
  toolName?: string;
  /** Serialised tool input, truncated to 500 chars */
  toolInput?: string;
  /** Serialised tool result, truncated to 500 chars */
  toolResult?: string;
  /** Model name, present on assistant records */
  model?: string;
  tokens?: { input: number; output: number };
  parentUuid?: string | null;
  isSidechain?: boolean;
}

export interface SessionDetail {
  machineId: string;
  canonicalId: string;
  id: string;
  projectId: string;
  turns: SessionTurn[];
  totalTokens: { input: number; output: number };
  /** Distinct model identifiers seen in this session */
  models: string[];
  /** Frequency map: toolName → invocation count */
  toolUsage: Record<string, number>;
  /** Milliseconds between first and last timestamp, 0 if unknown */
  duration: number;
  subagents: SubagentInfo[];
}

export interface SubagentInfo {
  id: string;
  /** e.g. "security-reviewer", "oh-my-claudecode:architect" */
  type: string;
  description: string;
}

export interface SessionSummary {
  id: string;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Internal raw-record types (loosely typed — the actual shape varies a lot)
// ---------------------------------------------------------------------------

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface RawContentBlock {
  type: string;
  // text block
  text?: string;
  // thinking block
  thinking?: string;
  // tool_use block (on assistant records)
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result block (on user records)
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

interface RawMessage {
  role?: string;
  model?: string;
  content?: string | RawContentBlock[];
  usage?: RawUsage;
}

interface RawRecord {
  type: string;
  uuid?: string;
  timestamp?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  // user / assistant
  message?: RawMessage;
  // system
  subtype?: string;
  durationMs?: number;
  // progress
  data?: {
    type?: string;
    message?: {
      type?: string;
      message?: RawMessage;
      uuid?: string;
      timestamp?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(value: unknown, maxLen = 500): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/**
 * Extract readable text from a message content field which can be:
 *   - a plain string
 *   - an array of content blocks (text / thinking / tool_use / tool_result)
 * Returns only the text portions joined by newlines.
 */
function extractText(content: string | RawContentBlock[] | undefined): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content || undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) parts.push(block.text);
    if (block.type === 'thinking' && block.thinking) parts.push(`[thinking] ${block.thinking}`);
  }
  return parts.length ? parts.join('\n') : undefined;
}

/**
 * Extract tool_result text from a user message whose content is an array
 * of tool_result blocks.
 */
function extractToolResultText(
  content: string | RawContentBlock[] | undefined,
): string | undefined {
  if (!content || typeof content === 'string') return undefined;
  for (const block of content) {
    if (block.type === 'tool_result') {
      const inner = block.content;
      if (typeof inner === 'string') return inner || undefined;
      if (Array.isArray(inner)) {
        const texts = inner
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text as string);
        return texts.join('\n') || undefined;
      }
    }
  }
  return undefined;
}

/**
 * Extract the first tool_use block from an assistant message content array.
 */
function extractToolUse(
  content: string | RawContentBlock[] | undefined,
): { name: string; input: Record<string, unknown> } | undefined {
  if (!content || typeof content === 'string') return undefined;
  for (const block of content) {
    if (block.type === 'tool_use' && block.name) {
      return { name: block.name, input: block.input ?? {} };
    }
  }
  return undefined;
}

function parseJsonlFile(filePath: string): RawRecord[] {
  const raw = readFileSync(filePath, 'utf-8');
  const records: RawRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as RawRecord);
    } catch (err) {
      // Skip malformed lines gracefully
      console.debug('[SessionParser] Skipped malformed JSONL line:', err);
    }
  }
  return records;
}

function sessionFilePath(projectId: string, sessionId: string): string {
  return join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);
}

function subagentsDirPath(projectId: string, sessionId: string): string {
  return join(PROJECTS_DIR, projectId, sessionId, 'subagents');
}

// ---------------------------------------------------------------------------
// SessionParserService
// ---------------------------------------------------------------------------

export class SessionParserService {
  /**
   * Parse a session file into structured turns.
   *
   * Only "user" and "assistant" top-level records are surfaced as turns;
   * "progress" / "system" / queue records are skipped (they are internal
   * Claude Code bookkeeping that clutters the readable history).
   *
   * @param offset  Skip this many qualifying turns before returning results.
   * @param limit   Return at most this many turns.
   */
  parseSession(
    projectId: string,
    sessionId: string,
    offset = 0,
    limit = 200,
  ): SessionDetail {
    const filePath = sessionFilePath(projectId, sessionId);

    if (!existsSync(filePath)) {
      return this._emptyDetail(projectId, sessionId);
    }

    let records: RawRecord[] = [];
    try {
      records = parseJsonlFile(filePath);
    } catch (err) {
      console.error(`[SessionParser] Failed to parse session file ${filePath}:`, err);
      return this._emptyDetail(projectId, sessionId);
    }

    const allTurns: SessionTurn[] = [];
    const totalTokens = { input: 0, output: 0 };
    const modelSet = new Set<string>();
    const toolUsage: Record<string, number> = {};
    let firstTs: number | null = null;
    let lastTs: number | null = null;

    for (const rec of records) {
      // Update time range from any timestamped record
      if (rec.timestamp) {
        const ms = Date.parse(rec.timestamp);
        if (!isNaN(ms)) {
          if (firstTs === null || ms < firstTs) firstTs = ms;
          if (lastTs === null || ms > lastTs) lastTs = ms;
        }
      }

      const recType = rec.type;

      // ---- "user" records -----------------------------------------------
      if (recType === 'user') {
        const msg = rec.message;
        const content = msg?.content;

        // Determine if this is a plain user message or a tool-result carrier
        const toolResultText = extractToolResultText(content);
        const turn: SessionTurn = {
          type: 'user',
          uuid: rec.uuid ?? '',
          timestamp: rec.timestamp ?? '',
          parentUuid: rec.parentUuid ?? null,
          isSidechain: rec.isSidechain,
        };

        if (toolResultText !== undefined) {
          // Tool result delivered back to the model
          turn.toolResult = truncate(toolResultText);
        } else {
          turn.content = extractText(content);
        }

        allTurns.push(turn);
        continue;
      }

      // ---- "assistant" records ------------------------------------------
      if (recType === 'assistant') {
        const msg = rec.message;
        if (!msg) continue;

        const model = msg.model;
        if (model) modelSet.add(model);

        // Accumulate tokens
        const usage = msg.usage;
        if (usage) {
          const inp =
            (usage.input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
          const out = usage.output_tokens ?? 0;
          totalTokens.input += inp;
          totalTokens.output += out;
        }

        const content = msg.content;
        const toolUse = extractToolUse(content);
        const turn: SessionTurn = {
          type: 'assistant',
          uuid: rec.uuid ?? '',
          timestamp: rec.timestamp ?? '',
          parentUuid: rec.parentUuid ?? null,
          isSidechain: rec.isSidechain,
          model,
        };

        if (usage) {
          const inp =
            (usage.input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
          turn.tokens = { input: inp, output: usage.output_tokens ?? 0 };
        }

        if (toolUse) {
          turn.toolName = toolUse.name;
          turn.toolInput = truncate(toolUse.input);
          toolUsage[toolUse.name] = (toolUsage[toolUse.name] ?? 0) + 1;
        }

        turn.content = extractText(content);

        allTurns.push(turn);
        continue;
      }

      // All other record types (progress, system, queue-operation, etc.) are
      // intentionally ignored — they carry no conversational content.
    }

    // Apply pagination
    const sliced = allTurns.slice(offset, offset + limit);

    const duration =
      firstTs !== null && lastTs !== null ? lastTs - firstTs : 0;

    const subagents = this.listSubagents(projectId, sessionId);

    const mid = getMachineId();
    return {
      machineId: mid,
      canonicalId: buildCanonicalId(mid, sessionId),
      id: sessionId,
      projectId,
      turns: sliced,
      totalTokens,
      models: Array.from(modelSet),
      toolUsage,
      duration,
      subagents,
    };
  }

  /**
   * Fast summary: reads only the first line, last line, counts lines, and
   * stats the file — avoids parsing the entire file.
   */
  getSessionSummary(projectId: string, sessionId: string): SessionSummary | null {
    const filePath = sessionFilePath(projectId, sessionId);
    if (!existsSync(filePath)) return null;

    let sizeBytes = 0;
    try {
      sizeBytes = statSync(filePath).size;
    } catch (err) {
      console.error(`[SessionParser] Error stat'ing file ${filePath}:`, err);
      return null;
    }

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    let firstTimestamp = '';
    let lastTimestamp = '';
    let turnCount = 0;

    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as RawRecord;
        if (rec.timestamp) {
          if (!firstTimestamp) firstTimestamp = rec.timestamp;
          lastTimestamp = rec.timestamp;
        }
        if (rec.type === 'user' || rec.type === 'assistant') turnCount++;
      } catch (err) {
        // Skip malformed lines
        console.debug('[SessionParser] Skipping malformed line:', err);
      }
    }

    return {
      id: sessionId,
      turnCount,
      firstTimestamp,
      lastTimestamp,
      sizeBytes,
    };
  }

  /**
   * List subagents for a session by scanning for *.meta.json files in
   * ~/.claude/projects/<projectId>/<sessionId>/subagents/
   *
   * Each meta.json has shape: { agentType: string, description: string }
   */
  listSubagents(projectId: string, sessionId: string): SubagentInfo[] {
    const dir = subagentsDirPath(projectId, sessionId);
    if (!existsSync(dir)) return [];

    const results: SubagentInfo[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      console.error(`[SessionParser] Error reading subagents directory ${dir}:`, err);
      return [];
    }

    for (const entry of entries) {
      if (!entry.endsWith('.meta.json')) continue;
      const metaPath = join(dir, entry);
      try {
        const raw = readFileSync(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as {
          agentType?: string;
          description?: string;
        };
        // Derive the id from the filename: "agent-<id>.meta.json" → "<id>"
        const id = basename(entry, '.meta.json').replace(/^agent-/, '');
        results.push({
          id,
          type: meta.agentType ?? 'unknown',
          description: meta.description ?? '',
        });
      } catch (err) {
        // Skip malformed meta files
        console.error(`[SessionParser] Error parsing meta file ${metaPath}:`, err);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _emptyDetail(projectId: string, sessionId: string): SessionDetail {
    const mid = getMachineId();
    return {
      machineId: mid,
      canonicalId: buildCanonicalId(mid, sessionId),
      id: sessionId,
      projectId,
      turns: [],
      totalTokens: { input: 0, output: 0 },
      models: [],
      toolUsage: {},
      duration: 0,
      subagents: [],
    };
  }
}
