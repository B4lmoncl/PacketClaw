/**
 * „Noch N bis zum Abzeichen" — die Abzeichen, die zum Greifen nah sind.
 *
 * Visuell bewusst ANDERS als die Modus-Karten: Rarity-Rahmen statt neutraler
 * Fläche, Medaillon statt Emoji, farbiger Fortschrittsbalken in der Farbe der
 * Seltenheit. Vorher sahen Belohnungen genauso aus wie Navigation — dadurch
 * fühlte sich nichts wie eine Belohnung an.
 *
 * Farben und die Signatur „3px farbige Oberkante" kommen aus QuestHalls
 * Rarity-System, damit beide Spiele zusammengehörig aussehen.
 */
import { useTranslation } from 'react-i18next';
import type { AchievementProgress } from '../../game/progression';
import { useGame } from '../../game/store';

/** Rarity-Klasse setzt --rarity/--rarity-glow (siehe index.css). */
const RARITY_CLASS: Record<string, string> = {
  common: 'rarity-common',
  rare: 'rarity-rare',
  epic: 'rarity-epic',
  legendary: 'rarity-legendary',
};

export function NextBadges({ items }: { items: AchievementProgress[] }) {
  const { t } = useTranslation();
  const locale = useGame((s) => s.settings.locale);
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-warn/90">
          {t('badges.nextTitle')}
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-warn/40 to-transparent" aria-hidden />
      </div>

      <ul className="flex flex-col gap-2">
        {items.map(({ achievement, have, need, ratio }) => {
          const rarityClass = RARITY_CLASS[achievement.rarity] ?? 'rarity-common';
          const legendary = achievement.rarity === 'legendary';
          return (
            <li
              key={achievement.id}
              className={`panel-reward ${rarityClass} flex items-center gap-3 rounded-panel px-3 py-2.5`}
            >
              <span
                className={`medallion shrink-0 ${legendary ? 'medallion-shine' : ''}`}
                aria-hidden
              >
                ★
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-display text-sm font-bold text-ink">
                    {achievement.title[locale]}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[10px] font-bold tabular-nums"
                    style={{ color: 'var(--rarity)' }}
                  >
                    {t('badges.toGo', { count: Math.max(0, need - have) })}
                  </span>
                </div>
                {/* Balken in der Rarity-Farbe — die Belohnung faerbt ihren Fortschritt */}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg/80">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.round(ratio * 100)}%`,
                      background:
                        'linear-gradient(90deg, color-mix(in srgb, var(--rarity) 55%, transparent), var(--rarity))',
                      boxShadow: '0 0 8px color-mix(in srgb, var(--rarity) 50%, transparent)',
                    }}
                  />
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-[10px] text-dim/80">
                    {achievement.description[locale]}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-dim/60">
                    {t(`reward.rank.${achievement.rarity}`)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
