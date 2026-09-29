import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Monitor, FolderOpen, FileText, AlertTriangle } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useOmcStore } from '../stores/omcStore';

function StatCard({ icon, label, value, sub, color = 'text-indigo-400' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 rounded-xl border border-zinc-800 p-3.5 flex items-start gap-3">
      <div className={`mt-0.5 ${color}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-white leading-tight">{value}</p>
        <p className="text-[13px] font-medium text-zinc-300">{label}</p>
        {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { projects, activeSessions, fetchProjects, fetchActiveSessions } = useProjectStore();
  const { status, fetchStatus } = useOmcStore();

  useEffect(() => {
    fetchProjects();
    fetchActiveSessions();
    fetchStatus();
    const interval = setInterval(() => {
      fetchActiveSessions();
      fetchStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects, fetchActiveSessions, fetchStatus]);

  const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);
  const activeModes = Object.entries(status.activeModes);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-5 lg:p-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <div>
        <h1 className="text-xl font-bold text-white">관제 센터</h1>
        <p className="text-[13px] text-zinc-500 mt-0.5">Claude/Codex CLI 세션 모니터링</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={<Monitor size={18} />} label="활성 세션" value={activeSessions.length} sub="실행 중" color="text-emerald-400" />
        <StatCard icon={<FolderOpen size={18} />} label="프로젝트" value={projects.length} sub="발견됨" color="text-indigo-400" />
        <StatCard icon={<FileText size={18} />} label="총 세션" value={totalSessions} sub="전체 기록" color="text-zinc-400" />
      </div>

      {/* Active sessions */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <h2 className="text-[13px] font-semibold text-zinc-300 mb-3">활성 세션</h2>
        {activeSessions.length === 0 ? (
          <p className="text-zinc-600 text-[13px] py-4 text-center">현재 실행 중인 세션 없음</p>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((session) => {
              const project = projects.find(p => p.id === session.projectId);
              const mins = Math.floor((Date.now() - session.startedAt) / 60000);
              return (
                <button
                  key={session.pid}
                  onClick={() => navigate(`/projects/${session.projectId}/sessions/${session.sessionId}`)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-zinc-200 truncate block">{project?.name ?? 'unknown'}</span>
                    <span className="text-[10px] text-zinc-500 sm:hidden">{mins}분</span>
                  </div>
                  <span className="text-[11px] text-zinc-500 hidden sm:inline">{mins}분</span>
                  <span className="text-[9px] font-mono text-zinc-600 hidden sm:inline">{session.sessionId.slice(0, 8)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* OMC modes (if any active) */}
      {(activeModes.length > 0 || status.lastError) && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <h2 className="text-[13px] font-semibold text-zinc-300 mb-3">OMC 상태</h2>
          <div className="space-y-2">
            {activeModes.map(([mode, state]) => (
              <div key={mode} className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[13px] font-medium text-zinc-200">{mode}</span>
                {state.iteration !== undefined && state.max_iterations !== undefined && (
                  <span className="ml-auto text-[11px] text-amber-400">iter {state.iteration}/{state.max_iterations}</span>
                )}
              </div>
            ))}
            {status.lastError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-900/30 rounded-lg">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-red-400 font-medium">{status.lastError.tool_name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{status.lastError.error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Projects grid */}
      {projects.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-zinc-300">프로젝트</h2>
            <button onClick={() => navigate('/projects')} className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors">
              전체 보기
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {projects.slice(0, 8).map((project) => {
              const isActive = activeSessions.some(s => s.projectId === project.id);
              return (
                <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)}
                  className="text-left px-3 py-2.5 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors">
                  <div className="flex items-center gap-1.5 mb-1">
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                    <span className="text-[12px] font-medium text-zinc-200 truncate">{project.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{project.sessionCount}개 세션</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
