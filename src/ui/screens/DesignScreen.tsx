/**
 * Change Request: Regelwerk von null nach schriftlichen Vorgaben bauen.
 *
 * Die Anforderungsliste ist LIVE — jede Zeile zeigt beim Bauen sofort ✓/✗,
 * so wie man auf einer echten FortiGate mit Policy Lookup und Testverkehr
 * gegenprüft. „Zum Review einreichen" bewertet zusätzlich, ob mehr geöffnet
 * wurde als gefordert und ob die Regeln handwerklich sauber sind.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, Policy } from '../../engine';
import { generateDesignSpec, reviewDesign } from '../../game/design';
import { starsFor } from '../../game/scoring';
import { useGame } from '../../game/store';
import { ParticleBurst } from '../components/ParticleBurst';
import { RulesetWorkbench } from '../components/RulesetWorkbench';
import { StarBar } from '../components/StarBar';
import { XpGain } from '../components/XpGain';

type Phase = 'brief' | 'build' | 'done';

export function DesignScreen() {
  const { t } = useTranslation();
  const designSolved = useGame((s) => s.designSolved);
  const recordDesign = useGame((s) => s.recordDesign);
  const navigate = useGame((s) => s.navigate);

  const [phase, setPhase] = useState<Phase>('brief');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const spec = useMemo(() => generateDesignSpec(seed), [seed]);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rejections, setRejections] = useState(0);
  const [result, setResult] = useState<{ stars: 0 | 1 | 2 | 3; score: number } | null>(null);

  // Beide memoisiert: reviewDesign fährt Overbroad-/Shadow-Analysen, das darf
  // nicht bei jedem Render laufen — nur wenn sich das Regelwerk ändert.
  const config = useMemo<NetworkConfig>(
    () => ({ ...spec.baseNetwork, policies }),
    [spec.baseNetwork, policies],
  );
  // Live-Review bei jeder Änderung — das ist der Lerneffekt
  const review = useMemo(() => reviewDesign(config, spec), [config, spec]);

  function reset() {
    setSeed(`${Date.now()}`);
    setPolicies([]);
    setRejections(0);
    setResult(null);
    setPhase('brief');
  }

  function submit() {
    if (!review.passed) {
      setRejections((n) => n + 1);
      return;
    }
    const stars = starsFor({
      solved: true,
      wrongAttempts: rejections,
      minimalRuleset: review.clean,
    });
    const score = 200 + stars * 60 + (review.clean ? 60 : 0);
    recordDesign(score);
    setResult({ stars, score });
    setPhase('done');
  }

  if (phase === 'brief') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-warn">📋 {t('design.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('design.intro')}</p>
        <p className="rounded-panel border-l-2 border-l-warn/60 bg-panel/60 px-3 py-2 font-mono text-xs leading-relaxed text-dim">
          {t('design.rule')}
        </p>
        {designSolved > 0 && (
          <p className="font-mono text-xs text-dim">
            {t('design.solved')}: <span className="font-bold text-trace">{designSolved}</span>
          </p>
        )}
        <button
          onClick={() => setPhase('build')}
          className="rounded-panel bg-warn px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('design.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done' && result) {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          <ParticleBurst variant="celebration" />
          <div className="font-display text-2xl font-bold text-trace">✓ {t('design.approved')}</div>
          <StarBar stars={result.stars} size={36} animated />
          <div className="max-w-sm font-mono text-xs leading-relaxed text-dim">
            {review.clean ? t('design.praiseClean') : t('design.praiseWorks')}
          </div>
          <XpGain gained={result.score} />
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-panel bg-warn px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('design.next')}
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

  const openCount = review.perRequirement.filter((r) => !r.ok).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      {/* Änderungsauftrag */}
      <section className="glass rounded-panel border-l-2 border-l-warn/70 px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
          <span className="h-3 w-0.5 rounded-full bg-warn" aria-hidden />
          {t('design.ticket')}
        </div>

        {/* Live-Checkliste: das Herz des Modus */}
        <ul className="flex flex-col gap-1.5">
          {review.perRequirement.map((r, i) => {
            const req = spec.requirements[i];
            return (
              <li key={r.label} className="flex items-start gap-2 text-sm leading-snug">
                <span
                  className={`mt-px shrink-0 font-mono text-xs font-bold ${
                    r.ok ? 'text-trace' : 'text-dim/60'
                  }`}
                  aria-hidden
                >
                  {r.ok ? '✓' : '○'}
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-warn">
                  {r.label}
                </span>
                <span className={r.ok ? 'text-dim line-through decoration-trace/40' : 'text-ink'}>
                  {req ? t(req.textKey) : ''}
                  {req?.needsNat && (
                    <span className="ml-1 font-mono text-[10px] text-aura">[SNAT]</span>
                  )}
                </span>
                {r.natMissing && (
                  <span className="shrink-0 font-mono text-[10px] text-deny">
                    {t('design.natMissing')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* Standing-Order + Auftraggeber-Anmerkung */}
        <p className="mt-2.5 border-t border-line/60 pt-2 font-mono text-[11px] leading-relaxed text-dim">
          {t('design.rule')}
        </p>
        <p className="mt-1 font-mono text-[11px] italic leading-relaxed text-dim/80">
          {t(spec.noteKey)}
        </p>
      </section>

      {/* Warnung, wenn zu viel offen ist — mit Klartext, was durchkommt */}
      {review.breaches.length > 0 && (
        <div
          className="rounded-panel border border-deny/50 bg-deny/10 px-4 py-2.5 font-mono text-xs text-deny"
          aria-live="polite"
        >
          ⚠ {t('design.breach', { count: review.breaches.length })}
          <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-deny/90">
            {review.breaches.map((id) => (
              <li key={id}>· {t(`design.req.${id}`)}</li>
            ))}
          </ul>
        </div>
      )}

      <RulesetWorkbench
        network={config}
        policies={policies}
        onChange={(nextPolicies) => setPolicies(nextPolicies)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={!review.passed}
          className={`rounded-panel px-5 py-2.5 font-display font-bold transition-colors ${
            review.passed
              ? 'bg-trace text-bg hover:brightness-110'
              : 'cursor-not-allowed border border-line bg-panel text-dim/60'
          }`}
        >
          📋 {t('design.submit')}
        </button>
        <span className="font-mono text-xs text-dim">
          {review.passed
            ? t('design.readyForReview')
            : t('design.stillOpen', { count: openCount + review.breaches.length })}
        </span>
        {review.passed && !review.clean && (
          <span className="font-mono text-[11px] text-warn">
            {t('design.hintClean', { overbroad: review.overbroad, shadowed: review.shadowed })}
          </span>
        )}
      </div>
    </div>
  );
}
