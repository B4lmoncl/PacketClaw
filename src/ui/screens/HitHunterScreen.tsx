/**
 * Hit-Hunter: „welche Regel feuert hier nie?"
 *
 * Der Spieler sieht dasselbe, womit man auf einer echten FortiGate anfängt:
 * eine Policy-Tabelle mit Trefferzahlen, in der genau eine Null steht. Die Null
 * zu FINDEN ist leicht; die Aufgabe ist zu wissen, WARUM sie dasteht — und
 * genau danach fragt der Debrief.
 *
 * Kurze Runden ohne Zeitdruck: der Blick über eine Tabelle braucht Ruhe, ein
 * Countdown würde hier zum Raten erziehen statt zum Lesen.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { huntAnswerCorrect, huntHitCounts, huntPlan } from '../../game/hitHunter';
import { playAccept, playWrong } from '../../game/sound';
import { useGame } from '../../game/store';
import { ComboMeter } from '../components/ComboMeter';
import { ParticleBurst } from '../components/ParticleBurst';
import { PolicyTable } from '../components/PolicyTable';
import { XpGain } from '../components/XpGain';

type Phase = 'play' | 'result' | 'done';

const ROUNDS = 5;

export function HitHunterScreen() {
  const { t } = useTranslation();
  const navigate = useGame((s) => s.navigate);
  const recordHunt = useGame((s) => s.recordHunt);
  const sound = useGame((s) => s.settings.sound);

  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const plan = useMemo(() => huntPlan(seed, ROUNDS), [seed]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('play');
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);

  const round = plan[index];
  // Die Tabelle will eine Map; die reine Funktion liefert bewusst ein Record
  // (leichter zu testen und zu serialisieren), also hier umschlagen
  const hits = useMemo(
    () =>
      new Map(
        Object.entries(round ? huntHitCounts(round, `${seed}-${index}`) : {}).map(([id, n]) => [
          Number(id),
          n,
        ]),
      ),
    [round, seed, index],
  );

  function pick(policyId: number) {
    if (phase !== 'play' || !round) return;
    setPicked(policyId);
    const ok = huntAnswerCorrect(round, policyId);
    if (ok) {
      if (sound) playAccept();
      setCorrectCount((n) => n + 1);
      setStreak((s) => s + 1);
    } else {
      if (sound) playWrong();
      setStreak(0);
    }
    setPhase('result');
  }

  function next() {
    if (index + 1 >= plan.length) {
      recordHunt(60 + correctCount * 40);
      setPhase('done');
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
    setPhase('play');
  }

  function reset() {
    setSeed(`${Date.now()}`);
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setStreak(0);
    setPhase('play');
  }

  if (phase === 'done') {
    const perfect = correctCount === plan.length;
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section
          className={`panel-reward ${perfect ? 'rarity-legendary' : 'rarity-rare'} relative flex flex-col items-center gap-4 rounded-panel px-6 py-8 text-center`}
        >
          {correctCount > 0 && <ParticleBurst variant="celebration" />}
          <div className="font-display text-2xl font-bold text-trace">✓ {t('hunt.done')}</div>
          <div className="font-mono text-sm text-ink">
            {t('hunt.summary', { correct: correctCount, total: plan.length })}
          </div>
          <p className="max-w-sm font-mono text-xs leading-relaxed text-dim">
            {perfect ? t('hunt.perfect') : t('hunt.keepGoing')}
          </p>
          <XpGain gained={60 + correctCount * 40} />
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-panel bg-aura px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('hunt.again')}
            </button>
            <button
              onClick={() => navigate({ name: 'home' })}
              className="rounded-panel border border-line px-5 py-2.5 font-display font-bold text-dim hover:text-ink"
            >
              {t('review.toMenu')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!round) return null;
  const wasRight = picked !== null && huntAnswerCorrect(round, picked);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-10 pt-3 lg:max-w-6xl lg:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-dim">
          {index + 1}/{plan.length}
        </span>
        <h1 className="font-display text-lg font-bold text-aura">🔍 {t('hunt.title')}</h1>
        <ComboMeter streak={streak} />
      </div>

      <p className="panel-inset rounded-panel px-4 py-3 text-sm leading-relaxed text-ink">
        {t('hunt.prompt')}
      </p>

      <PolicyTable
        network={round.network}
        hitCounts={hits}
        selectable={phase === 'play'}
        onSelect={phase === 'play' ? pick : undefined}
        selectedId={picked}
      />

      {phase === 'result' && (
        <div
          className={`panel-reward ${wasRight ? 'rarity-uncommon' : 'rarity-legendary'} flex flex-col gap-2 rounded-panel px-4 py-3`}
        >
          <div
            className={`font-display text-lg font-bold ${wasRight ? 'text-trace' : 'text-deny'}`}
          >
            {wasRight ? t('hunt.right') : t('hunt.wrong')}
          </div>
          <div className="font-mono text-xs text-ink">
            {t('hunt.answer', { id: round.deadPolicyId })}
          </div>
          {/* Das WARUM ist die eigentliche Lektion — die Null zu finden ist leicht */}
          <div className="font-mono text-[11px] leading-relaxed text-dim">
            {round.reason === 'shadowed'
              ? t('hunt.why.shadowed', { by: round.shadowedBy })
              : t(`hunt.why.${round.reason}`)}
          </div>
          <button
            onClick={next}
            className="mt-1 self-start rounded-panel bg-aura px-5 py-2 font-display font-bold text-bg hover:brightness-110"
          >
            {index + 1 >= plan.length ? t('review.finish') : t('review.next')} →
          </button>
        </div>
      )}
    </div>
  );
}
