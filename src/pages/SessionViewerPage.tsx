import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Bot, Wrench, Clock, Cpu, Hash, MessageSquare } from 'lucide-react';
import { useSessionStore, type SessionTurn } from '../stores/sessionStore';
import { useProjectStore } from '../stores/projectStore';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n > 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n > 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function TurnCard({ turn }: { turn: SessionTurn }) {
  const isUser = turn.type === 'user';
  const isAssistant = turn.type === 'assistant';
  const isTool = turn.type === 'tool_use' || turn.type === 'tool_result';

  if (!isUser && !isAssistant && !isTool) return null;

  const time = turn.timestamp
    ? new Date(turn.timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className={`flex gap-3 ${isUser ? '' : 'pl-2'}`}>
      <div className="shrink-0 mt-1">
        {isUser ? (
          <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center">
            <User size={12} className="text-indigo-400" />
          </div>
        ) : isTool ? (
          <div className="w-6 h-6 rounded-full bg-amber-600/20 flex items-center justify-center">
            <Wrench size={12} className="text-amber-400" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center">
            <Bot size={12} className="text-emerald-400" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-zinc-400">
            {isUser ? 'User' : isTool ? (turn.toolName ?? 'Tool') : 'Assistant'}
          </span>
          {turn.model && (
            <span className="text-[9px] text-zinc-600 font-mono">{turn.model}</span>
          )}
          <span className="text-[9px] text-zinc-600">{time}</span>
          {turn.tokens && (
            <span className="text-[9px] text-zinc-600">
              {formatTokens(turn.tokens.input + turn.tokens.output)} tok
            </span>
          )}
        </div>
        {turn.content && (
          <div className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-words bg-zinc-800/30 rounded-lg px-3 py-2 max-h-60 overflow-y-auto">
            {turn.content.length > 2000 ? turn.content.slice(0, 2000) + '...' : turn.content}
          </div>
        )}
        {turn.toolName && (
          <div className="text-[11px] font-mono">
            <span className="text-amber-400">{turn.toolName}</span>
            {turn.toolInput && (
              <pre className="mt-1 text-[10px] text-zinc-500 bg-zinc-800/50 rounded px-2 py-1 max-h-20 overflow-hidden">
                {turn.toolInput}
              </pre>
            )}
            {turn.toolResult && (
              <pre className="mt-1 text-[10px] text-zinc-400 bg-zinc-800/50 rounded px-2 py-1 max-h-20 overflow-hidden">
                {turn.toolResult.length > 200
                  ? turn.toolResult.slice(0, 200) + '...'
                  : turn.toolResult}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionViewerPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { projects } = useProjectStore();
  const {
    currentSession,
    currentSummary,
    detailLoading,
    fetchSessionDetail,
    fetchSessionSummary,
    clearSession,
  } = useSessionStore();

  useEffect(() => {
    if (projectId && sessionId) {
      fetchSessionSummary(projectId, sessionId);
      fetchSessionDetail(projectId, sessionId);
    }
    return () => clearSession();
  }, [projectId, sessionId, fetchSessionDetail, fetchSessionSummary, clearSession]);

  const project = projects.find(p => p.id === projectId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[12px] sm:text-[13px] text-zinc-400 truncate">{project?.name ?? projectId}</span>
              <span className="text-zinc-600 hidden sm:inline">/</span>
              <span className="text-[12px] sm:text-[13px] font-mono text-zinc-200 truncate hidden sm:inline">
                {sessionId?.slice(0, 12)}...
              </span>
            </div>
            {currentSummary && (
              <div className="flex items-center gap-2 sm:gap-4 mt-0.5 text-[10px] sm:text-[11px] text-zinc-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Hash size={10} />
                  {currentSummary.turnCount} 턴
                </span>
                {currentSession && (
                  <>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDuration(currentSession.duration)}
                    </span>
                    <span className="flex items-center gap-1 hidden sm:flex">
                      <Cpu size={10} />
                      {formatTokens(
                        currentSession.totalTokens.input + currentSession.totalTokens.output
                      )}{' '}
                      tok
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('/chat')}
            className="shrink-0 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] text-indigo-400 hover:bg-indigo-600/10 transition-colors"
            title="채팅에서 대화 이어가기"
          >
            <MessageSquare size={13} />
            <span className="hidden sm:inline">대화 이어가기</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {detailLoading && !currentSession ? (
          <p className="text-zinc-500 text-[13px] py-12 text-center">세션 로딩 중...</p>
        ) : !currentSession ? (
          <p className="text-zinc-600 text-[13px] py-12 text-center">세션을 찾을 수 없습니다</p>
        ) : (
          <div className="max-w-4xl mx-auto px-3 py-3 sm:p-6">
            {/* Tool usage + subagents summary bar */}
            {(Object.keys(currentSession.toolUsage).length > 0 ||
              currentSession.subagents.length > 0) && (
              <div className="mb-6 flex flex-wrap gap-2">
                {Object.entries(currentSession.toolUsage)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([tool, count]) => (
                    <span
                      key={tool}
                      className="text-[10px] px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400"
                    >
                      <span className="text-amber-400">{tool}</span> {count}
                    </span>
                  ))}
                {currentSession.subagents.map((sa) => (
                  <span
                    key={sa.id}
                    className="text-[10px] px-2 py-1 bg-indigo-900/20 border border-indigo-800/30 rounded-md text-indigo-400"
                  >
                    {sa.type} — {sa.description?.slice(0, 30)}
                  </span>
                ))}
              </div>
            )}

            {/* Turn list */}
            <div className="space-y-4">
              {currentSession.turns.map((turn) => (
                <motion.div
                  key={turn.uuid}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <TurnCard turn={turn} />
                </motion.div>
              ))}
            </div>

            {currentSession.turns.length === 0 && (
              <p className="text-zinc-600 text-[13px] py-8 text-center">턴 데이터 없음</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
