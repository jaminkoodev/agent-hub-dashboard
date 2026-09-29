import { useLocation } from 'react-router-dom';
import { useProjectStore } from '../../stores/projectStore';

const PAGE_TITLES: Record<string, string> = {
  '/': '관제 센터',
  '/chat': '채팅',
  '/projects': '프로젝트',
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/projects/') && pathname.includes('/sessions/')) return '세션 뷰어';
  if (pathname.startsWith('/projects/')) return '프로젝트';
  return PAGE_TITLES[pathname] ?? '페이지';
}

export default function Header() {
  const { pathname } = useLocation();
  const { activeSessions } = useProjectStore();
  const title = getPageTitle(pathname);

  return (
    <header className="flex items-center justify-between h-11 px-3 sm:px-5 bg-zinc-900/80 border-b border-zinc-800 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[11px] text-zinc-500 hidden sm:inline">Agent Hub</span>
        <span className="text-zinc-700 hidden sm:inline">/</span>
        <span className="text-[13px] font-medium text-zinc-100 truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {activeSessions.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-emerald-400">
              <span className="hidden sm:inline">활성 </span><span className="font-semibold">{activeSessions.length}</span>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
