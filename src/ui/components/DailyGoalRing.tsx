/**
 * Tagesziel als Ring. Kleines, heute erreichbares Ziel statt eines fernen
 * Fernziels — der Ring füllt sich sichtbar mit jeder gelösten Aufgabe und
 * schließt sich mit einem Häkchen.
 *
 * Der Ring wird LAUTER, wenn eine lange Serie offen dasteht (siehe
 * rewards.stakeLevel) — eine Woche Serie darf nicht so leise aussehen wie Tag
 * null. Die SPRACHE eskaliert dabei nicht: die Karte stellt fest, was der
 * Stand ist, und droht nicht. Ein Freeze-Token nimmt die Dringlichkeit
 * wieder heraus, weil der Tag dann abgefedert ist.
 */
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { stakeLevel, type DailyGoal } from '../../game/rewards';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

const SIZE = 46;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

interface Props {
  goal: DailyGoal;
  /** Laufende Serie in Tagen — das Tagesziel haelt sie */
  streak: number;
  /** Vorhandene Freeze-Token (entschaerfen einen verpassten Tag) */
  freezeTokens?: number;
}

export function DailyGoalRing({ goal, streak, freezeTokens = 0 }: Props) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const stake = stakeLevel(streak, goal.done, freezeTokens);
  const ringColor = goal.done ? '#3ddc97' : stake === 'urgent' ? '#f97316' : '#ff5a3c';

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="rgba(138,151,173,0.2)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            initial={reducedMotion ? false : { strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: CIRC * (1 - goal.progress) }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm">
          {goal.done ? '✓' : stake === 'urgent' ? '🔥' : '🎯'}
        </span>
      </div>
      <div className="min-w-0">
        {/* Das Tagesziel HAELT die Serie — wer das nicht sieht, versteht nicht,
            warum die 300 XP zaehlen. Formuliert als Feststellung, nicht als
            Drohung: der Stand wird genannt, nicht angedroht. */}
        <div
          className={`font-display text-sm font-bold ${
            stake === 'urgent' ? 'text-warn' : 'text-ink'
          }`}
        >
          {goal.done
            ? streak > 0
              ? t('goal.streakSafe', { days: streak })
              : t('goal.done')
            : stake === 'urgent'
              ? t('goal.atStake', { days: streak })
              : streak > 0
                ? t('goal.keepStreak')
                : t('goal.title')}
        </div>
        <div className="font-mono text-[11px] text-dim">
          {goal.done
            ? t('goal.earnedToday', { xp: goal.earned })
            : t('goal.remaining', { xp: goal.remaining })}
          {freezeTokens > 0 && (
            <span className="ml-1.5 text-aura" title={t('goal.freezeHint')}>
              ❄{freezeTokens}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
