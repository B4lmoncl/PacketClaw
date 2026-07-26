import { useTranslation } from 'react-i18next';
import { CHAPTERS, levelsForChapter } from '../../game/levels';
import { nextLevel } from '../../game/campaign';
import { isChapterUnlocked, isLevelUnlocked, useGame } from '../../game/store';
import { StarBar } from '../components/StarBar';

/**
 * Levelauswahl als FORTSCHRITTSPFAD. Vorher ein flaches Raster gleich
 * aussehender Knöpfe — man sah nicht, wo man steht und wie weit es noch ist.
 *
 * Jetzt tragen die Karten ihren Zustand:
 *   geschafft (3★)  Rarity-Rahmen legendär, goldene Kante
 *   geschafft       Rarity-Rahmen uncommon (grün)
 *   HIER            .panel-hero mit „Du bist hier"-Marke — das Ziel des Blicks
 *   offen           .panel-action, anfassbar
 *   gesperrt        .panel-inset, sichtbar unanfassbar
 * Boss-Level (Index 10) sind breiter und bekommen eine eigene Kante.
 */
export function ChapterScreen({ chapter }: { chapter: number }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const navigate = useGame((s) => s.navigate);
  const stars = useGame((s) => s.stars);

  const levels = levelsForChapter(chapter);
  const chapterMeta = CHAPTERS.find((c) => c.number === chapter);
  const current = nextLevel(stars);

  const done = levels.filter((l) => (stars[l.id] ?? 0) >= 1).length;
  const earned = levels.reduce((sum, l) => sum + Math.min(3, stars[l.id] ?? 0), 0);
  const pct = levels.length > 0 ? Math.round((done / levels.length) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 pt-4 lg:max-w-6xl lg:px-6">
      {/* Kapitel-Schiene: zeigt pro Kapitel den Sternestand statt nur die Nummer */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label={t('nav.chapters')}
      >
        {CHAPTERS.map((c) => {
          const chLevels = levelsForChapter(c.number);
          const unlocked = isChapterUnlocked(c.number, stars) && chLevels.length > 0;
          const active = c.number === chapter;
          const chDone = chLevels.filter((l) => (stars[l.id] ?? 0) >= 1).length;
          const complete = chLevels.length > 0 && chDone === chLevels.length;
          return (
            <button
              key={c.number}
              role="tab"
              aria-selected={active}
              disabled={!unlocked}
              onClick={() => navigate({ name: 'chapter', chapter: c.number })}
              className={`flex shrink-0 items-center gap-1.5 rounded-row border px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw ${
                active
                  ? 'border-claw bg-claw/15 text-claw'
                  : complete
                    ? 'border-trace/50 text-trace hover:bg-trace/10'
                    : unlocked
                      ? 'border-line text-dim hover:text-ink'
                      : 'cursor-not-allowed border-line/50 text-dim/40'
              }`}
            >
              <span>{c.number}</span>
              {!unlocked && <span aria-hidden>🔒</span>}
              {unlocked && complete && <span aria-hidden>✓</span>}
              {unlocked && !complete && chDone > 0 && (
                <span className="text-[10px] text-dim/70">
                  {chDone}/{chLevels.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Kapitel-Kopf mit Fortschritt — „wie weit bin ich hier?" */}
      <header className="panel-inset flex flex-col gap-2 rounded-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-xl font-bold lg:text-2xl">
            <span className="text-dim">{t('nav.chapter', { number: chapter })}:</span>{' '}
            {chapterMeta?.title[locale]}
          </h1>
          <span className="font-mono text-xs text-dim">
            {done}/{levels.length} · <span className="text-warn">{earned}</span>
            <span className="text-dim/70">/{levels.length * 3} ★</span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-claw via-warn to-trace transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        {levels.map((level) => {
          const unlocked = isLevelUnlocked(level.id, stars);
          const levelStars = stars[level.id] ?? 0;
          const isBoss = level.index === 10;
          const isCurrent = current?.id === level.id;

          // Material nach Zustand — die Oberfläche sagt, was die Karte ist
          const material = !unlocked
            ? 'panel-inset cursor-not-allowed opacity-70'
            : isCurrent
              ? 'panel-hero'
              : levelStars >= 3
                ? 'panel-reward rarity-legendary'
                : levelStars >= 1
                  ? 'panel-reward rarity-uncommon'
                  : 'panel-action';

          return (
            <button
              key={level.id}
              disabled={!unlocked}
              onClick={() => navigate({ name: 'level', levelId: level.id })}
              className={`cv-auto relative flex flex-col gap-1.5 rounded-panel p-3 text-left transition-transform duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw ${material} ${
                unlocked ? 'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0' : ''
              } ${isBoss ? 'sm:col-span-2 lg:col-span-1' : ''}`}
            >
              {/* „Du bist hier" inline in der Kopfzeile: eine ueberstehende
                  Marke wuerde von cv-auto (content-visibility) geclippt */}
              <div className="flex items-center justify-between gap-1 font-mono text-[10px] uppercase tracking-wide text-dim">
                {isCurrent ? (
                  <span className="rounded-full bg-claw px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-bg">
                    {t('level.youAreHere')}
                  </span>
                ) : (
                  <span className={isBoss ? 'font-bold text-warn' : ''}>
                    {isBoss ? `★ ${t('level.boss')}` : t('level.level', { index: level.index })}
                  </span>
                )}
                <span aria-hidden title={`${level.difficulty}/3`}>
                  {'●'.repeat(level.difficulty)}
                  <span className="text-dim/30">{'●'.repeat(3 - level.difficulty)}</span>
                </span>
              </div>
              <div className="min-h-[2.2rem] font-display text-sm font-bold leading-tight text-ink">
                {unlocked ? level.title[locale] : t('level.locked')}
              </div>
              <div className="flex items-center justify-between">
                <StarBar stars={levelStars} size={13} />
                {levelStars >= 3 && (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-warn">
                    {t('level.perfect')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
