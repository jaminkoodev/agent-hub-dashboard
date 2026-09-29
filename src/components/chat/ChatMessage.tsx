import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Wrench, ChevronDown, ChevronRight, AlertCircle, Terminal } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '../../stores/chatStore';
import MarkdownRenderer from './MarkdownRenderer';
import StreamingText from './StreamingText';

interface ChatMessageProps {
  message: ChatMessageType;
  isLastMessage?: boolean;
  isStreaming?: boolean;
}

/** Detect if a tool is a "log-like" tool (Bash, terminal, Read, Glob, Grep) */
function isLogTool(toolName?: string): boolean {
  if (!toolName) return false;
  const logTools = ['Bash', 'bash', 'terminal', 'Read', 'Glob', 'Grep', 'ListFiles', 'SearchFiles'];
  return logTools.includes(toolName);
}

export default function ChatMessage({ message, isLastMessage, isStreaming }: ChatMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool_use' || message.role === 'tool_result';
  const isLog = isTool && isLogTool(message.toolName);

  const time = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Log-style tool messages: compact, muted, no avatar
  if (isLog && message.role === 'tool_use') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="ml-9 my-0.5"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors text-left w-full group"
        >
          <Terminal size={10} className="text-zinc-600 shrink-0" />
          {expanded
            ? <ChevronDown size={10} className="text-zinc-600" />
            : <ChevronRight size={10} className="text-zinc-600" />
          }
          <span className="text-[10px] font-mono text-zinc-500 truncate">{message.toolName}</span>
          {message.toolInput && (
            <span className="text-[10px] font-mono text-zinc-600 truncate flex-1">
              {message.toolInput.slice(0, 80).replace(/\n/g, ' ')}
            </span>
          )}
          <span className="text-[9px] text-zinc-700 shrink-0">{time}</span>
        </button>
        {expanded && message.toolInput && (
          <pre className="px-2.5 py-1.5 text-[10px] text-zinc-500 bg-zinc-900/50 rounded-b-md max-h-32 overflow-auto font-mono mt-px">
            {message.toolInput}
          </pre>
        )}
      </motion.div>
    );
  }

  if (isLog && message.role === 'tool_result') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="ml-9 my-0.5"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/20 hover:bg-zinc-800/40 transition-colors text-left w-full"
        >
          {expanded
            ? <ChevronDown size={10} className="text-zinc-600" />
            : <ChevronRight size={10} className="text-zinc-600" />
          }
          <span className="text-[10px] text-zinc-600">결과</span>
          {!expanded && message.toolResult && (
            <span className="text-[10px] font-mono text-zinc-600 truncate flex-1">
              {message.toolResult.slice(0, 100).replace(/\n/g, ' ')}
            </span>
          )}
        </button>
        {expanded && message.toolResult && (
          <pre className="px-2.5 py-1.5 text-[10px] text-zinc-500 bg-zinc-900/50 rounded-b-md max-h-32 overflow-auto font-mono mt-px">
            {message.toolResult}
          </pre>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? '' : 'pl-1'}`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        {isUser ? (
          <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center">
            <User size={12} className="text-indigo-400" />
          </div>
        ) : isTool ? (
          <div className="w-6 h-6 rounded-full bg-amber-600/20 flex items-center justify-center">
            <Wrench size={12} className="text-amber-400" />
          </div>
        ) : message.role === 'system' ? (
          <div className="w-6 h-6 rounded-full bg-red-600/20 flex items-center justify-center">
            <AlertCircle size={12} className="text-red-400" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center">
            <Bot size={12} className="text-emerald-400" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-zinc-400">
            {isUser ? 'You' : isTool ? (message.toolName ?? 'Tool') : 'Claude'}
          </span>
          {message.model && (
            <span className="text-[9px] text-zinc-600 font-mono">{message.model}</span>
          )}
          <span className="text-[9px] text-zinc-600">{time}</span>
        </div>

        {/* User / Assistant text — with markdown */}
        {(isUser || isAssistant) && message.content && (
          <div className={`rounded-lg px-3 py-2 ${
            isUser
              ? 'bg-indigo-600/10 border border-indigo-600/20'
              : 'bg-zinc-800/50'
          }`}>
            {isAssistant && isLastMessage && isStreaming ? (
              <StreamingText text={message.content} isStreaming />
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>
        )}

        {/* Tool use — non-log tools (collapsible) */}
        {message.role === 'tool_use' && (
          <div className="border border-amber-800/30 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-900/10 hover:bg-amber-900/20 transition-colors text-left"
            >
              {expanded ? <ChevronDown size={12} className="text-amber-400" /> : <ChevronRight size={12} className="text-amber-400" />}
              <span className="text-[11px] font-mono text-amber-400">{message.toolName}</span>
            </button>
            {expanded && message.toolInput && (
              <pre className="px-2.5 py-2 text-[10px] text-zinc-500 bg-zinc-900/50 max-h-40 overflow-auto">
                {message.toolInput}
              </pre>
            )}
          </div>
        )}

        {/* Tool result — non-log tools (collapsible) */}
        {message.role === 'tool_result' && message.toolResult && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors text-left"
            >
              {expanded ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
              <span className="text-[11px] text-zinc-400">결과</span>
            </button>
            {expanded && (
              <pre className="px-2.5 py-2 text-[10px] text-zinc-400 bg-zinc-900/50 max-h-40 overflow-auto">
                {message.toolResult}
              </pre>
            )}
          </div>
        )}

        {/* System error */}
        {message.role === 'system' && message.content && (
          <div className="bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
            <p className="text-[12px] text-red-400">{message.content}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
