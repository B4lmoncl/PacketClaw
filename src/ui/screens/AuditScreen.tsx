/**
 * Audit-Modus: gewachsenes Regelwerk mit eingebauten Problemen.
 * Aufgabentypen: shadowed Rule finden · Reihenfolge fixen · Any-Any härten ·
 * redundante Regel löschen. Verifikation via Analysefunktionen + Testsuite.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  findOverbroadPolicies,
  findShadowedPolicies,
  matchesExpectation,
  type NetworkConfig,
  type Policy,
} from '../../engine';
import type { AuditLevel } from '../../game/levels';
import { modeBaseScore, starsFor } from '../../game/scoring';
import { useGame } from '../../game/store';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { RulesetWorkbench } from '../components/RulesetWorkbench';
import { ParticleBurst } from '../components/ParticleBurst';
import { StarBar } from '../components/StarBar';

export function AuditScreen({ level }: { level: AuditLevel }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const recordLevelResult = useGame((s) => s.recordLevelResult);
  const bumpStats = useGame((s) => s.bumpStats);
  const navigate = useGame((s) => s.navigate);

  const [policies, setPolicies] = useState<Policy[]>(level.network.policies);
  const [edits, setEdits] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState<{ stars: 0 | 1 | 2 | 3; score: number } | null>(null);

  const config: NetworkConfig = { ...level.network, policies };
  const isFindTask = level.task === 'find-shadowed';

  function finish(solved: boolean) {
    if (!solved) return;
    const stars = starsFor({
      solved: true,
      wrongAttempts,
      minimalEdits: isFindTask ? true : edits <= level.maxEdits,
    });
    const score = Math.round(modeBaseScore(level.difficulty) * (wrongAttempts === 0 ? 1 : 0.6));
    recordLevelResult(level.id, stars, score);
    bumpStats({
      levelsSolved: 1,
      auditsSolved: 1,
      noMistakeLevels: wrongAttempts === 0 ? 1 : 0,
      shadowedFound: level.task === 'find-shadowed' ? 1 : 0,
      anyHardened: level.task === 'harden-any' ? 1 : 0,
      redundantDeleted:
        level.task === 'remove-redundant'
          ? Math.max(0, level.network.policies.length - policies.length)
          : 0,
      nightSolves: new Date().getHours() < 5 ? 1 : 0,
    });
    setDone({ stars, score });
  }

  function checkFindShadowed(policyId: number) {
    setSelectedId(policyId);
    const shadowed = findShadowedPolicies(config).map((s) => s.policyId);
    if (shadowed.includes(policyId)) {
      finish(true);
    } else {
      setWrongAttempts((w) => w + 1);
      setFeedback(t('audit.wrongPick'));
    }
  }

  function checkRepairTask() {
    const suiteGreen = level.suite.every((tp) => matchesExpectation(tp, config));
    if (!suiteGreen) {
      setWrongAttempts((w) => w + 1);
      const failing = level.suite.filter((tp) => !matchesExpectation(tp, config));
      setFeedback(t('audit.suiteRed', { count: failing.length }));
      return;
    }
    if (level.task === 'harden-any' && findOverbroadPolicies(config, level.suite).length > 0) {
      setWrongAttempts((w) => w + 1);
      setFeedback(t('audit.stillBroad'));
      return;
    }
    if (level.task === 'remove-redundant' && policies.length >= level.network.policies.length) {
      setWrongAttempts((w) => w + 1);
      setFeedback(t('audit.nothingRemoved'));
      return;
    }
    finish(true);
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          <ParticleBurst variant="celebration" />
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      <h1 className="font-display text-lg font-bold">{level.title[locale]}</h1>

      <section className="rounded-panel border border-warn/40 bg-panel px-4 py-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-warn">
          {t('audit.ticket')}
        </div>
        <p className="text-sm leading-relaxed text-ink">{level.ticket[locale]}</p>
      </section>

      <NetworkDiagram network={level.network} />

      <div className="flex items-baseline justify-between font-mono text-[10px] text-dim">
        <span className="uppercase tracking-widest">{t('audit.task.' + level.task)}</span>
        {!isFindTask && <span>{t('audit.edits', { edits, max: level.maxEdits })}</span>}
      </div>

      <RulesetWorkbench
        network={level.network}
        policies={policies}
        onChange={(next, cost) => {
          setPolicies(next);
          setEdits((e) => e + cost);
          setFeedback(null);
        }}
        selectMode={isFindTask}
        selectedId={selectedId}
        onSelect={checkFindShadowed}
      />

      {feedback && (
        <p
          className="rounded-panel border border-deny/60 bg-deny/5 px-4 py-2 text-sm text-deny"
          aria-live="polite"
        >
          {feedback}
        </p>
      )}

      {!isFindTask && (
        <button
          onClick={checkRepairTask}
          className="rounded-panel bg-claw px-5 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('audit.check')}
        </button>
      )}
    </div>
  );
}
