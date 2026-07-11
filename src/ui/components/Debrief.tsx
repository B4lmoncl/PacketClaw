/**
 * Debrief nach jeder Antwort — komplett aus dem Engine-Trace generiert.
 * Zeigt: Ergebnis, warum die matchende Policy matcht, und pro darüberliegender
 * Policy das erste Feld, an dem sie gescheitert ist.
 */
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Verdict } from '../../engine';
import { Mascot } from './Mascot';

export interface UserAnswer {
  action: 'accept' | 'deny';
  policyId: number;
}

export function Debrief({
  verdict,
  answer,
  correct,
  allowRetry = true,
  onNext,
  onRetry,
  onReplay,
}: {
  verdict: Verdict;
  answer: UserAnswer;
  correct: boolean;
  /** false (Daily): auch nach Fehlern geht es nur weiter */
  allowRetry?: boolean;
  onNext: () => void;
  onRetry: () => void;
  onReplay: () => void;
}) {
  const { t } = useTranslation();

  const lines: string[] = [];
  for (const step of verdict.trace) {
    switch (step.kind) {
      case 'dnat':
        lines.push(
          t('debrief.dnat', {
            vip: step.vipName,
            target: `${step.toIp}${step.toPort !== undefined ? ':' + step.toPort : ''}`,
          }),
        );
        break;
      case 'no-route':
        lines.push(t('debrief.noRoute'));
        break;
      case 'policy-skipped':
        lines.push(t('debrief.skippedDisabled', { id: step.policyId }));
        break;
      case 'policy-no-match':
        lines.push(
          t('debrief.failedAt', {
            id: step.policyId,
            field: t(`debrief.fields.${step.failedField}`),
          }),
        );
        break;
      case 'policy-match':
        lines.push(t('debrief.matched', { id: step.policyId, action: step.action.toUpperCase() }));
        break;
      case 'implicit-deny':
        lines.push(t('debrief.implicitDeny'));
        break;
      default:
        break;
    }
  }
  if (verdict.natApplied) lines.push(t('debrief.snat'));

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-panel border px-4 py-3 ${
        correct ? 'border-trace/60 bg-trace/5' : 'border-deny/60 bg-deny/5'
      }`}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Mascot pose={correct ? 'happy' : 'facepalm'} size={48} />
        <div>
          <div className={`font-display text-lg font-bold ${correct ? 'text-trace' : 'text-deny'}`}>
            {correct ? t('verdict.correct') : t('verdict.wrong')}
          </div>
          <div className="font-mono text-xs text-dim">
            {t('verdict.yourAnswer')}: {answer.action.toUpperCase()} · #{answer.policyId} —{' '}
            {t('verdict.engineSays')}: {verdict.action.toUpperCase()} · #{verdict.matchedPolicyId}
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-line/60 pt-2 font-mono text-xs text-ink/90">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-dim">▸</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        {correct || !allowRetry ? (
          <button
            onClick={onNext}
            className="rounded-panel bg-claw px-5 py-2.5 font-display font-bold text-bg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {t('verdict.next')} →
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="rounded-panel bg-warn px-5 py-2.5 font-display font-bold text-bg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {t('verdict.retry')}
          </button>
        )}
        <button
          onClick={onReplay}
          className="rounded-panel border border-line px-4 py-2.5 text-sm text-dim hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw"
        >
          {t('verdict.replay')}
        </button>
      </div>
    </motion.section>
  );
}
