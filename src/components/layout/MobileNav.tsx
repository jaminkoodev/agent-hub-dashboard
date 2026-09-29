import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: '관제', exact: true },
  { to: '/chat', icon: MessageSquare, label: '채팅' },
  { to: '/projects', icon: FolderOpen, label: '프로젝트' },
];

export default function MobileNav() {
  return (
    <nav className="shrink-0 flex items-stretch border-t border-zinc-800 bg-zinc-900 safe-area-bottom">
      {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] transition-colors',
              isActive
                ? 'text-indigo-400 bg-indigo-600/5'
                : 'text-zinc-500 active:text-zinc-300 active:bg-zinc-800/50',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className={cn('text-[10px]', isActive ? 'font-semibold' : 'font-medium')}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
