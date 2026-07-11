/**
 * Profil: Rang mit XP-Fortschritt, Daily-Streak (+ Freeze-Tokens),
 * Statistiken und die Achievement-Galerie mit Rarity-Glow.
 */
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, rankFor, RANKS } from '../../game/progression';
import { useGame } from '../../game/store';
import { colors } from '../../theme/tokens';
import { Mascot } from '../components/Mascot';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const xp = useGame((s) => s.xp);
  const stars = useGame((s) => s.stars);
  const stats = useGame((s) => s.stats);
  const streak = useGame((s) => s.streak);
  const achievements = useGame((s) => s.achievements);

  const { rank, next, progress } = rankFor(xp);
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);
  const unlockedSet = new Set(achievements);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 pb-8 pt-4">
      {/* Rang */}
      <section className="flex items-center gap-4 rounded-panel border border-claw/40 bg-panel px-4 py-4">
        <Mascot pose="idle" size={64} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-bold text-claw">{rank.name}</div>
          <div className="mt-1 h-2 overflow-hidden rounded-row bg-bg">
            <div
              className="h-full rounded-row bg-gradient-to-r from-claw to-warn transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-dim">
            <span>{xp} XP</span>
            {next ? (
              <span>{t('profile.nextRank', { rank: next.name, xp: next.minXp })}</span>
            ) : (
              <span>{t('profile.maxRank')}</span>
            )}
          </div>
        </div>
      </section>

      {/* Streak + Kennzahlen */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-panel border border-warn/40 bg-panel px-3 py-2 text-center">
          <div className="font-mono text-2xl font-bold text-warn">{streak.current}</div>
          <div className="font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('profile.streak')}
          </div>
          <div className="font-mono text-[9px] text-dim">
            ❄ ×{streak.freezeTokens} · {t('profile.best')} {streak.best}
          </div>
        </div>
        <div className="rounded-panel border border-line bg-panel px-3 py-2 text-center">
          <div className="font-mono text-2xl font-bold text-warn">{totalStars}</div>
          <div className="font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('score.stars')}
          </div>
        </div>
        <div className="rounded-panel border border-line bg-panel px-3 py-2 text-center">
          <div className="font-mono text-2xl font-bold text-trace">{stats.levelsSolved}</div>
          <div className="font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('profile.levels')}
          </div>
        </div>
      </section>

      {/* Ränge-Leiter */}
      <section className="rounded-panel border border-line bg-panel px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-dim">
          {t('profile.ranks')}
        </div>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
          {RANKS.map((r) => (
            <li
              key={r.id}
              className={`flex justify-between ${xp >= r.minXp ? 'text-trace' : 'text-dim/60'}`}
            >
              <span>{r.name}</span>
              <span>{r.minXp}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Achievements */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t('profile.achievements')}
          </span>
          <span className="font-mono text-[10px] text-dim">
            {achievements.length}/{ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = unlockedSet.has(achievement.id);
            const glow = colors.rarity[achievement.rarity];
            return (
              <div
                key={achievement.id}
                className={`rounded-panel border px-3 py-2 ${unlocked ? 'bg-panel' : 'bg-panel/40 opacity-55'}`}
                style={
                  unlocked
                    ? { borderColor: glow, boxShadow: `0 0 10px ${glow}33` }
                    : { borderColor: colors.line }
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-ink">
                    {unlocked ? achievement.title[locale] : '???'}
                  </span>
                  <span
                    className="shrink-0 rounded-row px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide"
                    style={{ color: glow, border: `1px solid ${glow}66` }}
                  >
                    {t(`profile.rarity.${achievement.rarity}`)}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-dim">
                  {achievement.description[locale]}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
