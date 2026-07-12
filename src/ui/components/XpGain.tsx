/**
 * XP-Gewinn im DonePanel (QuestHall-Stil): "+N XP" schwebt ein, der
 * Rang-Fortschrittsbalken füllt sich animiert vom alten zum neuen Stand.
 * Bei Rangaufstieg leuchtet der neue Rangname auf.
 */
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { rankFor } from '../../game/progression';
import { useGame } from '../../game/store';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

export function XpGain({ gained }: { gained: number }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const xp = useGame((s) => s.xp);
  // Der Store ist beim Rendern des DonePanels bereits aktualisiert
  const before = Math.max(0, xp - gained);
  const now = rankFor(xp);
  const prev = rankFor(before);
  const rankedUp = prev.rank.id !== now.rank.id;
  // Beim Aufstieg von 0 füllen, sonst vom alten Stand aus
  const fromProgress = rankedUp ? 0 : prev.progress;

  return (
    <div className="flex w-full max-w-xs flex-col gap-1.5">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="text-center font-display text-lg font-bold text-warn"
      >
        +{gained} XP
      </motion.div>
      <div
        className="h-2 overflow-hidden rounded-row border border-line bg-bg"
        role="progressbar"
        aria-valuenow={Math.round(now.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('score.rankProgress')}
      >
        <motion.div
          initial={{ width: `${(reducedMotion ? now.progress : fromProgress) * 100}%` }}
          animate={{ width: `${now.progress * 100}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.9, delay: 0.25, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-claw to-warn"
        />
      </div>
      <div className="flex items-baseline justify-between font-mono text-[10px] text-dim">
        {rankedUp ? (
          <motion.span
            initial={reducedMotion ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4, type: 'spring', bounce: 0.45 }}
            className="font-bold text-warn"
          >
            ⬆ {t('score.rankUp', { rank: now.rank.name })}
          </motion.span>
        ) : (
          <span>{now.rank.name}</span>
        )}
        {now.next && (
          <span>
            {xp} / {now.next.minXp} XP
          </span>
        )}
      </div>
    </div>
  );
}
