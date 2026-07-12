/**
 * Endlos-Modus (Survival): Runde für Runde prozedural erzeugte Verdict-
 * Aufgaben mit steigender Schwierigkeit. Drei Leben; falsch oder Timeout
 * kostet eins. Bestwert (Score) wandert in den Spielstand.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate, type PolicyAction } from '../../engine';
import { generateEndlessRound, START_LIVES } from '../../game/endless';
import { comboMultiplier } from '../../game/scoring';
import { playChime } from '../../game/sound';
import { useGame } from '../../game/store';
import { Debrief } from '../components/Debrief';
import { Mascot } from '../components/Mascot';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { PacketCard } from '../components/PacketCard';
import { PolicyTable } from '../components/PolicyTable';
import { useDescent } from '../hooks/useDescent';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

type Phase = 'answer' | 'descent' | 'debrief' | 'over';

export function EndlessScreen() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const navigate = useGame((s) => s.navigate);
  const recordEndless = useGame((s) => s.recordEndless);
  const endlessBest = useGame((s) => s.endlessBest);

  const seed = useRef(`endless-${Date.now()}`);
  const [round, setRound] = useState(1);
  const [lives, setLives] = useState(START_LIVES);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [phase, setPhase] = useState<Phase>('answer');
  const [userAction, setUserAction] = useState<PolicyAction | null>(null);
  const [userPolicyId, setUserPolicyId] = useState<number | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(Date.now());

  const data = useMemo(() => generateEndlessRound(seed.current, round), [round]);
  const verdict = useMemo(() => evaluate(data.packet, data.network), [data]);

  const onDescentDone = useCallback(() => setPhase('debrief'), []);
  const descent = useDescent(verdict, reducedMotion, onDescentDone);

  const loseLife = useCallback(() => {
    setCombo(0);
    setLives((l) => l - 1);
  }, []);

  // Countdown pro Runde: Ablauf = Fehler (Leben weg)
  useEffect(() => {
    if (phase !== 'answer') return;
    setSecondsLeft(data.targetSeconds);
    startedAt.current = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        data.targetSeconds - Math.floor((Date.now() - startedAt.current) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        setTimedOut(true);
        setLastCorrect(false);
        setUserAction(null);
        setUserPolicyId(null);
        loseLife();
        setPhase('descent');
        descent.start();
      }
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  function submit(policyId: number) {
    if (userAction === null) return;
    setUserPolicyId(policyId);
    const correct = userAction === verdict.action && policyId === verdict.matchedPolicyId;
    setLastCorrect(correct);
    setTimedOut(false);
    if (correct) {
      const secBonus = secondsLeft ? secondsLeft * 4 : 0;
      const points = Math.round((100 + secBonus) * comboMultiplier(combo));
      setScore((s) => s + points);
      setCombo((c) => c + 1);
    } else {
      loseLife();
    }
    setPhase('descent');
    descent.start();
  }

  function advance() {
    descent.reset();
    if (lives <= 0) {
      finish();
      return;
    }
    setRound((r) => r + 1);
    setUserAction(null);
    setUserPolicyId(null);
    setPhase('answer');
  }

  function finish() {
    recordEndless(round, score);
    playChime(score >= endlessBest.score ? 3 : 0);
    setPhase('over');
  }

  const isNewBest = score > 0 && score >= endlessBest.score;

  if (phase === 'over') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 pb-8 pt-10 text-center">
        <Mascot pose="facepalm" size={72} />
        <h1 className="font-display text-2xl font-bold text-claw">{t('endless.gameOver')}</h1>
        <div className="flex w-full flex-col gap-1 rounded-panel border border-line bg-panel px-6 py-5 font-mono">
          <Stat label={t('endless.roundsSurvived')} value={round} />
          <Stat label={t('endless.score')} value={score} accent />
          <Stat label={t('endless.best')} value={Math.max(score, endlessBest.score)} />
        </div>
        {isNewBest && <div className="font-mono text-sm text-trace">{t('endless.newBest')}</div>}
        <div className="flex w-full gap-2">
          <button
            onClick={() => {
              seed.current = `endless-${Date.now()}`;
              setRound(1);
              setLives(START_LIVES);
              setScore(0);
              setCombo(0);
              setUserAction(null);
              setUserPolicyId(null);
              setTimedOut(false);
              setPhase('answer');
            }}
            className="flex-1 rounded-panel bg-claw px-5 py-3 font-display font-bold text-bg hover:brightness-110"
          >
            {t('endless.again')}
          </button>
          <button
            onClick={() => navigate({ name: 'home' })}
            className="flex-1 rounded-panel border border-line px-5 py-3 text-sm text-dim hover:text-ink"
          >
            {t('nav.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-28 pt-3 lg:max-w-7xl lg:px-6 lg:pb-8">
      {/* HUD: Runde · Leben · Score · Combo */}
      <div className="flex items-center justify-between gap-2 font-mono text-xs">
        <span className="text-dim">
          {t('endless.round')} <span className="text-ink">{round}</span>
        </span>
        <span aria-label={t('endless.lives')} className="tracking-widest">
          {Array.from({ length: START_LIVES }, (_, i) => (
            <span key={i} className={i < lives ? 'text-deny' : 'text-line'}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          {t('endless.score')} <span className="text-trace">{score}</span>
          {combo > 1 && (
            <span className="ml-2 text-warn">×{comboMultiplier(combo).toFixed(1)}</span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <NetworkDiagram network={data.network} />
          <div className="lg:hidden">
            <PacketCard packet={data.packet} />
          </div>
          <PolicyTable
            network={data.network}
            highlights={descent.highlights}
            chipRow={descent.chipRow}
            selectable={phase === 'answer' && userAction !== null}
            selectedId={userPolicyId}
            onSelect={(id) => submit(id)}
          />
        </div>

        <div className="flex flex-col gap-3 lg:sticky lg:top-16">
          <div className="hidden lg:block">
            <PacketCard packet={data.packet} />
          </div>
          {phase === 'answer' && secondsLeft !== null && (
            <div
              className={`self-center rounded-panel border px-4 py-1 font-mono text-lg font-bold tabular-nums ${
                secondsLeft <= 5 ? 'border-deny text-deny' : 'border-warn/50 text-warn'
              }`}
              role="timer"
              aria-live="off"
            >
              {secondsLeft}s
            </div>
          )}
          {timedOut && phase === 'answer' && (
            <p className="text-center text-sm text-deny">{t('verdict.timeout')}</p>
          )}
          {phase === 'answer' && (
            <p className="text-center text-sm text-dim" aria-live="polite">
              {userAction === null ? t('verdict.question1') : t('verdict.pickPolicy')}
            </p>
          )}
          {phase === 'descent' && (
            <button
              onClick={descent.skip}
              className="self-center rounded-panel border border-line px-4 py-2 text-sm text-dim hover:text-ink"
            >
              {t('verdict.skipReplay')}
            </button>
          )}
          {phase === 'debrief' && (
            <Debrief
              verdict={verdict}
              answer={{
                action: userAction ?? 'deny',
                policyId: userPolicyId ?? 0,
              }}
              correct={lastCorrect}
              allowRetry={false}
              onNext={advance}
              onRetry={advance}
              onReplay={() => {
                setPhase('descent');
                descent.reset();
                descent.start();
              }}
            />
          )}
          {phase === 'answer' && <div className="hidden gap-3 lg:flex">{actionButtons()}</div>}
        </div>

        {phase === 'answer' && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden">
            <div className="mx-auto flex w-full max-w-2xl gap-3">{actionButtons()}</div>
          </div>
        )}
      </div>
    </div>
  );

  function actionButtons() {
    return (
      <>
        <button
          onClick={() => setUserAction('accept')}
          aria-pressed={userAction === 'accept'}
          className={`h-14 flex-1 rounded-panel font-display text-lg font-bold transition-all ${
            userAction === 'accept'
              ? 'bg-trace text-bg shadow-[0_0_20px_rgba(61,220,151,0.4)]'
              : 'border border-trace/50 text-trace hover:bg-trace/10'
          }`}
        >
          ✓ {t('verdict.accept')}
        </button>
        <button
          onClick={() => setUserAction('deny')}
          aria-pressed={userAction === 'deny'}
          className={`h-14 flex-1 rounded-panel font-display text-lg font-bold transition-all ${
            userAction === 'deny'
              ? 'bg-deny text-bg shadow-[0_0_20px_rgba(255,59,92,0.4)]'
              : 'border border-deny/50 text-deny hover:bg-deny/10'
          }`}
        >
          ✕ {t('verdict.deny')}
        </button>
      </>
    );
  }
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-dim">{label}</span>
      <span className={`text-lg font-bold ${accent ? 'text-trace' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
