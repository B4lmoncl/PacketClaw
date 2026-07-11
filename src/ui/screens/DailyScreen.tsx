/**
 * Daily Run: 10 seeded Verdict-Aufgaben über einem Tagesregelwerk.
 * Ein Versuch pro Paket, ein gewertetes Ergebnis pro Tag.
 * Share-Text geht nur ins Clipboard — kein Netz.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildShareText, generateDaily, todayString } from '../../game/daily';
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
    const history = Object.entries(dailyHistory).sort(([a], [b]) => b.localeCompare(a));
    const best = history.reduce(
      (max, [, r]) => Math.max(max, r.filter(Boolean).length),
      justFinished ? correct : 0,
    );
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-6">
        <section className="flex flex-col items-center gap-3 rounded-panel border border-claw/50 bg-panel px-6 py-6 text-center">
          <div className="font-display text-xl font-bold text-claw">
            {t('daily.result', { date })}
          </div>
          <div className="font-mono text-3xl font-bold text-ink">
            {correct}
            <span className="text-dim">/{results.length}</span>
          </div>
          <div className="font-mono text-lg tracking-wider" aria-hidden>
            {results.map((r) => (r ? '🟩' : '🟥')).join('')}
          </div>
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

        {history.length > 0 && (
          <section className="rounded-panel border border-line bg-panel px-4 py-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-dim">
              {t('daily.history')}
            </div>
            <ul className="space-y-1 font-mono text-xs">
              {history.slice(0, 14).map(([day, dayResults]) => (
                <li key={day} className="flex justify-between">
                  <span className="text-dim">{day}</span>
                  <span>
                    {dayResults.filter(Boolean).length}/{dayResults.length}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
