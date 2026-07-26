/**
 * Combo-Anzeige: Feedback PRO AUFGABE statt erst am Modus-Ende.
 *
 * Ab drei richtigen in Folge erscheint der Multiplikator, wächst mit jeder
 * Stufe und pulst kurz auf, wenn eine neue Stufe erreicht wird — die
 * „Landung", die eine Serie spürbar macht. Bei einem Fehler verschwindet er
 * ohne Drama: der Verlust wird nicht bestraft, er hört einfach auf.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { comboTier } from '../../game/rewards';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

const COLORS: Record<number, string> = {
  1: 'from-trace/80 to-trace/40 text-trace',
  2: 'from-aura/80 to-aura/40 text-aura',
  3: 'from-warn/80 to-warn/40 text-warn',
  4: 'from-claw/80 to-claw/40 text-claw',
};

export function ComboMeter({ streak }: { streak: number }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const tier = comboTier(streak);

  return (
    <AnimatePresence>
      {tier.level > 0 && (
        <motion.div
          // key auf der Stufe: jede neue Stufe spielt den Pop erneut
          key={tier.level}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          className={`flex items-center gap-2 rounded-full border border-line bg-gradient-to-r px-3 py-1 ${
            COLORS[tier.level] ?? ''
          }`}
          aria-live="polite"
        >
          <span className="font-display text-sm font-bold">×{tier.multiplier}</span>
          <span className="font-mono text-[10px] uppercase tracking-widest">
            {t(`combo.label.${tier.key}`)}
          </span>
          <span className="font-mono text-[10px] text-ink/70">{streak}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
