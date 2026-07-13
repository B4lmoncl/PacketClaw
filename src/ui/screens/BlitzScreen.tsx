/**
 * Blitz (Casual): 60 Sekunden, ein kleines Regelwerk, Paket um Paket nur
 * "kommt das durch?" — ACCEPT oder DENY. Nach jeder Antwort blitzt kurz die
 * Regel auf, die wirklich gezogen hat (First Match lernen nebenbei).
 */
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRng } from '../../engine';
import type { Packet, PolicyAction } from '../../engine';
import {
  BLITZ_SECONDS,
  blitzPacket,
  blitzPoints,
  blitzVerdict,
  generateBlitzArena,
} from '../../game/blitz';
import { playAccept, playWrong } from '../../game/sound';
import { useGame } from '../../game/store';
import { ParticleBurst } from '../components/ParticleBurst';
import { PacketCard } from '../components/PacketCard';
import { PolicyTable, type RowHighlight } from '../components/PolicyTable';
import { XpGain } from '../components/XpGain';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

type Phase = 'intro' | 'run' | 'done';

const FEEDBACK_MS = 700;

export function BlitzScreen() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const sound = useGame((s) => s.settings.sound);
  const blitzBest = useGame((s) => s.blitzBest);
  const recordBlitz = useGame((s) => s.recordBlitz);
  const navigate = useGame((s) => s.navigate);

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const network = useMemo(() => generateBlitzArena(seed), [seed]);
  const rng = useMemo(() => createRng(`${seed}-packets`), [seed]);

  const [index, setIndex] = useState(0);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(BLITZ_SECONDS);
  const [highlights, setHighlights] = useState<Map<number, RowHighlight> | undefined>();
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);
  const endsAt = useRef(0);
  const lockRef = useRef(false);

  function start() {
    endsAt.current = Date.now() + BLITZ_SECONDS * 1000;
    setPacket(blitzPacket(rng, network, 0));
    setIndex(1);
    setPhase('run');
  }

  // Countdown; bei 0 ist Schluss (laufendes Feedback darf zu Ende spielen)
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
    if (phase === 'done') recordBlitz(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function answer(action: PolicyAction) {
    if (!packet || lockRef.current || phase !== 'run') return;
    lockRef.current = true;
    const verdict = blitzVerdict(packet, network);
    const correct = verdict.action === action;
    setAnswered((n) => n + 1);
    setFlash(correct ? 'correct' : 'wrong');
    setHighlights(
      new Map([
        [
          verdict.matchedPolicyId,
          {
            state:
              verdict.matchedPolicyId === 0
                ? 'implicit-hit'
                : verdict.action === 'accept'
                  ? 'matched-accept'
                  : 'matched-deny',
          },
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
      setPacket(blitzPacket(rng, network, index));
      setIndex((i) => i + 1);
    }, FEEDBACK_MS);
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-warn">⚡ {t('blitz.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('blitz.intro')}</p>
        {blitzBest > 0 && (
          <p className="font-mono text-xs text-dim">
            {t('blitz.best')}: <span className="font-bold text-warn">{blitzBest}</span>
          </p>
        )}
        <button
          onClick={start}
          className="rounded-panel bg-warn px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('blitz.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const isRecord = score > 0 && score >= blitzBest;
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-warn/50 bg-panel px-6 py-8 text-center">
          {score > 0 && <ParticleBurst variant="celebration" />}
          <div className="font-display text-2xl font-bold text-warn">⚡ {t('blitz.done')}</div>
          <div className="font-mono text-4xl font-bold tabular-nums text-ink">{score}</div>
          <div className="font-mono text-xs text-dim">
            {t('blitz.summary', { correct: correctCount, total: answered })}
          </div>
          {isRecord && (
            <div className="rounded-row border border-warn/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warn">
              {t('blitz.newBest')}
            </div>
          )}
          <XpGain gained={score} />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSeed(`${Date.now()}`);
                setIndex(0);
                setPacket(null);
                setScore(0);
                setStreak(0);
                setAnswered(0);
                setCorrectCount(0);
                setSecondsLeft(BLITZ_SECONDS);
                setPhase('intro');
              }}
              className="rounded-panel bg-warn px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-28 pt-3 lg:max-w-7xl lg:px-6 lg:pb-8">
      {/* Kopfzeile: Timer-Balken + Score + Serie */}
      <div className="flex items-center gap-3 font-mono text-sm">
        <div
          className={`rounded-panel border px-3 py-1 font-bold tabular-nums ${
            secondsLeft <= 10 ? 'border-deny text-deny' : 'border-warn/50 text-warn'
          }`}
          role="timer"
        >
          {secondsLeft}s
        </div>
        <div className="h-1.5 flex-1 overflow-hidden rounded-row bg-bg">
          <div
            className={`h-full rounded-row ${secondsLeft <= 10 ? 'bg-deny' : 'bg-warn'}`}
            style={{
              width: `${(secondsLeft / BLITZ_SECONDS) * 100}%`,
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

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <PolicyTable network={network} highlights={highlights} />
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:top-16">
          {packet && <PacketCard packet={packet} />}
          <p className="text-center text-sm text-dim" aria-live="polite">
            {flash === 'correct' ? (
              <span className="font-bold text-trace">✓ {t('verdict.correct')}</span>
            ) : flash === 'wrong' ? (
              <span className="font-bold text-deny">✕ {t('verdict.wrong')}</span>
            ) : (
              t('blitz.question')
            )}
          </p>
          <div className="hidden gap-3 lg:flex">
            <button
              onClick={() => answer('accept')}
              className="h-14 flex-1 rounded-panel border border-trace/50 font-display text-lg font-bold text-trace hover:bg-trace/10"
            >
              ✓ {t('verdict.accept')}
            </button>
            <button
              onClick={() => answer('deny')}
              className="h-14 flex-1 rounded-panel border border-deny/50 font-display text-lg font-bold text-deny hover:bg-deny/10"
            >
              ✕ {t('verdict.deny')}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: grosse Daumen-Buttons unten */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-2xl gap-3">
          <button
            onClick={() => answer('accept')}
            className="h-14 flex-1 rounded-panel border border-trace/50 font-display text-lg font-bold text-trace hover:bg-trace/10"
          >
            ✓ {t('verdict.accept')}
          </button>
          <button
            onClick={() => answer('deny')}
            className="h-14 flex-1 rounded-panel border border-deny/50 font-display text-lg font-bold text-deny hover:bg-deny/10"
          >
            ✕ {t('verdict.deny')}
          </button>
        </div>
      </div>
    </div>
  );
}
