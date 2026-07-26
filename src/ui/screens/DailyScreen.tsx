/**
 * Daily Run: 10 seeded Verdict-Aufgaben über einem Tagesregelwerk.
 * Ein Versuch pro Paket, ein gewertetes Ergebnis pro Tag.
 * Share-Text geht nur ins Clipboard — kein Netz.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildShareText,
  dailyPlayStreak,
  dailyStrip,
  generateDaily,
  todayString,
} from '../../game/daily';
import { ParticleBurst } from '../components/ParticleBurst';
import { XpGain } from '../components/XpGain';
import type { VerdictLevel } from '../../game/levels';
import { useGame } from '../../game/store';
import { VerdictScreen } from './VerdictScreen';

export function DailyScreen() {
  const { t } = useTranslation();
  const recordDaily = useGame((s) => s.recordDaily);
  const dailyHistory = useGame((s) => s.dailyHistory);
  const navigate = useGame((s) => s.navigate);

  const date = todayString();
  const run = useMemo(() => generateDaily(date), [date]);
  const recorded = dailyHistory[date];
  const [justFinished, setJustFinished] = useState<boolean[] | null>(null);
  const [copied, setCopied] = useState(false);

  const results = justFinished ?? recorded ?? null;

  const level: VerdictLevel = useMemo(
    () => ({
      id: `daily-${date}`,
      chapter: 0,
      index: 0,
      mode: 'verdict',
      title: { de: `Daily ${date}`, en: `Daily ${date}` },
      briefing: {
        de: 'Zehn Pakete, ein Tagesregelwerk, ein Versuch pro Paket. Gleicher Tag, gleiche Aufgaben — für alle.',
        en: 'Ten packets, one daily ruleset, one attempt per packet. Same day, same tasks — for everyone.',
      },
      difficulty: 2,
      concepts: ['daily'],
      targetSeconds: 45,
      network: run.network,
      packets: run.packets,
    }),
    [run, date],
  );

  if (results) {
    const correct = results.filter(Boolean).length;
    const shareText = buildShareText(date, results);
    const history = Object.entries(dailyHistory);
    const best = history.reduce(
      (max, [, r]) => Math.max(max, r.filter(Boolean).length),
      justFinished ? correct : 0,
    );
    /**
     * Die Stufe folgt dem Ergebnis. Ein 10/10 muss anders AUSSEHEN als ein
     * 5/10 — vorher war beides derselbe graue Rahmen, und damit war der
     * perfekte Lauf ein Ergebnis ohne Moment.
     */
    const share = correct / results.length;
    const rarity =
      correct === results.length
        ? 'rarity-legendary'
        : share >= 0.8
          ? 'rarity-epic'
          : share >= 0.6
            ? 'rarity-rare'
            : 'rarity-common';
    // Der Streifen enthaelt heute schon; bei einem frischen Lauf steht das
    // Ergebnis aber noch nicht im Save, also hier nachtragen
    const strip = dailyStrip(
      justFinished ? { ...dailyHistory, [date]: justFinished } : dailyHistory,
      14,
      date,
    );
    const playStreak = dailyPlayStreak(
      justFinished ? { ...dailyHistory, [date]: justFinished } : dailyHistory,
      date,
    );

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12 pt-6 lg:max-w-lg">
        <section
          className={`panel-reward ${rarity} relative flex flex-col items-center gap-3 rounded-panel px-6 py-6 text-center`}
        >
          {/* Nur bei einem guten Lauf — sonst waere der Jubel unglaubwuerdig */}
          {share >= 0.8 && <ParticleBurst variant="celebration" />}
          <div className="font-display text-xl font-bold text-rarity">
            {t('daily.result', { date })}
          </div>
          <div className="font-display text-4xl font-bold text-ink">
            {correct}
            <span className="text-dim">/{results.length}</span>
          </div>
          <div className="font-mono text-lg tracking-wider" aria-hidden>
            {results.map((r) => (r ? '🟩' : '🟥')).join('')}
          </div>
          {correct === results.length && (
            <div className="font-mono text-[11px] leading-relaxed text-trace">
              {t('daily.flawless')}
            </div>
          )}
          {justFinished && <XpGain gained={correct * 40} />}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(shareText).then(() => setCopied(true));
            }}
            className="rounded-panel bg-claw px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
          >
            {copied ? t('daily.copied') : t('daily.share')}
          </button>
          <div className="font-mono text-xs text-dim">{t('daily.best', { best })}</div>
        </section>

        {/*
          Der Streifen statt einer Liste. Ausgelassene Tage bleiben als Loecher
          sichtbar — eine Liste nur der gespielten Tage sieht immer nach einer
          lueckenlosen Serie aus und waere damit eine Schmeichelei.
        */}
        <section className="panel-inset rounded-panel px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              {t('daily.history')}
            </span>
            {playStreak > 0 && (
              <span className="font-mono text-[11px] text-warn">
                🔥 {t('daily.playStreak', { count: playStreak })}
              </span>
            )}
          </div>
          <ol className="flex items-end gap-1">
            {strip.map((day) => {
              const ratio = day.correct !== null && day.total > 0 ? day.correct / day.total : 0;
              const tone =
                day.correct === null
                  ? 'bg-bg/70'
                  : ratio === 1
                    ? 'bg-trace'
                    : ratio >= 0.6
                      ? 'bg-warn'
                      : 'bg-deny';
              return (
                <li
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={
                    day.correct === null
                      ? `${day.date} — ${t('daily.missed')}`
                      : `${day.date} — ${day.correct}/${day.total}`
                  }
                >
                  <div className="flex h-10 w-full items-end justify-center rounded-sm bg-bg/40">
                    <div
                      className={`w-full rounded-sm ${tone} transition-[height] duration-500`}
                      style={{
                        height: day.correct === null ? '3px' : `${Math.max(12, ratio * 100)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`font-mono text-[9px] tabular-nums ${
                      day.isToday ? 'font-bold text-aura' : 'text-dim/60'
                    }`}
                  >
                    {day.date.slice(8)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <button
          onClick={() => navigate({ name: 'home' })}
          className="rounded-panel border border-line px-5 py-2.5 text-sm text-dim hover:text-ink"
        >
          ← {t('nav.back')}
        </button>
      </div>
    );
  }

  return (
    <VerdictScreen
      level={level}
      dailyMode
      onDailyComplete={(dayResults, score) => {
        recordDaily(date, dayResults, score);
        setJustFinished(dayResults);
      }}
    />
  );
}
