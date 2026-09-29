import { useState, useRef, useEffect } from 'react';
import { Send, Square, ChevronDown } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { cn } from '../../lib/utils';

const TOOL_PRESETS = [
  { label: 'Safe', value: ['Read', 'Glob', 'Grep'] },
  { label: 'Normal', value: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash'] },
  { label: 'Full', value: [] },
] as const;

interface ChatInputProps {
  omcMode?: string | null;
  onOmcModeUsed?: () => void;
}

export default function ChatInput({ omcMode, onOmcModeUsed }: ChatInputProps) {
  const [text, setText] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [toolPreset, setToolPreset] = useState(1);
  const [showOptions, setShowOptions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { sendMessage, cancelSession, isStreaming } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Focus textarea when OMC mode is selected
  useEffect(() => {
    if (omcMode) textareaRef.current?.focus();
  }, [omcMode]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // OMC modes need all tools — force Full preset
    const isOmc = !!omcMode;
    const prompt = isOmc ? `/${omcMode} ${trimmed}` : trimmed;
    const preset = TOOL_PRESETS[isOmc ? 2 : toolPreset]; // 2 = Full

    sendMessage(prompt, {
      projectPath: selectedProject || undefined,
      allowedTools: preset.value.length > 0 ? [...preset.value] : undefined,
    });
    setText('');
    if (isOmc) onOmcModeUsed?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/80 px-3 sm:px-4 py-2 sm:py-3 safe-area-bottom">
      {/* Options row */}
      {showOptions && (
        <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-zinc-800">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="text-[11px] bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-zinc-300 outline-none focus:border-indigo-500 max-w-[160px]"
          >
            <option value="">현재 디렉토리</option>
            {projects.map((p) => (
              <option key={p.id} value={p.path}>{p.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {TOOL_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setToolPreset(idx)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-md transition-colors',
                  toolPreset === idx
                    ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-600/40'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5 sm:gap-2">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className={cn(
            'shrink-0 p-1.5 rounded-lg transition-colors',
            showOptions ? 'text-indigo-400 bg-indigo-600/10' : 'text-zinc-500 hover:text-zinc-300',
          )}
          title="옵션"
        >
          <ChevronDown size={14} className={cn('transition-transform', showOptions && 'rotate-180')} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={omcMode ? `/${omcMode} 프롬프트를 입력하세요...` : '메시지 입력...'}
          rows={1}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500 resize-none min-w-0"
          disabled={isStreaming}
        />

        {isStreaming ? (
          <button
            onClick={cancelSession}
            className="shrink-0 p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            title="중지"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className={cn(
              'shrink-0 p-2 rounded-lg transition-colors',
              text.trim()
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-zinc-800 text-zinc-600',
            )}
            title="전송"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
