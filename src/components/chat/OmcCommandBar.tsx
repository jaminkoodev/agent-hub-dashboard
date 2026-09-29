import { useState } from 'react';
import { Zap, Brain, Users, Square, Repeat, FlaskConical, Rocket, GitBranch, Search, Bug, TestTube, HelpCircle, X, ChevronRight } from 'lucide-react';
import { useOmcStore } from '../../stores/omcStore';
import { cn } from '../../lib/utils';

interface OmcCommandBarProps {
  onCommand: (command: string) => void;
  pendingMode?: string | null;
}

const MODE_BUTTONS = [
  {
    mode: 'autopilot', icon: Zap, label: 'Autopilot',
    desc: '아이디어에서 완성 코드까지 자율 실행',
    color: 'text-emerald-400 bg-emerald-600/10 border-emerald-600/30 hover:bg-emerald-600/20',
  },
  {
    mode: 'ralph', icon: Brain, label: 'Ralph',
    desc: '아키텍트 검증 포함 반복 루프 실행',
    color: 'text-indigo-400 bg-indigo-600/10 border-indigo-600/30 hover:bg-indigo-600/20',
  },
  {
    mode: 'team', icon: Users, label: 'Team',
    desc: 'N개의 에이전트가 태스크를 분할 협업',
    color: 'text-amber-400 bg-amber-600/10 border-amber-600/30 hover:bg-amber-600/20',
  },
  {
    mode: 'ultrawork', icon: Rocket, label: 'Ultra',
    desc: '병렬 실행 엔진으로 고속 작업 처리',
    color: 'text-cyan-400 bg-cyan-600/10 border-cyan-600/30 hover:bg-cyan-600/20',
  },
  {
    mode: 'ultraqa', icon: TestTube, label: 'QA',
    desc: '테스트→검증→수정 반복 사이클',
    color: 'text-pink-400 bg-pink-600/10 border-pink-600/30 hover:bg-pink-600/20',
  },
  {
    mode: 'ccg', icon: GitBranch, label: 'CCG',
    desc: 'Claude-Codex-Gemini 3모델 협업',
    color: 'text-violet-400 bg-violet-600/10 border-violet-600/30 hover:bg-violet-600/20',
  },
  {
    mode: 'deepsearch', icon: Search, label: 'Search',
    desc: '코드베이스 심층 탐색',
    color: 'text-orange-400 bg-orange-600/10 border-orange-600/30 hover:bg-orange-600/20',
  },
  {
    mode: 'trace', icon: Bug, label: 'Trace',
    desc: '에이전트 실행 흐름 추적 및 분석',
    color: 'text-rose-400 bg-rose-600/10 border-rose-600/30 hover:bg-rose-600/20',
  },
  {
    mode: 'sciomc', icon: FlaskConical, label: 'Scientist',
    desc: '병렬 분석 에이전트로 종합 연구',
    color: 'text-teal-400 bg-teal-600/10 border-teal-600/30 hover:bg-teal-600/20',
  },
  {
    mode: 'ralplan', icon: Repeat, label: 'Plan',
    desc: '합의 기반 전략적 계획 수립',
    color: 'text-lime-400 bg-lime-600/10 border-lime-600/30 hover:bg-lime-600/20',
  },
] as const;

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300 whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700" />
      </div>
    </div>
  );
}

export default function OmcCommandBar({ onCommand, pendingMode }: OmcCommandBarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const { status } = useOmcStore();
  const activeModes = Object.entries(status.activeModes);

  // Show first 4 modes in the bar, rest in help panel
  const primaryModes = MODE_BUTTONS.slice(0, 5);
  const secondaryModes = MODE_BUTTONS.slice(5);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-zinc-600 shrink-0">OMC</span>

        {primaryModes.map(({ mode, icon: Icon, label, desc, color }) => {
          const isActive = status.activeModes[mode]?.active;
          const isPending = pendingMode === mode;
          return (
            <Tooltip key={mode} text={desc}>
              <button
                onClick={() => onCommand(`/${mode}`)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors shrink-0',
                  isActive || isPending
                    ? color
                    : 'text-zinc-500 bg-zinc-800/50 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600',
                )}
              >
                <Icon size={11} />
                {label}
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              </button>
            </Tooltip>
          );
        })}

        {/* More modes toggle */}
        <Tooltip text="더 많은 모드 보기">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={cn(
              'flex items-center gap-1 px-1.5 py-1 rounded-md border text-[11px] transition-colors shrink-0',
              showHelp
                ? 'text-zinc-300 bg-zinc-700/50 border-zinc-600'
                : 'text-zinc-500 bg-zinc-800/50 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600',
            )}
          >
            {showHelp ? <X size={11} /> : <ChevronRight size={11} />}
            <span className="hidden sm:inline">{showHelp ? '닫기' : '더보기'}</span>
          </button>
        </Tooltip>

        {/* Active mode indicators */}
        {activeModes.length > 0 && (
          <>
            <div className="w-px h-4 bg-zinc-700 shrink-0" />
            {activeModes.map(([mode, state]) => (
              <div key={mode} className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-emerald-400">
                  {mode}
                  {state.iteration !== undefined && ` #${state.iteration}`}
                </span>
                <button
                  onClick={() => onCommand('/stop')}
                  className="p-0.5 rounded text-red-400 hover:bg-red-600/20 transition-colors"
                  title="중지"
                >
                  <Square size={10} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* Help icon */}
        <div className="flex-1" />
        <Tooltip text="OMC 모드 도움말">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            <HelpCircle size={13} />
          </button>
        </Tooltip>
      </div>

      {/* Expanded help panel with all modes */}
      {showHelp && (
        <div className="px-3 sm:px-4 pb-2 pt-1 border-t border-zinc-800/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            {secondaryModes.map(({ mode, icon: Icon, label, desc, color }) => {
              const isActive = status.activeModes[mode]?.active;
              const isPending = pendingMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => {
                    onCommand(`/${mode}`);
                    setShowHelp(false);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-left transition-colors',
                    isActive || isPending
                      ? color
                      : 'text-zinc-500 bg-zinc-800/30 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600',
                  )}
                >
                  <Icon size={12} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium">{label}</div>
                    <div className="text-[9px] text-zinc-600 truncate">{desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[9px] text-zinc-600 mt-2">
            채팅에서 /{'{mode}'} 또는 버튼 클릭으로 활성화 · /stop으로 중지 · 프롬프트 입력 후 전송
          </p>
        </div>
      )}
    </div>
  );
}
