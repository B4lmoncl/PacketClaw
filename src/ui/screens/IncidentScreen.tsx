/**
 * Incident-Modus: Symptom-Ticket + Engine-generierter Forward-Traffic-Log.
 * Der Spieler identifiziert die schuldige Policy im Log und repariert das
 * Regelwerk (edit/move/enable). Verifikation via Testsuite.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate, matchesExpectation, type NetworkConfig, type Policy } from '../../engine';
import type { IncidentLevel } from '../../game/levels';
import { modeBaseScore, starsFor } from '../../game/scoring';
import { useGame } from '../../game/store';
import { RulesetWorkbench } from '../components/RulesetWorkbench';
import { StarBar } from '../components/StarBar';

function serviceLabel(packet: { protocol: string; dstPort?: number; icmpType?: number }): string {
  if (packet.protocol === 'icmp') return 'icmp';
  return `${packet.protocol}/${packet.dstPort ?? '?'}`;
}

/** Forward-Log aus den logPackets generieren — gegen das ORIGINAL-Regelwerk */
function useForwardLog(level: IncidentLevel) {
  return useMemo(() => {
    const base = new Date('2026-01-05T09:12:00');
    return level.logPackets.map((packet, i) => {
      const verdict = evaluate(packet, level.network);
      const time = new Date(base.getTime() + i * 47000);
      return {
        time: time.toTimeString().slice(0, 8),
        srcintf: packet.srcintf,
        src: packet.srcIp,
        dst: packet.dstIp,
        service: serviceLabel(packet),
        policyId: verdict.matchedPolicyId,
        action: verdict.action,
      };
    });
  }, [level]);
}

export function IncidentScreen({ level }: { level: IncidentLevel }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const recordLevelResult = useGame((s) => s.recordLevelResult);
  const bumpStats = useGame((s) => s.bumpStats);
  const navigate = useGame((s) => s.navigate);

  const [policies, setPolicies] = useState<Policy[]>(level.network.policies);
  const [edits, setEdits] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState<{ stars: 0 | 1 | 2 | 3; score: number } | null>(null);

  const log = useForwardLog(level);
  const config: NetworkConfig = { ...level.network, policies };

  function check() {
    const failing = level.suite.filter((tp) => !matchesExpectation(tp, config));
    if (failing.length > 0) {
      setWrongAttempts((w) => w + 1);
      setFeedback(t('audit.suiteRed', { count: failing.length }));
      return;
    }
    const stars = starsFor({ solved: true, wrongAttempts, minimalEdits: edits <= level.maxEdits });
    const score = Math.round(modeBaseScore(level.difficulty) * (wrongAttempts === 0 ? 1 : 0.6));
    recordLevelResult(level.id, stars, score);
    bumpStats({
      levelsSolved: 1,
      incidentsSolved: 1,
      noMistakeLevels: wrongAttempts === 0 ? 1 : 0,
      nightSolves: new Date().getHours() < 5 ? 1 : 0,
    });
    setDone({ stars, score });
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      <h1 className="font-display text-lg font-bold">{level.title[locale]}</h1>

      <section className="rounded-panel border border-deny/40 bg-panel px-4 py-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-deny">
          {t('incident.ticket')}
        </div>
        <p className="text-sm leading-relaxed text-ink">{level.ticket[locale]}</p>
      </section>

      {/* Forward-Traffic-Log */}
      <section className="rounded-panel border border-line bg-panel px-2 py-2">
        <div className="mb-1 px-1 font-mono text-[10px] uppercase tracking-widest text-dim">
          {t('incident.log')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="text-left text-dim">
                <th className="px-1 py-0.5 font-normal">time</th>
                <th className="px-1 py-0.5 font-normal">srcintf</th>
                <th className="px-1 py-0.5 font-normal">src</th>
                <th className="px-1 py-0.5 font-normal">dst</th>
                <th className="px-1 py-0.5 font-normal">service</th>
                <th className="px-1 py-0.5 font-normal">policyid</th>
                <th className="px-1 py-0.5 font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row, i) => (
                <tr key={i} className="border-t border-line/40 text-ink/90">
                  <td className="px-1 py-0.5 text-dim">{row.time}</td>
                  <td className="px-1 py-0.5">{row.srcintf}</td>
                  <td className="px-1 py-0.5">{row.src}</td>
                  <td className="px-1 py-0.5">{row.dst}</td>
                  <td className="px-1 py-0.5">{row.service}</td>
                  <td className="px-1 py-0.5 text-center">{row.policyId}</td>
                  <td
                    className={`px-1 py-0.5 font-bold ${row.action === 'accept' ? 'text-trace' : 'text-deny'}`}
                  >
                    {row.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-baseline justify-between font-mono text-[10px] text-dim">
        <span className="uppercase tracking-widest">{t('incident.fixIt')}</span>
        <span>{t('audit.edits', { edits, max: level.maxEdits })}</span>
      </div>

      <RulesetWorkbench
        network={level.network}
        policies={policies}
        onChange={(next, cost) => {
          setPolicies(next);
          setEdits((e) => e + cost);
          setFeedback(null);
        }}
      />

      {feedback && (
        <p
          className="rounded-panel border border-deny/60 bg-deny/5 px-4 py-2 text-sm text-deny"
          aria-live="polite"
        >
          {feedback}
        </p>
      )}

      <button
        onClick={check}
        className="rounded-panel bg-claw px-5 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
      >
        {t('audit.check')}
      </button>
    </div>
  );
}
