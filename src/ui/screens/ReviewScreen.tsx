/**
 * Review: fünf Aufgaben, gezielt auf die schwachen Konzepte.
 *
 * Kurz gehalten (fünf Stück, ACCEPT/DENY) — es ist eine Wiederholung, kein
 * Kapitel. Nach jeder Antwort steht sofort da, WELCHES Konzept gerade dran
 * war und wie die Engine entschieden hat; die Antwort wird auf dasselbe
 * Konzept gebucht, das die Aufgabe trainiert, damit die Mastery-Messung
 * ehrlich bleibt.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playAccept, playWrong } from '../../game/sound';
import { masteryDeltas, untestedConcepts, weakestConcepts } from '../../game/mastery';
import type { MasteryMap } from '../../game/mastery';
import { reviewAnswerCorrect, reviewPlan } from '../../game/review';
import { useGame } from '../../game/store';
import { ComboMeter } from '../components/ComboMeter';
import { DebugFlowView } from '../components/DebugFlowView';
import { MasteryDeltaList } from '../components/MasteryDeltaList';
import { ParticleBurst } from '../components/ParticleBurst';
import { PacketCard } from '../components/PacketCard';
import { PolicyTable } from '../components/PolicyTable';
import { XpGain } from '../components/XpGain';
import { evaluate } from '../../engine';

type Phase = 'intro' | 'play' | 'result' | 'done';

const TASKS = 5;

export function ReviewScreen() {
  const { t } = useTranslation();
  const navigate = useGame((s) => s.navigate);
  const mastery = useGame((s) => s.mastery);
  const recordConcept = useGame((s) => s.recordConcept);
  const recordReview = useGame((s) => s.recordReview);
  const sound = useGame((s) => s.settings.sound);

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(false);
  /**
   * Der Stand VOR der Sitzung. Muss beim Start eingefroren werden, sonst
   * wandert der Vergleichspunkt mit jeder Antwort mit und das Delta wäre am
   * Ende immer null.
   */
  const [before, setBefore] = useState<MasteryMap>({});

  const weak = useMemo(() => weakestConcepts(mastery, 3).map((m) => m.concept), [mastery]);
  const untested = useMemo(() => untestedConcepts(mastery).map((m) => m.concept), [mastery]);
  // Der Plan wird EINMAL pro Sitzung gezogen, damit er sich nicht unter den
  // Fuessen aendert, waehrend die Mastery sich durch die Antworten bewegt
  const plan = useMemo(() => reviewPlan(weak, untested, seed, TASKS), [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const task = plan[index];
  const verdict = useMemo(() => (task ? evaluate(task.packet, task.network) : null), [task]);
  const deltas = useMemo(() => masteryDeltas(before, mastery), [before, mastery]);

  function answer(action: 'accept' | 'deny') {
    if (!task) return;
    const ok = reviewAnswerCorrect(task, action);
    setLastCorrect(ok);
    // Auf das Konzept buchen, das die Aufgabe TRAINIERT
    recordConcept(task.concept, ok);
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
      recordReview(40 + correctCount * 30);
      setPhase('done');
      return;
    }
    setIndex((i) => i + 1);
    setPhase('play');
  }

  function begin() {
    setBefore(mastery);
    setPhase('play');
  }

  function reset() {
    setSeed(`${Date.now()}`);
    setIndex(0);
    setCorrectCount(0);
    setStreak(0);
    setPhase('intro');
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-aura">🧠 {t('review.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('review.intro')}</p>
        <div className="panel-inset rounded-panel px-4 py-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
            {t('review.focus')}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {(weak.length > 0 ? weak : untested.slice(0, 3)).map((c) => (
              <li
                key={c}
                className="rounded-row border border-aura/40 bg-aura/10 px-2 py-0.5 font-mono text-[11px] text-aura"
              >
                {t(`mastery.concept.${c}`)}
              </li>
            ))}
          </ul>
          {weak.length === 0 && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-dim/80">
              {t('review.noWeakness')}
            </p>
          )}
        </div>
        <button
          onClick={begin}
          className="rounded-panel bg-aura px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('review.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="panel-reward rarity-epic relative flex flex-col items-center gap-4 rounded-panel px-6 py-8 text-center">
          {correctCount > 0 && <ParticleBurst variant="celebration" />}
          <div className="font-display text-2xl font-bold text-trace">✓ {t('review.done')}</div>
          <div className="font-mono text-sm text-ink">
            {t('review.summary', { correct: correctCount, total: plan.length })}
          </div>
          <div className="max-w-sm font-mono text-xs leading-relaxed text-dim">
            {correctCount === plan.length ? t('review.perfect') : t('review.keepGoing')}
          </div>
          <XpGain gained={40 + correctCount * 30} />

          {/* Der eigentliche Lohn: nicht die Punkte, sondern die Bewegung */}
          <MasteryDeltaList deltas={deltas} />

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-panel bg-aura px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('review.again')}
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

  if (!task || !verdict) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      {/* Kopf: wo bin ich, welches Konzept, wie laeuft die Serie */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-dim">
          {index + 1}/{plan.length}
        </span>
        <span className="rounded-row border border-aura/40 bg-aura/10 px-2 py-0.5 font-mono text-[11px] text-aura">
          {t(`mastery.concept.${task.concept}`)}
        </span>
        <ComboMeter streak={streak} />
      </div>

      <PacketCard packet={task.packet} />
      <PolicyTable network={task.network} />

      {phase === 'play' ? (
        <div className="flex gap-3">
          <button
            onClick={() => answer('accept')}
            className="flex-1 rounded-panel bg-trace px-5 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
          >
            ✓ ACCEPT
          </button>
          <button
            onClick={() => answer('deny')}
            className="flex-1 rounded-panel bg-deny px-5 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
          >
            ✕ DENY
          </button>
        </div>
      ) : (
        <div
          className={`panel-reward ${lastCorrect ? 'rarity-uncommon' : 'rarity-legendary'} flex flex-col gap-2 rounded-panel px-4 py-3`}
        >
          <div
            className={`font-display text-lg font-bold ${lastCorrect ? 'text-trace' : 'text-deny'}`}
          >
            {lastCorrect ? t('review.right') : t('review.wrong')}
          </div>
          <div className="font-mono text-xs text-ink">
            {t('review.truth', {
              action: verdict.action.toUpperCase(),
              policy: verdict.matchedPolicyId,
            })}
          </div>
          <div className="font-mono text-[11px] leading-relaxed text-dim">
            {t(`review.lesson.${task.concept}`)}
          </div>
          <DebugFlowView packet={task.packet} verdict={verdict} />
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
