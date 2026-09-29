import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen, Clock, FileText, Zap, ChevronRight, ArrowLeft } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useSessionStore } from '../stores/sessionStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function ProjectsPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { projects, fetchProjects } = useProjectStore();
  const { sessions, loading: sessionsLoading, fetchSessions } = useSessionStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projectId) fetchSessions(projectId);
  }, [projectId, fetchSessions]);

  // Mobile: if projectId is set, show sessions only (with back button)
  // Desktop: show split view
  const showProjectList = !projectId;
  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Project list — always on desktop, conditional on mobile */}
      <div className={`${projectId ? 'hidden md:flex' : 'flex'} w-full md:w-72 md:shrink-0 flex-col border-r border-zinc-800 overflow-y-auto bg-zinc-900/50`}>
        <div className="p-3 sm:p-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold text-white">프로젝트</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">{projects.length}개 프로젝트</p>
        </div>
        <div className="p-2 space-y-0.5">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                projectId === project.id
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="shrink-0" />
                <span className="text-[13px] font-medium truncate">{project.name}</span>
                <ChevronRight size={12} className="ml-auto shrink-0 text-zinc-600 md:hidden" />
              </div>
              <div className="flex items-center gap-3 mt-1 ml-5">
                <span className="text-[10px] text-zinc-600">{project.sessionCount}개 세션</span>
                {project.lastActivity && (
                  <span className="text-[10px] text-zinc-600">{formatRelativeTime(project.lastActivity)}</span>
                )}
                {project.hasOmcState && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="OMC 활성" />
                )}
              </div>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="text-zinc-600 text-[12px] py-8 text-center">프로젝트 없음</p>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className={`${!projectId ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-y-auto`}>
        {!projectId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FolderOpen size={32} className="mx-auto text-zinc-700 mb-2" />
              <p className="text-zinc-500 text-[13px]">프로젝트를 선택하세요</p>
            </div>
          </div>
        ) : (
          <div className="p-3 sm:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                {/* Mobile back button */}
                <button
                  onClick={() => navigate('/projects')}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors md:hidden"
                >
                  <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-bold text-white truncate">
                  {selectedProject?.name ?? projectId}
                </h2>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate ml-0 md:ml-0">
                {selectedProject?.path}
              </p>
            </div>

            {sessionsLoading ? (
              <p className="text-zinc-500 text-[13px] py-8 text-center">로딩 중...</p>
            ) : sessions.length === 0 ? (
              <p className="text-zinc-600 text-[13px] py-8 text-center">세션 없음</p>
            ) : (
              <div className="space-y-1.5">
                {sessions.map((session) => (
                  <motion.button
                    key={session.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => navigate(`/projects/${projectId}/sessions/${session.id}`)}
                    className="w-full text-left px-3 sm:px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {session.isActive && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                        <span className="text-[13px] font-mono text-zinc-300 truncate">
                          {session.id.slice(0, 8)}...
                        </span>
                        {session.isActive && (
                          <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded font-medium">활성</span>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 mt-1.5 text-[11px] text-zinc-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(session.modifiedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={10} />
                        {formatBytes(session.sizeBytes)}
                      </span>
                      {session.subagentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Zap size={10} />
                          서브에이전트 {session.subagentCount}
                        </span>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
