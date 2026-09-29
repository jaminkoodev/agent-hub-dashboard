import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Header from './Header';
import { useWsStore } from '../../stores/wsStore';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const connect = useWsStore((s) => s.connect);
  const disconnect = useWsStore((s) => s.disconnect);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="block md:hidden">
        <MobileNav />
      </div>
    </div>
  );
}
