import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogoMark, Watermark } from './motion';

const KEY = 'shortlist.splash';
const seen = () => {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
};

/** Brief launch screen, shown once per browser session. Skipped for reduced-motion users. */
export function Splash() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => !seen());

  useEffect(() => {
    if (!show) return;
    if (reduce) { setShow(false); return; }
    try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable: just show once per load */ }
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => setShow(false), 1900);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [show, reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas"
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
          onClick={() => setShow(false)}
          role="presentation"
        >
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
            <LogoMark size={72} draw />
          </motion.div>
          <motion.h1
            className="font-display mt-6 text-4xl font-semibold tracking-tight text-slate-900"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.5, ease: 'easeOut' }}
          >
            Shortlist <span className="ml-1 align-middle rounded border border-slate-300 px-1.5 py-0.5 font-sans text-xs font-semibold tracking-widest text-slate-500">BOT</span>
          </motion.h1>
          <motion.p className="mt-2 text-sm text-slate-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.5 }}>
            Your job search assistant.
          </motion.p>
          <motion.div className="absolute bottom-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}>
            <Watermark />
          </motion.div>
          <motion.div className="absolute bottom-16 h-0.5 w-28 overflow-hidden rounded bg-slate-200" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <motion.div className="h-full bg-brand-600" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1.5, ease: 'easeInOut' }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
