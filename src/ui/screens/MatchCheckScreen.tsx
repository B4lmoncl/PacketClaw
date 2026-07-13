/**
 * Match-Check (Casual): 45 Sekunden, pro Frage EINE Regel + EIN Paket —
 * matcht die Regel? Bei "kein Match" leuchtet nach der Antwort das Feld
 * rot, an dem die Regel scheitert (Engine-Trace als Lehrer).
 */
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRng } from '../../engine';
import { blitzPoints } from '../../game/blitz';
import {
  generateMatchPool,
  MATCHCHECK_SECONDS,
  matchQuestion,
  type MatchQuestion,
} from '../../game/matchcheck';
import { playAccept, playWrong } from '../../game/sound';
import { useGame } from '../../game/store';
import { PacketCard } from '../components/PacketCard';
import { ParticleBurst } from '../components/ParticleBurst';
import { PolicyTable, type RowHighlight } from '../components/PolicyTable';
import { XpGain } from '../components/XpGain';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

type Phase = 'intro' | 'run' | 'done';

const FEEDBACK_MS = 800;

export function MatchCheckScreen() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const sound = useGame((s) => s.settings.sound);
  const matchBest = useGame((s) => s.matchBest);
  const recordMatchCheck = useGame((s) => s.recordMatchCheck);
  const navigate = useGame((s) => s.navigate);

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const pool = useMemo(() => generateMatchPool(seed), [seed]);
  const rng = useMemo(() => createRng(`${seed}-q`), [seed]);

  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<MatchQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(MATCHCHECK_SECONDS);
  const [highlights, setHighlights] = useState<Map<number, RowHighlight> | undefined>();
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);
  const endsAt = useRef(0);
  const lockRef = useRef(false);

  function start() {
    endsAt.current = Date.now() + MATCHCHECK_SECONDS * 1000;
    setQuestion(matchQuestion(rng, pool, 0));
    setIndex(1);
    setPhase('run');
  }

  useEffect(() => {
    if (phase !== 'run') return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(timer);
        setPhase('done');
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') recordMatchCheck(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function answer(saysMatch: boolean) {
    if (!question || lockRef.current || phase !== 'run') return;
    lockRef.current = true;
    const correct = saysMatch === question.matches;
    setAnswered((n) => n + 1);
    setFlash(correct ? 'correct' : 'wrong');
    // Feedback: Match → Zeile leuchtet; kein Match → das scheiternde Feld rot
    setHighlights(
      new Map([
        [
          1,
          question.matches
            ? { state: 'matched-accept' }
            : { state: 'failed', failedField: question.failedField },
        ],
      ]),
    );
    if (correct) {
      if (sound) playAccept();
      setScore((s) => s + blitzPoints(streak));
      setStreak((s) => s + 1);
      setCorrectCount((n) => n + 1);
    } else {
      if (sound) playWrong();
      setStreak(0);
    }
    window.setTimeout(() => {
      lockRef.current = false;
      setFlash(null);
      setHighlights(undefined);
      setQuestion(matchQuestion(rng, pool, index));
      setIndex((i) => i + 1);
    }, FEEDBACK_MS);
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-trace">🎯 {t('matchcheck.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('matchcheck.intro')}</p>
        {matchBest > 0 && (
          <p className="font-mono text-xs text-dim">
            {t('blitz.best')}: <span className="font-bold text-trace">{matchBest}</span>
          </p>
        )}
        <button
          onClick={start}
          className="rounded-panel bg-trace px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('blitz.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const isRecord = score > 0 && score >= matchBest;
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          {score > 0 && <ParticleBurst variant="celebration" />}
          <div className="font-display text-2xl font-bold text-trace">🎯 {t('blitz.done')}</div>
          <div className="font-mono text-4xl font-bold tabular-nums text-ink">{score}</div>
          <div className="font-mono text-xs text-dim">
            {t('blitz.summary', { correct: correctCount, total: answered })}
          </div>
          {isRecord && (
            <div className="rounded-row border border-trace/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-trace">
              {t('blitz.newBest')}
            </div>
          )}
          <XpGain gained={score} />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSeed(`${Date.now()}`);
                setIndex(0);
                setQuestion(null);
                setScore(0);
                setStreak(0);
                setAnswered(0);
                setCorrectCount(0);
                setSecondsLeft(MATCHCHECK_SECONDS);
                setPhase('intro');
              }}
              className="rounded-panel bg-trace px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('blitz.again')}
            </button>
            <button
              onClick={() => navigate({ name: 'home' })}
              className="rounded-panel border border-line px-5 py-2.5 font-display font-bold text-dim hover:text-ink"
            >
              {t('score.toChapter')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const buttons = (
    <>
      <button
        onClick={() => answer(true)}
        className="h-14 flex-1 rounded-panel border border-trace/50 font-display text-lg font-bold text-trace hover:bg-trace/10"
      >
        ✓ {t('matchcheck.matches')}
      </button>
      <button
        onClick={() => answer(false)}
        className="h-14 flex-1 rounded-panel border border-deny/50 font-display text-lg font-bold text-deny hover:bg-deny/10"
      >
        ✕ {t('matchcheck.noMatch')}
      </button>
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-28 pt-3 lg:max-w-4xl lg:px-6 lg:pb-8">
      <div className="flex items-center gap-3 font-mono text-sm">
        <div
          className={`rounded-panel border px-3 py-1 font-bold tabular-nums ${
            secondsLeft <= 10 ? 'border-deny text-deny' : 'border-trace/50 text-trace'
          }`}
          role="timer"
        >
          {secondsLeft}s
        </div>
        <div className="h-1.5 flex-1 overflow-hidden rounded-row bg-bg">
          <div
            className={`h-full rounded-row ${secondsLeft <= 10 ? 'bg-deny' : 'bg-trace'}`}
            style={{
              width: `${(secondsLeft / MATCHCHECK_SECONDS) * 100}%`,
              transition: reducedMotion ? undefined : 'width 150ms linear',
            }}
          />
        </div>
        <div className="tabular-nums text-ink">
          {score} <span className="text-[10px] uppercase text-dim">{t('blitz.points')}</span>
        </div>
        {streak >= 2 && (
          <motion.div
            key={streak}
            initial={reducedMotion ? false : { scale: 1.3 }}
            animate={{ scale: 1 }}
            className="rounded-row bg-claw/15 px-1.5 py-0.5 text-xs font-bold text-claw"
          >
            ×{streak}
          </motion.div>
        )}
      </div>

      {question && (
        <>
          <PolicyTable network={question.network} highlights={highlights} />
          <PacketCard packet={question.packet} />
        </>
      )}
      <p className="text-center text-sm text-dim" aria-live="polite">
        {flash === 'correct' ? (
          <span className="font-bold text-trace">✓ {t('verdict.correct')}</span>
        ) : flash === 'wrong' ? (
          <span className="font-bold text-deny">✕ {t('verdict.wrong')}</span>
        ) : (
          t('matchcheck.question')
        )}
      </p>
      <div className="hidden gap-3 lg:flex">{buttons}</div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-2xl gap-3">{buttons}</div>
      </div>
    </div>
  );
}
