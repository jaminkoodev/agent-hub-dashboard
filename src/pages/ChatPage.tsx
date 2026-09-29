import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Trash2, ExternalLink, Loader2, List, X } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useCliStore, type CliSessionInfo } from '../stores/cliStore';
import { useWsStore } from '../stores/wsStore';
import { useOmcStore } from '../stores/omcStore';
import ChatMessage from '../components/chat/ChatMessage';
import ChatInput from '../components/chat/ChatInput';
import OmcCommandBar from '../components/chat/OmcCommandBar';
import { cn } from '../lib/utils';

function SessionItem({ session, isActive, onClick }: {
  session: CliSessionInfo;
  isActive: boolean;
  onClick: () => void;
}) {
  const mins = session.startedAt
    ? Math.floor((Date.now() - session.startedAt) / 60000)
    : 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors min-h-[44px]',
        isActive ? 'bg-indigo-600/20 border border-indigo-600/30' : 'hover:bg-zinc-800 active:bg-zinc-800',
      )}
    >
      <div className="flex items-center gap-2">
        {session.status === 'running' && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        )}
        <span className="text-[12px] text-zinc-300 truncate flex-1">
          {session.prompt.slice(0, 50)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className={cn(
          'text-[9px] px-1.5 py-0.5 rounded',
          session.status === 'running' ? 'text-emerald-400 bg-emerald-900/30' :
          session.status === 'completed' ? 'text-zinc-400 bg-zinc-800' :
          session.status === 'failed' ? 'text-red-400 bg-red-900/30' :
          'text-zinc-500 bg-zinc-800',
        )}>
          {session.status}
        </span>
        <span className="text-[9px] text-zinc-600">{mins}분 전</span>
      </div>
    </button>
  );
}

export default function ChatPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSessions, setShowSessions] = useState(false);
  const { messages, currentSessionId, claudeSessionId, isStreaming, isLoadingSession, error, clearMessages, loadSession } = useChatStore();
  const { sessions, fetchSessions } = useCliStore();
  const ws = useWsStore();
  const { fetchStatus } = useOmcStore();

  useEffect(() => {
    fetchSessions();
    fetchStatus();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions, fetchStatus]);

  useEffect(() => {
    ws.send({ event: 'subscribe', sessionId: 'cli:*' });
    return () => { ws.send({ event: 'unsubscribe', sessionId: 'cli:*' }); };
  }, [ws.send]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [pendingOmcMode, setPendingOmcMode] = useState<string | null>(null);

  const handleOmcCommand = (command: string) => {
    if (command === '/stop') {
      fetch('/api/omc/autopilot/stop', { method: 'POST' }).catch(() => {});
      fetch('/api/omc/ralph/stop', { method: 'POST' }).catch(() => {});
      fetch('/api/omc/ultrawork/stop', { method: 'POST' }).catch(() => {});
      fetch('/api/omc/team/stop', { method: 'POST' }).catch(() => {});
      setPendingOmcMode(null);
      return;
    }
    const mode = command.slice(1);
    // Toggle: clicking the same mode again deactivates it
    setPendingOmcMode((prev) => (prev === mode ? null : mode));
  };

  // Session sidebar content (shared between desktop sidebar and mobile overlay)
  const sessionListContent = (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 shrink-0">
        <span className="text-[13px] font-medium text-zinc-300">CLI 세션</span>
        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="새 대화"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowSessions(false)}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors md:hidden"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 ? (
          <p className="text-[12px] text-zinc-600 text-center py-8">세션 없음</p>
        ) : (
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === currentSessionId}
              onClick={() => {
                  loadSession(session.id);
                  setShowSessions(false);
                }}
            />
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Desktop: static sidebar */}
      <div className="hidden md:flex md:w-56 md:shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/30">
        {sessionListContent}
      </div>

      {/* Mobile: fullscreen overlay */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="md:hidden fixed inset-0 z-50 flex flex-col bg-zinc-950"
          >
            {sessionListContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* OMC command bar */}
        <OmcCommandBar onCommand={handleOmcCommand} pendingMode={pendingOmcMode} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingSession ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="text-indigo-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 flex items-center justify-center mb-4">
                <MessageSquare size={28} className="text-indigo-400" />
              </div>
              <h2 className="text-base font-medium text-zinc-300 mb-1">Claude CLI 채팅</h2>
              <p className="text-[13px] text-zinc-500 max-w-xs leading-relaxed">
                메시지를 보내면 Claude CLI가 실행되어 실시간으로 응답합니다.
              </p>
              {sessions.length > 0 && (
                <button
                  onClick={() => setShowSessions(true)}
                  className="mt-4 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors md:hidden"
                >
                  <List size={14} />
                  이전 세션 보기 ({sessions.length})
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-3 sm:space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLastMessage={idx === messages.length - 1}
                    isStreaming={isStreaming && idx === messages.length - 1}
                  />
                ))}
              </AnimatePresence>

              {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex items-center gap-2 pl-9">
                  <Loader2 size={14} className="text-indigo-400 animate-spin" />
                  <span className="text-[11px] text-zinc-500">Claude 응답 중...</span>
                </div>
              )}

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2 ml-9">
                  <p className="text-[12px] text-red-400">{error}</p>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput omcMode={pendingOmcMode} onOmcModeUsed={() => setPendingOmcMode(null)} />

        {/* Session bar */}
        <div className="px-3 sm:px-4 py-1.5 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          {currentSessionId ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-zinc-600 font-mono truncate">
                {currentSessionId.slice(0, 12)}
              </span>
              {claudeSessionId && (
                <span className="text-[9px] text-indigo-400/70 bg-indigo-600/10 px-1 rounded">resume</span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-zinc-600">새 대화</span>
          )}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowSessions(true)}
              className="text-[11px] text-zinc-400 hover:text-zinc-300 flex items-center gap-1 py-1 transition-colors md:hidden"
            >
              <List size={12} />
              세션
              {sessions.length > 0 && (
                <span className="text-[9px] bg-zinc-800 px-1 rounded">{sessions.length}</span>
              )}
            </button>
            {currentSessionId && (
              <button
                onClick={() => {}}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 py-1 transition-colors"
              >
                <ExternalLink size={11} />
                상세
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
