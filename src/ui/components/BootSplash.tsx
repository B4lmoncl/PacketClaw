/**
 * Boot-Sequenz beim ersten Laden pro Sitzung: rotierendes Gate, Titel,
 * Scan-Balken und getippte Statuszeilen — wie ein System-Login. Danach
 * blendet sie aus und gibt die App frei. Klick/Taste überspringt.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

const SESSION_KEY = 'aethergate-booted';

export function BootSplash() {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [lines, setLines] = useState(0);

  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* privater Modus — dann eben jedes Mal, harmlos */
    }
    const total = reduced ? 500 : 2000;
    const dismiss = window.setTimeout(() => setShow(false), total);
    // Statuszeilen nach und nach einblenden
    const steps = [400, 800, 1200].map((ms, i) =>
      window.setTimeout(() => setLines((n) => Math.max(n, i + 1)), reduced ? 0 : ms),
    );
    const skip = () => setShow(false);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.clearTimeout(dismiss);
      steps.forEach(window.clearTimeout);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [show, reduced]);

  const statusLines = [t('boot.engine'), t('boot.ruleset'), t('boot.channel')];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-bg"
          aria-hidden
        >
          <div className="aurora-layer">
            <div className="aurora-blob b1" />
            <div className="aurora-blob b2" />
          </div>
          <div className="boot-gate" />
          <div className="text-aurora font-display text-3xl font-bold tracking-tight">
            {t('app.title')}
          </div>
          <div className="boot-scan" />
          <div className="min-h-[3.5rem] font-mono text-[11px] text-dim">
            {statusLines.slice(0, lines).map((l, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                <span className="text-trace">›</span> {l}{' '}
                <span className="text-trace">{i < 2 ? 'ok' : '✓'}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
