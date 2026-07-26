/**
 * Große Momente: Truhe geöffnet und Modus freigeschaltet.
 *
 * Beide teilen sich dieselbe Bühne — ein kurzes, blockierendes Overlay mit
 * Partikeln und Feder-Pop. Das ist bewusst der einzige Ort im Spiel, der den
 * Fluss unterbricht: wenn alles gleich laut ist, ist nichts laut.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ChestRarity } from '../../game/rewards';
import { ParticleBurst } from './ParticleBurst';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

const RARITY_STYLE: Record<ChestRarity, { ring: string; text: string; glow: string }> = {
  common: { ring: 'border-trace/60', text: 'text-trace', glow: 'shadow-glow-trace' },
  rare: { ring: 'border-aura/70', text: 'text-aura', glow: 'shadow-glow-aura' },
  epic: { ring: 'border-warn/70', text: 'text-warn', glow: 'shadow-glow-warn' },
};

export interface RewardPayload {
  kind: 'chest' | 'unlock';
  /** Truhe: Belohnung; Freischaltung: Modus-Schlüssel */
  xp?: number;
  rarity?: ChestRarity;
  modeKey?: string;
}

export function RewardOverlay({
  reward,
  onClose,
}: {
  reward: RewardPayload | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const style = RARITY_STYLE[reward?.rarity ?? 'common'];

  return (
    <AnimatePresence>
      {reward && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className={`glass relative flex w-full max-w-sm flex-col items-center gap-3 rounded-panel border-2 px-6 py-8 text-center ${style.ring} ${style.glow}`}
            onClick={(e) => e.stopPropagation()}
          >
            <ParticleBurst variant="celebration" />

            {reward.kind === 'chest' ? (
              <>
                <motion.div
                  className="text-6xl"
                  initial={reducedMotion ? false : { rotate: -12, scale: 0.8 }}
                  animate={{ rotate: [-12, 8, -4, 0], scale: 1 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                >
                  🎁
                </motion.div>
                <div className={`font-mono text-[10px] uppercase tracking-widest ${style.text}`}>
                  {t(`reward.rarity.${reward.rarity ?? 'common'}`)}
                </div>
                <div className="font-display text-2xl font-bold text-ink">
                  {t('reward.chestTitle')}
                </div>
                <div className={`font-display text-3xl font-bold ${style.text}`}>
                  +{reward.xp} XP
                </div>
              </>
            ) : (
              <>
                <motion.div
                  className="text-6xl"
                  initial={reducedMotion ? false : { scale: 0.5 }}
                  animate={{ scale: [0.5, 1.15, 1] }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                >
                  🔓
                </motion.div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-warn">
                  {t('reward.unlockKicker')}
                </div>
                <div className="font-display text-2xl font-bold text-ink">
                  {t(`nav.${reward.modeKey}`)}
                </div>
                <div className="max-w-xs font-mono text-xs leading-relaxed text-dim">
                  {t(`nav.${reward.modeKey}Sub`)}
                </div>
              </>
            )}

            <button
              onClick={onClose}
              className="mt-2 rounded-panel bg-claw px-6 py-2.5 font-display font-bold text-bg hover:brightness-110"
              autoFocus
            >
              {t('reward.nice')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
