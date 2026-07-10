import { useTranslation } from 'react-i18next';
import { CHAPTERS, levelsForChapter } from '../../game/levels';
import { isChapterUnlocked, isLevelUnlocked, useGame } from '../../game/store';
import { StarBar } from '../components/StarBar';

/** Levelauswahl im Quest-Board-Stil (QuestHall-Anleihe): Karten statt Liste. */
export function ChapterScreen({ chapter }: { chapter: number }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const navigate = useGame((s) => s.navigate);
  const stars = useGame((s) => s.stars);

  const levels = levelsForChapter(chapter);
  const chapterMeta = CHAPTERS.find((c) => c.number === chapter);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 pt-4">
      {/* Kapitel-Leiste */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Kapitel">
        {CHAPTERS.map((c) => {
          const unlocked =
            isChapterUnlocked(c.number, stars) && levelsForChapter(c.number).length > 0;
          const active = c.number === chapter;
          return (
            <button
              key={c.number}
              role="tab"
              aria-selected={active}
              disabled={!unlocked}
              onClick={() => navigate({ name: 'chapter', chapter: c.number })}
              className={`shrink-0 rounded-row border px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw ${
                active
                  ? 'border-claw bg-claw/15 text-claw'
                  : unlocked
                    ? 'border-line text-dim hover:text-ink'
                    : 'cursor-not-allowed border-line/50 text-dim/40'
              }`}
            >
              {c.number} {!unlocked && '🔒'}
            </button>
          );
        })}
      </div>

      <h1 className="font-display text-xl font-bold">
        <span className="text-dim">{t('nav.chapter', { number: chapter })}:</span>{' '}
        {chapterMeta?.title[locale]}
      </h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {levels.map((level) => {
          const unlocked = isLevelUnlocked(level.id, stars);
          const levelStars = stars[level.id] ?? 0;
          const isBoss = level.index === 10;
          return (
            <button
              key={level.id}
              disabled={!unlocked}
              onClick={() => navigate({ name: 'level', levelId: level.id })}
              className={`cv-auto flex flex-col gap-1.5 rounded-panel border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw ${
                isBoss ? 'border-warn/60' : 'border-line'
              } ${
                unlocked
                  ? 'bg-panel hover:bg-white/[0.03]'
                  : 'cursor-not-allowed bg-panel/40 opacity-50'
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-dim">
                <span className={isBoss ? 'text-warn' : ''}>
                  {isBoss ? `★ ${t('level.boss')}` : t('level.level', { index: level.index })}
                </span>
                <span aria-hidden>{'●'.repeat(level.difficulty)}</span>
              </div>
              <div className="min-h-[2.2rem] font-display text-sm font-bold leading-tight text-ink">
                {unlocked ? level.title[locale] : t('level.locked')}
              </div>
              <StarBar stars={levelStars} size={13} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
