/**
 * Große Momente: Truhe geöffnet und Modus freigeschaltet.
 *
 * Beide teilen sich dieselbe Bühne — ein kurzes, blockierendes Overlay mit
 * Partikeln und Feder-Pop. Das ist bewusst der einzige Ort im Spiel, der den
 * Fluss unterbricht: wenn alles gleich laut ist, ist nichts laut.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { noteById } from '../../game/fieldNotes';
import type { ChestRarity } from '../../game/rewards';
import { FieldNoteCard } from './FieldNoteCard';
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
  /** Truhe: gezogene Feldnotiz (ID) — der eigentliche Inhalt */
  noteId?: string;
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
  const note = reward?.noteId ? noteById(reward.noteId) : undefined;

  /**
   * Ein kurzer Moment Vorfreude, bevor die Karte da ist.
   *
   * Ohne diesen Takt steht die Belohnung schon da, während die Truhe noch
   * wackelt — die Animation kommentiert dann ein Ergebnis, das man längst
   * gelesen hat. 550 ms ist lang genug, dass der Blick an der Truhe hängt, und
   * kurz genug, dass es beim fünften Mal nicht nervt. Ohne Animationen gibt es
   * nichts zu erwarten, also fällt der Takt dort weg.
   */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!reward || reward.kind !== 'chest' || !note) {
      setRevealed(true);
      return;
    }
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    const timer = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(timer);
  }, [reward, note, reducedMotion]);

  /**
   * Klick während der Vorfreude überspringt sie, statt zu schließen. Sonst
   * verwirft ein ungeduldiger Klick genau die Karte, die man nie gesehen hat —
   * gebucht ist sie zu dem Zeitpunkt längst.
   */
  function skipOrClose() {
    if (revealed) onClose();
    else setRevealed(true);
  }

  return (
    <AnimatePresence>
      {reward && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={skipOrClose}
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
            {revealed && <ParticleBurst variant="celebration" />}

            {reward.kind === 'chest' ? (
              <>
                <motion.div
                  className="text-6xl"
                  initial={reducedMotion ? false : { rotate: -12, scale: 0.8 }}
                  animate={
                    revealed
                      ? { rotate: [-12, 8, -4, 0], scale: 1 }
                      : // Zittern, solange sie noch zu ist
                        { rotate: [-3, 3, -3], scale: 0.95 }
                  }
                  transition={
                    revealed
                      ? { duration: 0.7, ease: 'easeOut' }
                      : { duration: 0.22, repeat: Infinity }
                  }
                >
                  {revealed ? '🎁' : '📦'}
                </motion.div>

                {note ? (
                  // Der Inhalt IST die Karte — die XP-Zeile rutscht darunter
                  <AnimatePresence>
                    {revealed && (
                      <motion.div
                        key="note"
                        initial={
                          reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="flex w-full flex-col items-center gap-2"
                      >
                        <div className="font-mono text-[10px] uppercase tracking-widest text-warn">
                          {t('notes.newNote')}
                        </div>
                        <FieldNoteCard note={note} owned size="full" />
                        <div className={`font-display text-xl font-bold ${style.text}`}>
                          +{reward.xp} XP
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ) : (
                  <>
                    <div
                      className={`font-mono text-[10px] uppercase tracking-widest ${style.text}`}
                    >
                      {t(`reward.rarity.${reward.rarity ?? 'common'}`)}
                    </div>
                    <div className="font-display text-2xl font-bold text-ink">
                      {t('reward.chestTitle')}
                    </div>
                    <div className={`font-display text-3xl font-bold ${style.text}`}>
                      +{reward.xp} XP
                    </div>
                  </>
                )}
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

            {/* Der Knopf erscheint erst mit der Belohnung — vorher gäbe es
                nichts zu bestätigen, nur etwas zu verpassen */}
            {revealed && (
              <button
                onClick={onClose}
                className="mt-2 rounded-panel bg-claw px-6 py-2.5 font-display font-bold text-bg hover:brightness-110"
                autoFocus
              >
                {t('reward.nice')}
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
