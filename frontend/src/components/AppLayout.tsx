import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import {
  Briefcase, CheckCircle2, CircleDashed, Database, LogOut, FileText, HeartPulse, LayoutDashboard, Mail, Menu, Plug, Search, Send, Settings, X, XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiClient } from '../services/api-client';
import { useAiStatus } from '../features/settings/api';
import { useAuthStatus, useLogout } from '../features/auth/Auth';
import { cx } from './ui';
import { LogoMark, PageTransition, Watermark, Wordmark } from './motion';

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/applications', label: 'Applications', icon: Send },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/cvs', label: 'CV profiles', icon: FileText },
  { to: '/email', label: 'Email', icon: Mail },
  { to: '/sources', label: 'Sources', icon: Plug },
  { to: '/health', label: 'App health', icon: HeartPulse },
  { to: '/database', label: 'Database', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Small, distinct gesture per icon, played when its item is clicked. */
const GESTURES: Record<string, { rotate?: number[]; scale?: number[]; x?: number[]; y?: number[] }> = {
  '/dashboard': { scale: [1, 1.22, 0.94, 1] },
  '/jobs': { rotate: [0, -10, 10, -6, 0], y: [0, -2, 0] },
  '/applications': { x: [0, 3, 0], y: [0, -3, 0], rotate: [0, 12, 0] },
  '/search': { rotate: [0, -18, 14, 0], scale: [1, 1.15, 1] },
  '/cvs': { y: [0, -3, 0, -1, 0] },
  '/email': { y: [0, -3, 0], rotate: [0, -10, 8, 0] },
  '/sources': { rotate: [0, 25, -10, 0] },
  '/settings': { rotate: [0, 120] },
  '/health': { scale: [1, 1.28, 1, 1.2, 1] },
  '/database': { y: [0, -3, 1, 0], scale: [1, 1.1, 0.92, 1] },
};

function NavItem({ to, label, icon: Icon, onNavigate }: { to: string; label: string; icon: LucideIcon; onNavigate?: () => void }) {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const play = () => {
    if (reduce) return;
    void controls.start({ ...GESTURES[to], transition: { duration: 0.5, ease: 'easeInOut' } }).then(() => controls.set({ rotate: 0, scale: 1, x: 0, y: 0 }));
  };
  return (
    <NavLink
      to={to}
      onClick={() => { play(); onNavigate?.(); }}
      className={({ isActive }) =>
        cx('relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId={`nav-active-${onNavigate ? 'm' : 'd'}`} className="absolute inset-0 rounded-md bg-slate-100" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <motion.span className="relative inline-flex" animate={controls} whileHover={reduce ? undefined : { scale: 1.12 }}>
            <Icon className={cx('h-4 w-4 shrink-0', isActive && 'text-brand-600')} strokeWidth={1.75} />
          </motion.span>
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Ok/error/unknown as a distinct shape (check / X / dashed circle), not just a colour, since colour alone
 * does not read for everyone. The check also breathes gently while things are working, so "alive" is
 * visible at a glance rather than relying on the exact shade of green.
 */
function StatusRow({ ok, label, detail }: { ok: boolean | undefined; label: string; detail?: string }) {
  const reduce = useReducedMotion();
  const Icon = ok === undefined ? CircleDashed : ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-center gap-2" title={detail}>
      <motion.span
        className={cx('inline-flex shrink-0', ok === undefined ? 'text-slate-400' : ok ? 'text-emerald-600' : 'text-rose-600')}
        animate={ok && !reduce ? { opacity: [1, 0.55, 1] } : undefined}
        transition={ok && !reduce ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </motion.span>
      <span className={cx('truncate', ok === false ? 'font-medium text-rose-700' : 'text-slate-600')}>{label}</span>
    </li>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<{ status: string; database: string }>('/health'),
    retry: false,
    refetchInterval: 30000,
  });
  const ai = useAiStatus();
  const auth = useAuthStatus();
  const logout = useLogout();
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2.5 px-3"><LogoMark size={26} /><Wordmark /></div>
      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
        {NAV.map((n) => <NavItem key={n.to} {...n} onNavigate={onNavigate} />)}
      </nav>
      <Link to="/health" onClick={onNavigate} className="block rounded-md border-t border-slate-200 px-3 pt-3 text-xs hover:bg-slate-50" title="Open app health">
        <ul className="space-y-1">
          <StatusRow ok={health.isError ? false : health.data ? true : undefined} label={health.isError ? 'Backend unreachable' : 'Backend'} />
          <StatusRow ok={health.data ? health.data.database === 'ok' : undefined} label="Database" />
          <StatusRow ok={ai.data?.ok} label={ai.data ? `Ollama · ${ai.data.model}` : 'Ollama'} detail={ai.data?.detail} />
        </ul>
      </Link>
      {auth.data?.required && (
        <button onClick={() => logout.mutate()} className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900">
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />Lock this device
        </button>
      )}
      <Watermark className="mt-3 px-3" />
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-card px-4 py-2.5 lg:hidden">
        <span className="flex items-center gap-2"><LogoMark size={22} /><Wordmark className="text-lg" /></span>
        <button className="rounded-md p-2 hover:bg-slate-100" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      </header>
      {/* Fixed (not sticky) takes the header out of flow, so this invisible twin reserves its exact height. */}
      <div aria-hidden className="invisible flex items-center justify-between px-4 py-2.5 lg:hidden">
        <span className="flex items-center gap-2"><LogoMark size={22} /><Wordmark className="text-lg" /></span>
        <span className="rounded-md p-2"><Menu className="h-5 w-5" /></span>
      </div>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-card px-3 py-5 lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <motion.div className="absolute inset-0 bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-card px-3 py-5 shadow-pop"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <button className="absolute right-3 top-3 rounded-md p-2 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-9">
        <div className="mx-auto max-w-6xl">
          <AnimatePresence mode="wait" initial={false}>
            <PageTransition key={pathname}><Outlet /></PageTransition>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
