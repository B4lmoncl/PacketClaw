/**
 * „Noch N bis zum Abzeichen" — die Abzeichen, die zum Greifen nah sind.
 *
 * 39 Achievements lagen bisher unsichtbar herum; man erfuhr erst davon, wenn
 * eines aufploppte. Sichtbarer Fortschritt auf die naechstliegenden macht aus
 * einem Ueberraschungs-Popup ein Ziel.
 */
import { useTranslation } from 'react-i18next';
import type { AchievementProgress } from '../../game/progression';
import { useGame } from '../../game/store';

const RARITY: Record<string, string> = {
  common: 'text-dim',
  rare: 'text-trace',
  epic: 'text-aura',
  legendary: 'text-warn',
};

export function NextBadges({ items }: { items: AchievementProgress[] }) {
  const { t } = useTranslation();
  const locale = useGame((s) => s.settings.locale);
  if (items.length === 0) return null;

  return (
    <section className="glass rounded-panel px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
          {t('badges.nextTitle')}
        </h2>
        <div className="h-px flex-1 bg-line/60" aria-hidden />
      </div>
      <ul className="flex flex-col gap-2">
        {items.map(({ achievement, have, need, ratio }) => (
          <li key={achievement.id} className="flex items-center gap-3">
            <span className={`shrink-0 text-lg ${RARITY[achievement.rarity] ?? ''}`}>🏅</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-sm font-bold text-ink">
                  {achievement.title[locale]}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-warn">
                  {t('badges.toGo', { count: Math.max(0, need - have) })}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-warn to-claw transition-[width] duration-500"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-dim/80">
                {achievement.description[locale]}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
