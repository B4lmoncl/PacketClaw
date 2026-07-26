/**
 * Tagesaufträge im Hauptmenü — der konkrete Grund, heute reinzuschauen.
 *
 * Drei kleine Aufgaben, jede mit Balken und Abhol-Knopf. Erfüllte Aufträge
 * warten sichtbar auf ihre Abholung: das Einlösen selbst ist Teil der
 * Belohnung, deshalb wird nicht automatisch verbucht.
 *
 * Visuell im Belohnungs-Material (Rarity-Rahmen), damit es nicht mit der
 * Navigation verwechselt wird.
 */
import { useTranslation } from 'react-i18next';
import type { QuestProgress } from '../../game/dailyQuests';
import type { WeekMilestone } from '../../game/dailyQuests';

interface Props {
  progress: QuestProgress[];
  week: WeekMilestone;
  streak: number;
  onClaim: (quest: QuestProgress) => void;
}

export function DailyQuests({ progress, week, streak, onClaim }: Props) {
  const { t } = useTranslation();
  if (progress.length === 0) return null;

  const doneCount = progress.filter((p) => p.done).length;
  const allDone = doneCount === progress.length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-claw/90">
          {t('quests.title')}
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-dim">
          {doneCount}/{progress.length}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-claw/40 to-transparent" aria-hidden />
      </div>

      <ul className="flex flex-col gap-1.5">
        {progress.map((p) => {
          const claimable = p.done && !p.claimed;
          return (
            <li
              key={p.quest.id}
              className={`flex items-center gap-2.5 rounded-panel px-3 py-2 ${
                claimable
                  ? 'panel-reward rarity-legendary'
                  : p.claimed
                    ? 'panel-inset opacity-70'
                    : 'panel-inset'
              }`}
            >
              <span
                className={`shrink-0 font-mono text-xs font-bold ${
                  p.claimed ? 'text-trace' : p.done ? 'text-warn' : 'text-dim/50'
                }`}
                aria-hidden
              >
                {p.claimed ? '✓' : p.done ? '!' : '○'}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${p.claimed ? 'text-dim line-through' : 'text-ink'}`}
                  >
                    {t(`quests.desc.${p.quest.id}`, { count: p.quest.target })}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim">
                    {p.have}/{p.target}
                  </span>
                </div>
                {!p.claimed && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg/80">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        p.done ? 'bg-warn' : 'bg-gradient-to-r from-claw to-warn'
                      }`}
                      style={{ width: `${Math.round(p.ratio * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {claimable ? (
                <button
                  onClick={() => onClaim(p)}
                  className="shrink-0 rounded-row bg-warn px-2.5 py-1 font-display text-[11px] font-bold text-bg hover:brightness-110"
                >
                  +{p.quest.xp}
                </button>
              ) : (
                <span className="shrink-0 font-mono text-[10px] text-dim/60">+{p.quest.xp}</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Wochenmeilenstein: sieben Tage mit steigender Belohnung */}
      <div
        className={`flex items-center gap-2.5 rounded-panel px-3 py-2 ${
          week.isFinal ? 'panel-reward rarity-epic' : 'panel-inset'
        }`}
      >
        <span className="shrink-0 text-base" aria-hidden>
          {streak > 0 ? '🔥' : '📆'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display text-xs font-bold text-ink">
              {t('quests.week', { day: week.day })}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-warn">+{week.reward}</span>
          </div>
          {/* Sieben Punkte statt Balken: man soll den siebten Tag SEHEN */}
          <div className="mt-1.5 flex gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const reached = i + 1 <= week.day;
              const isSeventh = i === 6;
              return (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    reached
                      ? isSeventh
                        ? 'bg-aura'
                        : 'bg-warn'
                      : isSeventh
                        ? 'bg-aura/25'
                        : 'bg-bg/80'
                  }`}
                  aria-hidden
                />
              );
            })}
          </div>
        </div>
      </div>

      {allDone && (
        <p className="px-1 font-mono text-[10px] leading-relaxed text-trace">
          {t('quests.allDone')}
        </p>
      )}
    </section>
  );
}
