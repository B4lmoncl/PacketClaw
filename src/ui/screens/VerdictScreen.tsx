import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate, type PolicyAction } from '../../engine';
import type { VerdictLevel } from '../../game/levels';
import { scoreVerdictAnswer } from '../../game/scoring';
import { starsFor } from '../../game/scoring';
import { useGame } from '../../game/store';
import { Debrief } from '../components/Debrief';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { PacketCard } from '../components/PacketCard';
import { PolicyTable } from '../components/PolicyTable';
import { StarBar } from '../components/StarBar';
import { playChime } from '../../game/sound';
import { useDescent } from '../hooks/useDescent';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

type Phase = 'answer' | 'descent' | 'debrief' | 'done';

export function VerdictScreen({
  level,
  dailyMode = false,
  onDailyComplete,
}: {
  level: VerdictLevel;
  /** Daily: kein Retry, Ergebnis pro Paket wird gesammelt */
  dailyMode?: boolean;
  onDailyComplete?: (results: boolean[], score: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const reducedMotion = useReducedMotionPref();

  const combo = useGame((s) => s.combo);
  const setCombo = useGame((s) => s.setCombo);
  const recordLevelResult = useGame((s) => s.recordLevelResult);
  const bumpStats = useGame((s) => s.bumpStats);
  const navigate = useGame((s) => s.navigate);

  const [packetIndex, setPacketIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('answer');
  const [userAction, setUserAction] = useState<PolicyAction | null>(null);
  const [userPolicyId, setUserPolicyId] = useState<number | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [allUnderTarget, setAllUnderTarget] = useState(true);
  const [finalStars, setFinalStars] = useState<0 | 1 | 2 | 3>(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(level.timerSeconds ?? null);
  const [timedOut, setTimedOut] = useState(false);
  const questionStartedAt = useRef(Date.now());
  const resultsRef = useRef<boolean[]>([]);

  const packet = level.packets[packetIndex];
  const verdict = useMemo(
    () => (packet ? evaluate(packet, level.network) : null),
    [packet, level.network],
  );

  const onDescentDone = useCallback(() => setPhase('debrief'), []);
  const descent = useDescent(verdict, reducedMotion, onDescentDone);

  // Countdown (ab Kapitel 3): Ablauf zaehlt als Fehlversuch
  useEffect(() => {
    if (!level.timerSeconds || phase !== 'answer') return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        level.timerSeconds! - Math.floor((Date.now() - questionStartedAt.current) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        setWrongAttempts((w) => w + 1);
        setCombo(0);
        setAllUnderTarget(false);
        setTimedOut(true);
        setUserAction(null);
        setUserPolicyId(null);
        questionStartedAt.current = Date.now();
        setSecondsLeft(level.timerSeconds ?? null);
      }
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, packetIndex, level.timerSeconds]);

  if (!packet || !verdict) return null;

  function submit(policyId: number) {
    if (!verdict || userAction === null) return;
    setUserPolicyId(policyId);
    const correct = userAction === verdict.action && policyId === verdict.matchedPolicyId;
    setLastCorrect(correct);

    const elapsedSeconds = (Date.now() - questionStartedAt.current) / 1000;
    if (elapsedSeconds > level.targetSeconds) setAllUnderTarget(false);

    setTimedOut(false);
    if (dailyMode) resultsRef.current.push(correct);
    if (correct) {
      bumpStats(
        {
          implicitDenyCorrect: verdict.matchedPolicyId === 0 ? 1 : 0,
          fastCorrect: elapsedSeconds < 5 ? 1 : 0,
        },
        { maxComboStreak: combo + 1 },
      );
    }
    if (correct) {
      const { points } = scoreVerdictAnswer({
        correct,
        streakBefore: combo,
        secondsLeft: level.timerSeconds ? Math.max(0, secondsLeft ?? 0) : undefined,
        timerSeconds: level.timerSeconds,
      });
      setTotalScore((s) => s + points);
      setCombo(combo + 1);
    } else {
      setWrongAttempts((w) => w + 1);
      setCombo(0);
    }
    setPhase('descent');
    descent.start();
  }

  function nextPacket() {
    descent.reset();
    if (packetIndex + 1 < level.packets.length) {
      setPacketIndex((i) => i + 1);
      resetQuestion();
    } else if (dailyMode) {
      onDailyComplete?.([...resultsRef.current], totalScore);
      return;
    } else {
      const stars = starsFor({
        solved: true,
        wrongAttempts,
        underTargetTime: allUnderTarget,
      });
      setFinalStars(stars);
      recordLevelResult(level.id, stars, totalScore);
      bumpStats({
        levelsSolved: 1,
        verdictSolved: 1,
        noMistakeLevels: wrongAttempts === 0 ? 1 : 0,
        nightSolves: new Date().getHours() < 5 ? 1 : 0,
      });
      setPhase('done');
    }
  }

  function retry() {
    descent.reset();
    resetQuestion();
  }

  function resetQuestion() {
    setUserAction(null);
    setUserPolicyId(null);
    setPhase('answer');
    questionStartedAt.current = Date.now();
    setSecondsLeft(level.timerSeconds ?? null);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-28 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-lg font-bold">{level.title[locale]}</h1>
        <span className="font-mono text-xs text-dim">
          {t('level.packetOf', { current: packetIndex + 1, total: level.packets.length })}
        </span>
      </div>

      {phase === 'done' ? (
        <DonePanel
          stars={finalStars}
          score={totalScore}
          wrongAttempts={wrongAttempts}
          underTarget={allUnderTarget}
          onBack={() => navigate({ name: 'chapter', chapter: level.chapter })}
        />
      ) : (
        <>
          {packetIndex === 0 && phase === 'answer' && (
            <p className="rounded-panel border border-line bg-panel/70 px-3 py-2 text-sm leading-relaxed text-dim">
              {level.briefing[locale]}
            </p>
          )}
          <NetworkDiagram network={level.network} />
          <PacketCard packet={packet} />

          <PolicyTable
            network={level.network}
            highlights={descent.highlights}
            chipRow={descent.chipRow}
            selectable={phase === 'answer' && userAction !== null}
            selectedId={userPolicyId}
            onSelect={(id) => submit(id)}
          />

          {level.timerSeconds && phase === 'answer' && secondsLeft !== null && (
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
            <p className="text-center text-sm text-deny" aria-live="polite">
              {t('verdict.timeout')}
            </p>
          )}
          {phase === 'answer' && userAction === null && (
            <p className="text-center text-sm text-dim">{t('verdict.question1')}</p>
          )}
          {phase === 'answer' && userAction !== null && (
            <p className="text-center text-sm text-dim" aria-live="polite">
              {t('verdict.pickPolicy')}
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

          {phase === 'debrief' && userAction !== null && userPolicyId !== null && (
            <Debrief
              verdict={verdict}
              answer={{ action: userAction, policyId: userPolicyId }}
              correct={lastCorrect}
              allowRetry={!dailyMode}
              onNext={nextPacket}
              onRetry={retry}
              onReplay={() => {
                setPhase('descent');
                descent.reset();
                descent.start();
              }}
            />
          )}

          {/* Große Daumen-Buttons: einhändig am Smartphone */}
          {phase === 'answer' && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
              <div className="mx-auto flex w-full max-w-2xl gap-3">
                <button
                  onClick={() => setUserAction('accept')}
                  aria-pressed={userAction === 'accept'}
                  className={`h-14 flex-1 rounded-panel font-display text-lg font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
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
                  className={`h-14 flex-1 rounded-panel font-display text-lg font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
                    userAction === 'deny'
                      ? 'bg-deny text-bg shadow-[0_0_20px_rgba(255,59,92,0.4)]'
                      : 'border border-deny/50 text-deny hover:bg-deny/10'
                  }`}
                >
                  ✕ {t('verdict.deny')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {/* Zielzeit dezent anzeigen */}
      {phase !== 'done' && (
        <div className="text-center font-mono text-[10px] text-dim">
          {t('level.targetTime', { seconds: level.targetSeconds })}
        </div>
      )}
    </div>
  );
}

function DonePanel({
  stars,
  score,
  wrongAttempts,
  underTarget,
  onBack,
}: {
  stars: 0 | 1 | 2 | 3;
  score: number;
  wrongAttempts: number;
  underTarget: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    playChime(stars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
      <div className="font-display text-2xl font-bold text-trace">{t('score.levelDone')}</div>
      <StarBar stars={stars} size={36} animated />
      <div className="font-mono text-sm text-ink">{t('score.points', { points: score })}</div>
      <div className="flex flex-wrap justify-center gap-2 font-mono text-[10px] text-dim">
        {wrongAttempts === 0 && (
          <span className="rounded-row border border-trace/40 px-2 py-0.5 text-trace">
            {t('score.noMistakes')}
          </span>
        )}
        {wrongAttempts === 0 && underTarget && (
          <span className="rounded-row border border-warn/40 px-2 py-0.5 text-warn">
            {t('score.underTarget')}
          </span>
        )}
      </div>
      <button
        onClick={onBack}
        className="rounded-panel bg-claw px-6 py-3 font-display font-bold text-bg hover:brightness-110"
      >
        {t('score.toChapter')}
      </button>
    </section>
  );
}
