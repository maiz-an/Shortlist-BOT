import { useEffect, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

/** Tiny mark: two ticked lines, like a shortlist. Optionally draws itself in. */
export function LogoMark({ size = 28, draw = false }: { size?: number; draw?: boolean }) {
  const reduce = useReducedMotion();
  const animateIn = draw && !reduce;
  const path = (d: string, delay: number) => (
    <motion.path
      d={d}
      initial={animateIn ? { pathLength: 0, opacity: 0 } : false}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-brand-600" />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {path('M17 22l4 4 8-9', 0.25)}
        {path('M36 22h13', 0.45)}
        {path('M17 40l4 4 8-9', 0.65)}
        {path('M36 40h13', 0.85)}
      </g>
    </svg>
  );
}

export function Wordmark({ className = '', tag = true }: { className?: string; tag?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-display text-xl font-semibold tracking-tight text-slate-900 ${className}`}>Shortlist</span>
      {tag && <span className="rounded border border-slate-300 px-1 py-px font-sans text-[10px] font-semibold leading-none tracking-widest text-slate-500">BOT</span>}
    </span>
  );
}

/** Route content fades and rises slightly on navigation. */
export function PageTransition({ children }: PropsWithChildren) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Staggers direct children on mount. Use with <Item>. */
export function Stagger({ children, className, delay = 0.04 }: PropsWithChildren<{ className?: string; delay?: number }>) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : 'hidden'} animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: delay } } }}>
      {children}
    </motion.div>
  );
}
export function Item({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } } }}>
      {children}
    </motion.div>
  );
}

/** Number that counts up when it scrolls into view. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.9, ease: 'easeOut' });
    return () => c.stop();
  }, [inView, value, reduce, mv]);
  return <motion.span ref={ref}>{text}</motion.span>;
}
