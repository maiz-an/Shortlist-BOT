import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useHealthDetails } from '../health/api';
import { useDashboard } from '../settings/api';
import { LogoMark } from '../../components/motion';

interface Tip { id: string; text: string; to?: string; action?: string }

const KEY = 'shortlist.bot.dismissed';
const readDismissed = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; }
};

/** Types text out a few characters at a time. Instant when the user prefers reduced motion. */
function Typed({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((c) => (c >= text.length ? (clearInterval(t), c) : c + 2)), 16);
    return () => clearInterval(t);
  }, [text, reduce]);
  return <span aria-label={text}>{text.slice(0, n)}<span className="opacity-0">{text.slice(n)}</span></span>;
}

/**
 * Lightweight, rule-based assistant: reads state the app already has (health checks, dashboard counts)
 * and says the single most useful thing. No model calls, no extra requests beyond the shared queries.
 */
export function BotNote() {
  const health = useHealthDetails(30000);
  const dash = useDashboard();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const tip = useMemo<Tip | null>(() => {
    const checks = health.data?.checks ?? [];
    const bad = checks.find((c) => c.status === 'error') ?? checks.find((c) => c.status === 'warn');
    const more = checks.filter((c) => c.status !== 'ok').length - 1;
    if (health.isError) return { id: 'backend-down', text: "I can't reach the backend, so nothing will update. Start it and I'll pick up where we left off.", to: '/health', action: 'See details' };
    const candidates: Tip[] = [];
    if (bad) candidates.push({ id: `check-${bad.id}-${bad.status}`, text: `${bad.message}${bad.fix ? ` ${bad.fix}` : ''}${more > 0 ? ` (${more} more on the health page.)` : ''}`, to: bad.href ?? '/health', action: bad.href ? 'Fix it' : 'See details' });
    const d = dash.data;
    if (d) {
      const top = d.topReview[0];
      if (d.totals.pendingReview > 0 && top) candidates.push({ id: `review-${top.id}`, text: `${d.totals.pendingReview} ${d.totals.pendingReview === 1 ? 'job is' : 'jobs are'} waiting for you. The best fit is ${top.title} at ${top.company}${top.analysis ? ` (${top.analysis.finalMatchScore}%)` : ''}.`, to: `/jobs/${top.id}`, action: 'Review it' });
      else if (d.totals.jobsFound === 0) candidates.push({ id: 'first-search', text: "Nothing here yet. Run your first search and I'll sort what comes back.", to: '/search', action: 'Open search' });
      else candidates.push({ id: 'all-clear', text: "You're all caught up. I'll flag anything that needs you." });
    }
    return candidates.find((c) => !dismissed.includes(c.id)) ?? null;
  }, [health.data, health.isError, dash.data, dismissed]);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  };

  return (
    <AnimatePresence mode="wait">
      {tip && (
        <motion.div
          key={tip.id}
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-card px-4 py-3"
          role="status"
        >
          <span className="mt-0.5 shrink-0"><LogoMark size={26} /></span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-xs font-medium text-slate-500">Shortlist BOT</p>
            <p className="text-slate-800"><Typed text={tip.text} /></p>
            {tip.to && tip.action && <Link to={tip.to} className="mt-1 inline-block font-medium text-brand-600 hover:underline">{tip.action}</Link>}
          </div>
          <button onClick={() => dismiss(tip.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
