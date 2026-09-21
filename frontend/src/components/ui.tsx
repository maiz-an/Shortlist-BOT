import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, X, XCircle } from 'lucide-react';
import type { JobStatus } from '../types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ---------- Buttons & form fields ---------- */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50',
  secondary: 'border border-slate-300 bg-card text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-50',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
};

export function Button({ variant = 'secondary', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-100 disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

const fieldCls =
  'block min-h-9 w-full rounded-md border border-slate-300 bg-card px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export function Field({ label, hint, children }: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(fieldCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(fieldCls, 'leading-relaxed', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(fieldCls, 'pr-8', p.className)} />;

/** Comma/newline separated list editor. */
export function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  return (
    <Input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))}
    />
  );
}

/* ---------- Layout bits ---------- */
export function Card({ title, actions, children, className }: PropsWithChildren<{ title?: ReactNode; actions?: ReactNode; className?: string }>) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-card shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-3xl font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span role="status" className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

/** Content-shaped placeholder instead of a bare spinner. */
export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-card px-6 py-12 text-center">
      <Inbox className="mx-auto mb-3 h-7 w-7 text-slate-400" strokeWidth={1.5} />
      <p className="font-semibold text-slate-800">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-0.5">{error instanceof Error ? error.message : 'Unknown error'}</p>
        {onRetry && <Button className="mt-3" onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}

/** Inline notice used for queue/AI/warning banners. */
export function Notice({ tone = 'info', children, action }: PropsWithChildren<{ tone?: 'info' | 'warn'; action?: ReactNode }>) {
  const cls = tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800';
  return (
    <div role="status" className={cx('mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md px-4 py-2.5 text-sm', cls)}>
      <span className="flex items-center gap-2">{tone === 'info' && <Spinner className="h-3.5 w-3.5" />}{tone === 'warn' && <AlertTriangle className="h-4 w-4" />}{children}</span>
      {action}
    </div>
  );
}

/* ---------- Badges & score ---------- */
const STATUS_STYLES: Record<JobStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700', ANALYZING: 'bg-sky-100 text-sky-700', ANALYZED: 'bg-blue-100 text-blue-700',
  REVIEW: 'bg-amber-100 text-amber-800', APPROVED: 'bg-violet-100 text-violet-700', SENDING: 'bg-sky-100 text-sky-700',
  APPLIED: 'bg-emerald-100 text-emerald-700', REJECTED: 'bg-rose-100 text-rose-700', WITHDRAWN: 'bg-slate-200 text-slate-600',
  INTERVIEW: 'bg-fuchsia-100 text-fuchsia-700', OFFER: 'bg-green-200 text-green-800', CLOSED: 'bg-slate-200 text-slate-600',
};

export function Badge({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium', className ?? 'bg-slate-100 text-slate-700')}>{children}</span>;
}
export const StatusBadge = ({ status }: { status: JobStatus }) => (
  <Badge className={STATUS_STYLES[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
);

export function RecommendationBadge({ value }: { value: 'APPLY' | 'MAYBE' | 'SKIP' }) {
  const cls = { APPLY: 'bg-emerald-100 text-emerald-700', MAYBE: 'bg-amber-100 text-amber-800', SKIP: 'bg-slate-100 text-slate-600' }[value];
  return <Badge className={cls}>{value}</Badge>;
}

export function scoreTone(score: number) {
  return score >= 90 ? 'bg-emerald-600' : score >= 80 ? 'bg-emerald-500' : score >= 70 ? 'bg-lime-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
}

export function ScoreBar({ score, label }: { score: number | null | undefined; label?: string }) {
  if (score === null || score === undefined) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex min-w-28 items-center gap-2" title={label}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <motion.div className={cx('h-full rounded-full', scoreTone(score))} initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-800">{score}%</span>
    </div>
  );
}

/** Circular score for detail views. */
export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? '#10b981' : score >= 70 ? '#84cc16' : score >= 50 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${score} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} className="stroke-slate-200" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} strokeLinecap="round" stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-extrabold tabular-nums text-slate-900">{score}<span className="text-xs font-semibold text-slate-500">%</span></span>
    </div>
  );
}

export function Chips({ items, tone = 'slate' }: { items: string[]; tone?: 'slate' | 'green' | 'red' }) {
  if (!items.length) return <span className="text-sm text-slate-400">None</span>;
  const cls = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-rose-50 text-rose-700' }[tone];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => <span key={i} className={cx('rounded px-2 py-0.5 text-xs font-medium', cls)}>{i}</span>)}
    </div>
  );
}

export function Label({ children }: PropsWithChildren) {
  return <p className="mb-1 text-xs font-medium text-slate-500">{children}</p>;
}

/* ---------- Table + pagination ---------- */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-slate-600">
      <span>{total === 0 ? 'No results' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <Button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-14 text-center tabular-nums">{page} / {pages}</span>
        <Button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function TableShell({ children }: PropsWithChildren) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-card shadow-card">
      <table className="w-full min-w-[42rem] text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: PropsWithChildren<{ className?: string }>) => (
  <th className={cx('whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500', className)}>{children}</th>
);
export const Td = ({ children, className }: PropsWithChildren<{ className?: string }>) => <td className={cx('border-b border-slate-100 px-4 py-3 align-middle', className)}>{children}</td>;

/* ---------- Modal / confirm ---------- */
export function Modal({ open, title, onClose, children, footer }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void; footer?: ReactNode }>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-xl bg-card shadow-pop sm:rounded-lg"
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-sm text-slate-700">{message}</div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
interface ToastItem { id: number; kind: 'success' | 'error'; text: string }
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void }>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  const api = { success: (t: string) => push('success', t), error: (t: string) => push('error', t) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div
              key={i.id} layout role={i.kind === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-slate-200 bg-card p-3 text-sm text-slate-800 shadow-pop"
            >
              {i.kind === 'error' ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
              <span>{i.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Unexpected error');
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
