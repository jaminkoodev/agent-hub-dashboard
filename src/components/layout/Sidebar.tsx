import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FolderOpen,
  MessageSquare,
  Wifi,
  WifiOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
} from 'lucide-react';
import { useWsStore } from '../../stores/wsStore';
import { useProjectStore } from '../../stores/projectStore';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: '관제 센터', exact: true },
  { to: '/chat', icon: MessageSquare, label: '채팅' },
  { to: '/projects', icon: FolderOpen, label: '프로젝트' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const wsStatus = useWsStore((s) => s.status);
  const { activeSessions } = useProjectStore();

  return (
    <motion.aside
      animate={{ width: collapsed ? 48 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex flex-col h-screen bg-zinc-900 border-r border-zinc-800 overflow-hidden shrink-0"
      style={{ minWidth: collapsed ? 48 : 220 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2.5 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600 shrink-0">
          <Monitor size={15} className="text-white" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <span className="text-[13px] font-semibold text-zinc-100 tracking-wide whitespace-nowrap">Agent Hub</span>
              <p className="text-[9px] text-zinc-500 leading-none mt-0.5 whitespace-nowrap">세션 브라우저</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={onToggle}
          className="shrink-0 p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-2 shrink-0">
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to} to={to} end={exact}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] transition-all duration-150',
                collapsed ? 'justify-center' : '',
                isActive ? 'bg-indigo-600/20 text-indigo-400 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} className={cn('shrink-0', isActive ? 'text-indigo-400' : 'text-zinc-500')} />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.12 }}
                      className="overflow-hidden whitespace-nowrap flex-1"
                    >{label}</motion.span>
                  )}
                </AnimatePresence>
                {!collapsed && isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 border-t border-zinc-800 my-1 shrink-0" />

      {/* Active sessions count */}
      <AnimatePresence initial={false}>
        {!collapsed && activeSessions.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="px-3 py-1.5 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-900/20 border border-emerald-800/30 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-[11px] text-emerald-400">{activeSessions.length}개 세션 활성</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1" />

      {/* Connection */}
      <div className="px-2.5 py-2 border-t border-zinc-800 shrink-0">
        <div className={cn('flex items-center gap-1.5', collapsed ? 'justify-center' : '')}>
          {wsStatus === 'connected' ? (
            <>
              <Wifi size={12} className="text-emerald-400 shrink-0" />
              {!collapsed && <span className="text-[11px] text-emerald-400">연결됨</span>}
            </>
          ) : wsStatus === 'connecting' ? (
            <>
              <Loader2 size={12} className="text-amber-400 animate-spin shrink-0" />
              {!collapsed && <span className="text-[11px] text-amber-400">연결 중...</span>}
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-zinc-500 shrink-0" />
              {!collapsed && <span className="text-[11px] text-zinc-500">연결 끊김</span>}
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
