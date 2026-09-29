import { create } from 'zustand';
import { useWsStore } from './wsStore';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  model?: string;
  isPartial?: boolean;
}

export interface SendOptions {
  projectPath?: string;
  allowedTools?: string[];
  continueSession?: string;
  bare?: boolean;
  appendSystemPrompt?: string;
}

interface ChatStore {
  messages: ChatMessage[];
  currentSessionId: string | null;
  claudeSessionId: string | null; // Claude's own session ID for --resume
  isStreaming: boolean;
  isLoadingSession: boolean;
  error: string | null;

  sendMessage: (prompt: string, opts?: SendOptions) => Promise<void>;
  cancelSession: () => Promise<void>;
  clearMessages: () => void;
  setSessionId: (id: string | null) => void;
  loadSession: (cliSessionId: string) => Promise<void>;
  addStreamEvent: (event: Record<string, unknown>) => void;
}

/** Convert raw stream-json events from the server into ChatMessages */
function parseStreamEvents(events: Array<Record<string, unknown>>): { messages: ChatMessage[]; claudeSessionId: string | null } {
  const messages: ChatMessage[] = [];
  let claudeSessionId: string | null = null;

  for (const ev of events) {
    const type = ev.type as string;
    const timestamp = (ev.timestamp as string) ?? new Date().toISOString();

    if (ev.session_id && !claudeSessionId) {
      claudeSessionId = ev.session_id as string;
    }

    if (type === 'assistant' && ev.message) {
      const msg = ev.message as Record<string, unknown>;
      const content = msg.content as Array<Record<string, unknown>> | undefined;
      if (!content) continue;

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: block.text as string,
            timestamp,
            model: msg.model as string | undefined,
          });
        }
        if (block.type === 'tool_use') {
          messages.push({
            id: crypto.randomUUID(),
            role: 'tool_use',
            content: '',
            timestamp,
            toolName: block.name as string,
            toolInput: JSON.stringify(block.input ?? {}, null, 2).slice(0, 500),
          });
        }
        if (block.type === 'tool_result') {
          messages.push({
            id: crypto.randomUUID(),
            role: 'tool_result',
            content: '',
            timestamp,
            toolResult: typeof block.content === 'string'
              ? block.content.slice(0, 500)
              : JSON.stringify(block.content).slice(0, 500),
          });
        }
      }
    }

    if (type === 'human' && ev.message) {
      const msg = ev.message as Record<string, unknown>;
      const content = msg.content as Array<Record<string, unknown>> | string | undefined;
      if (typeof content === 'string') {
        messages.push({ id: crypto.randomUUID(), role: 'user', content, timestamp });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            messages.push({ id: crypto.randomUUID(), role: 'user', content: block.text as string, timestamp });
          }
        }
      }
    }

    if (type === 'result' && ev.result) {
      messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: ev.result as string,
        timestamp,
      });
    }
  }

  return { messages, claudeSessionId };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  currentSessionId: null,
  claudeSessionId: null,
  isStreaming: false,
  isLoadingSession: false,
  error: null,

  sendMessage: async (prompt, opts) => {
    const { claudeSessionId } = get();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], isStreaming: true, error: null }));

    try {
      const res = await fetch('/api/cli/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          projectPath: opts?.projectPath,
          allowedTools: opts?.allowedTools,
          // Auto-resume if we have a Claude session ID and no explicit override
          continueSession: opts?.continueSession ?? claudeSessionId ?? undefined,
          bare: opts?.bare,
          appendSystemPrompt: opts?.appendSystemPrompt,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        set({ isStreaming: false, error: (err as any).error ?? 'Request failed' });
        return;
      }

      const data = await res.json() as { sessionId: string };
      set({ currentSessionId: data.sessionId });

      const ws = useWsStore.getState();
      ws.send({ event: 'subscribe', sessionId: data.sessionId });
    } catch (err: any) {
      set({ isStreaming: false, error: err.message });
    }
  },

  cancelSession: async () => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    try {
      await fetch(`/api/cli/sessions/${currentSessionId}/cancel`, { method: 'POST' });
      set({ isStreaming: false });
    } catch {}
  },

  clearMessages: () => set({
    messages: [], currentSessionId: null, claudeSessionId: null,
    isStreaming: false, error: null, isLoadingSession: false,
  }),

  setSessionId: (id) => set({ currentSessionId: id }),

  loadSession: async (cliSessionId) => {
    set({ isLoadingSession: true, error: null });

    try {
      const res = await fetch(`/api/cli/sessions/${cliSessionId}`);
      if (!res.ok) {
        set({ isLoadingSession: false, error: 'Failed to load session' });
        return;
      }

      const data = await res.json() as {
        id: string;
        claudeSessionId?: string;
        status: string;
        prompt: string;
        messages: Array<Record<string, unknown>>;
      };

      const { messages, claudeSessionId: parsedClaudeId } = parseStreamEvents(data.messages ?? []);
      const resolvedClaudeId = data.claudeSessionId ?? parsedClaudeId;

      set({
        messages,
        currentSessionId: cliSessionId,
        claudeSessionId: resolvedClaudeId,
        isStreaming: data.status === 'running',
        isLoadingSession: false,
      });

      // Subscribe to live updates if still running
      if (data.status === 'running') {
        const ws = useWsStore.getState();
        ws.send({ event: 'subscribe', sessionId: cliSessionId });
      }
    } catch (err: any) {
      set({ isLoadingSession: false, error: err.message });
    }
  },

  addStreamEvent: (event) => {
    const type = event.type as string;
    const eventSessionId = event.sessionId as string | undefined;
    const { currentSessionId } = get();

    if (eventSessionId && currentSessionId && eventSessionId !== currentSessionId) return;

    if (type === 'cli.completed' || type === 'cli.cancelled') {
      set({ isStreaming: false });
      return;
    }

    if (type === 'cli.failed') {
      set({ isStreaming: false, error: (event.error as string) ?? 'CLI process failed' });
      return;
    }

    if (type !== 'cli.stream') return;

    const streamEvent = event.event as Record<string, unknown>;
    if (!streamEvent) return;

    // Capture Claude session ID
    if (streamEvent.session_id && !get().claudeSessionId) {
      set({ claudeSessionId: streamEvent.session_id as string });
    }

    const subtype = streamEvent.type as string;

    if (subtype === 'assistant' && streamEvent.message) {
      const msg = streamEvent.message as Record<string, unknown>;
      const content = msg.content as Array<Record<string, unknown>> | undefined;
      if (!content) return;

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          set((s) => {
            const last = s.messages[s.messages.length - 1];
            if (last?.role === 'assistant' && last.isPartial) {
              const updated = [...s.messages];
              updated[updated.length - 1] = { ...last, content: block.text as string, isPartial: false };
              return { messages: updated };
            }
            return {
              messages: [...s.messages, {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: block.text as string,
                timestamp: (streamEvent.timestamp as string) ?? new Date().toISOString(),
                model: msg.model as string | undefined,
              }],
            };
          });
        }
        if (block.type === 'tool_use') {
          set((s) => ({
            messages: [...s.messages, {
              id: crypto.randomUUID(),
              role: 'tool_use' as const,
              content: '',
              timestamp: (streamEvent.timestamp as string) ?? new Date().toISOString(),
              toolName: block.name as string,
              toolInput: JSON.stringify(block.input ?? {}, null, 2).slice(0, 500),
            }],
          }));
        }
        if (block.type === 'tool_result') {
          set((s) => ({
            messages: [...s.messages, {
              id: crypto.randomUUID(),
              role: 'tool_result' as const,
              content: '',
              timestamp: (streamEvent.timestamp as string) ?? new Date().toISOString(),
              toolResult: typeof block.content === 'string' ? block.content.slice(0, 500) : JSON.stringify(block.content).slice(0, 500),
            }],
          }));
        }
      }
      return;
    }

    if (subtype === 'content_block_delta') {
      const delta = streamEvent.content_block_delta as Record<string, unknown> | undefined
        ?? streamEvent.delta as Record<string, unknown> | undefined;
      if (!delta) return;
      const text = (delta.text as string) ?? '';
      if (!text) return;

      set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last?.role === 'assistant') {
          const updated = [...s.messages];
          updated[updated.length - 1] = { ...last, content: last.content + text, isPartial: true };
          return { messages: updated };
        }
        return {
          messages: [...s.messages, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: text,
            timestamp: new Date().toISOString(),
            isPartial: true,
          }],
        };
      });
      return;
    }

    if (subtype === 'result') {
      const result = (streamEvent.result as string) ?? '';
      if (result) {
        set((s) => ({
          messages: [...s.messages, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: result,
            timestamp: (streamEvent.timestamp as string) ?? new Date().toISOString(),
          }],
        }));
      }
      set({ isStreaming: false });
    }
  },
}));
