/**
 * Config Doctor: ein kaputtes Regelwerk + Symptom-Ticket. Der Spieler
 * diagnostiziert mit Werkbank-Werkzeugen (Policy Lookup, CLI) und fixt die
 * Regeln; „Diagnose starten" prüft die Test-Suite. Grün = gelöst.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, Policy } from '../../engine';
import { BUG_CONCEPT, failingChecks, generateDoctorCase } from '../../game/doctor';
import { useGame } from '../../game/store';
import { ParticleBurst } from '../components/ParticleBurst';
import { RulesetWorkbench } from '../components/RulesetWorkbench';
import { XpGain } from '../components/XpGain';

type Phase = 'intro' | 'play' | 'done';

export function DoctorScreen() {
  const { t } = useTranslation();
  const doctorSolved = useGame((s) => s.doctorSolved);
  const recordDoctor = useGame((s) => s.recordDoctor);
  const navigate = useGame((s) => s.navigate);

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const initial = useMemo(() => generateDoctorCase(seed), [seed]);
  const [policies, setPolicies] = useState<Policy[]>(initial.network.policies);
  const [edits, setEdits] = useState(0);
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const config: NetworkConfig = { ...initial.network, policies };

  function restart() {
    const next = `${Date.now()}`;
    const gen = generateDoctorCase(next);
    setSeed(next);
    setPolicies(gen.network.policies);
    setEdits(0);
    setTries(0);
    setFeedback(null);
    setScore(0);
    setPhase('intro');
  }

  function diagnose() {
    const failing = failingChecks(initial.suite, config);
    if (failing > 0) {
      setTries((n) => n + 1);
      setFeedback(t('doctor.stillFailing', { count: failing }));
      return;
    }
    // Score: sauber gelöst gibt mehr; jeder Eingriff/Fehlversuch kostet etwas
    const s = Math.max(20, 80 - Math.max(0, edits - 1) * 10 - tries * 5);
    setScore(s);
    recordDoctor(s);
    setPhase('done');
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-deny">🩺 {t('doctor.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('doctor.intro')}</p>
        {doctorSolved > 0 && (
          <p className="font-mono text-xs text-dim">
            {t('doctor.solved')}: <span className="font-bold text-trace">{doctorSolved}</span>
          </p>
        )}
        <button
          onClick={() => setPhase('play')}
          className="rounded-panel bg-deny px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('doctor.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          <ParticleBurst variant="celebration" />
          <div className="font-display text-2xl font-bold text-trace">✓ {t('doctor.fixed')}</div>
          <div className="font-mono text-sm text-ink">{t(`doctor.diagnosis.${initial.bug}`)}</div>
          <div className="font-mono text-xs text-dim">
            {t('doctor.editsUsed', { edits })} · {t(`doctor.concept.${BUG_CONCEPT[initial.bug]}`)}
          </div>
          <XpGain gained={score} />
          <div className="flex gap-2">
            <button
              onClick={restart}
              className="rounded-panel bg-deny px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('doctor.next')}
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      {/* Symptom-Ticket */}
      <section className="glass rounded-panel border-l-2 border-l-deny/70 px-4 py-3">
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
          <span className="h-3 w-0.5 rounded-full bg-deny" aria-hidden />
          {t('doctor.ticket')}
        </div>
        <p className="text-sm leading-relaxed text-ink">🎫 {t(initial.symptomKey)}</p>
        <p className="mt-1 font-mono text-[11px] text-dim">{t('doctor.hint')}</p>
      </section>

      <RulesetWorkbench
        network={initial.network}
        policies={policies}
        onChange={(next, cost) => {
          setPolicies(next);
          setEdits((e) => e + cost);
          setFeedback(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={diagnose}
          className="rounded-panel bg-trace px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
        >
          🩺 {t('doctor.check')}
        </button>
        <span className="font-mono text-xs text-dim">{t('doctor.editsUsed', { edits })}</span>
        {feedback && (
          <span className="font-mono text-xs text-deny" aria-live="polite">
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
