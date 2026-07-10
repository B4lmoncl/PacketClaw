/**
 * Architect-Modus: Ticket lesen, Regelwerk aus der Objektbibliothek bauen,
 * unsichtbare must-pass/must-block-Suite entscheidet. Sterne belohnen
 * minimale Regelanzahl und Verzicht auf all/ALL/any.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  evaluate,
  findOverbroadPolicies,
  type NetworkConfig,
  type Policy,
  type TestPacket,
} from '../../engine';
import type { ArchitectLevel } from '../../game/levels';
import { modeBaseScore, starsFor } from '../../game/scoring';
import { useGame } from '../../game/store';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { PacketCard } from '../components/PacketCard';
import { PolicyEditor } from '../components/PolicyEditor';
import { PolicyTable } from '../components/PolicyTable';
import { StarBar } from '../components/StarBar';

interface FailedTest {
  test: TestPacket;
  got: 'accept' | 'deny';
  matchedPolicyId: number;
}

export function ArchitectScreen({ level }: { level: ArchitectLevel }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const recordLevelResult = useGame((s) => s.recordLevelResult);
  const navigate = useGame((s) => s.navigate);

  const [policies, setPolicies] = useState<Policy[]>(level.network.policies);
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [failures, setFailures] = useState<FailedTest[] | null>(null);
  const [done, setDone] = useState<{ stars: 0 | 1 | 2 | 3; score: number } | null>(null);

  const config: NetworkConfig = useMemo(
    () => ({ ...level.network, policies }),
    [level.network, policies],
  );

  const suggestedId = policies.reduce((max, p) => Math.max(max, p.id), 0) + 1;

  function check() {
    const failed: FailedTest[] = [];
    for (const test of level.suite) {
      const verdict = evaluate(test.packet, config);
      if (verdict.action !== test.expect) {
        failed.push({ test, got: verdict.action, matchedPolicyId: verdict.matchedPolicyId });
      }
    }
    if (failed.length > 0) {
      setFailures(failed);
      setWrongAttempts((w) => w + 1);
      return;
    }
    // 3. Stern: nicht mehr Regeln als die Referenz UND kein all/ALL/any,
    // wo die Objektbibliothek Spezifischeres hergibt (Engine-Analyse)
    const minimalRuleset =
      policies.length <= level.referencePolicyCount &&
      findOverbroadPolicies(config, level.suite).length === 0;
    const stars = starsFor({ solved: true, wrongAttempts, minimalRuleset });
    const score = Math.round(
      modeBaseScore(level.difficulty) * (wrongAttempts === 0 ? 1 : 0.6) + (stars === 3 ? 100 : 0),
    );
    recordLevelResult(level.id, stars, score);
    setDone({ stars, score });
  }

  function movePolicy(id: number, direction: -1 | 1) {
    setPolicies((list) => {
      const index = list.findIndex((p) => p.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      const a = next[index] as Policy;
      next[index] = next[target] as Policy;
      next[target] = a;
      return next;
    });
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          <div className="font-display text-2xl font-bold text-trace">{t('score.levelDone')}</div>
          <StarBar stars={done.stars} size={36} animated />
          <div className="font-mono text-sm">{t('score.points', { points: done.score })}</div>
          <button
            onClick={() => navigate({ name: 'chapter', chapter: level.chapter })}
            className="rounded-panel bg-claw px-6 py-3 font-display font-bold text-bg"
          >
            {t('score.toChapter')}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3">
      <h1 className="font-display text-lg font-bold">{level.title[locale]}</h1>

      {/* Ticket im Turmpost-Stil */}
      <section className="rounded-panel border border-warn/40 bg-panel px-4 py-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-warn">
          {t('architect.ticket')}
        </div>
        <p className="text-sm leading-relaxed text-ink">{level.ticket[locale]}</p>
      </section>

      <NetworkDiagram network={level.network} />

      <section aria-label={t('architect.ruleset')}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t('architect.ruleset')}
          </span>
          <span className="font-mono text-[10px] text-dim">
            {t('architect.referenceCount', { count: level.referencePolicyCount })}
          </span>
        </div>
        <PolicyTable network={config} />
        <div className="mt-2 flex flex-col gap-1">
          {policies.map((policy) => (
            <div key={policy.id} className="flex items-center gap-1 font-mono text-xs">
              <span className="w-8 text-dim">#{policy.id}</span>
              <button
                onClick={() => movePolicy(policy.id, -1)}
                aria-label={`Policy ${policy.id} ${t('architect.moveUp')}`}
                className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
              >
                ↑
              </button>
              <button
                onClick={() => movePolicy(policy.id, 1)}
                aria-label={`Policy ${policy.id} ${t('architect.moveDown')}`}
                className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
              >
                ↓
              </button>
              <button
                onClick={() => setEditing(policy)}
                className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
              >
                {t('architect.edit')}
              </button>
              <button
                onClick={() => setPolicies((list) => list.filter((p) => p.id !== policy.id))}
                className="rounded-row border border-deny/40 px-2 py-1 text-deny/80 hover:text-deny"
              >
                {t('architect.delete')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {editing ? (
        <PolicyEditor
          network={level.network}
          initial={editing === 'new' ? undefined : editing}
          suggestedId={suggestedId}
          onSave={(policy) => {
            setPolicies((list) => {
              const exists = list.some((p) => p.id === policy.id);
              return exists
                ? list.map((p) => (p.id === policy.id ? policy : p))
                : [...list, policy];
            });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          onClick={() => setEditing('new')}
          className="rounded-panel border border-dashed border-claw/60 px-4 py-3 font-display text-sm font-bold text-claw hover:bg-claw/10"
        >
          + {t('architect.addPolicy')}
        </button>
      )}

      {failures && (
        <section
          className="rounded-panel border border-deny/60 bg-deny/5 px-4 py-3"
          aria-live="polite"
        >
          <div className="mb-2 font-display text-sm font-bold text-deny">
            {t('architect.failedTests', { count: failures.length })}
          </div>
          <div className="flex flex-col gap-2">
            {failures.slice(0, 3).map((failure, i) => (
              <div key={i}>
                <PacketCard packet={failure.test.packet} />
                <div className="mt-1 font-mono text-xs text-dim">
                  {t('architect.expectedGot', {
                    expected: failure.test.expect.toUpperCase(),
                    got: failure.got.toUpperCase(),
                    policy: failure.matchedPolicyId,
                  })}
                </div>
              </div>
            ))}
            {failures.length > 3 && (
              <div className="font-mono text-xs text-dim">
                +{failures.length - 3} {t('architect.more')}
              </div>
            )}
          </div>
        </section>
      )}

      <button
        onClick={check}
        disabled={editing !== null}
        className="rounded-panel bg-claw px-5 py-3 font-display text-lg font-bold text-bg hover:brightness-110 disabled:opacity-40"
      >
        {t('architect.check')}
      </button>
    </div>
  );
}
