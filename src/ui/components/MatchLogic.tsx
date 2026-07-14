/**
 * „Match logic"-Panel wie FortiOS 7.6: zeigt die UND-Verknüpfung ZWISCHEN den
 * Feldern und die ODER-Verknüpfung INNERHALB eines Feldes an ("Any of" /
 * "And any of"). Deckt sich beim Bearbeiten live mit den gewählten Objekten
 * auf — so wird First-Match-Semantik direkt am Original sichtbar.
 */
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { matchClauses, type MatchFieldKey } from '../../game/matchLogic';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

export function MatchLogic({ fields }: { fields: Record<MatchFieldKey, string[]> }) {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  const clauses = matchClauses(fields);

  return (
    <div className="rounded-row border border-aura/30 bg-aura/[0.05] p-2">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-aura/90">
        <span aria-hidden>🧩</span> {t('matchLogic.title')}
      </div>
      <div className="flex flex-col gap-1">
        {clauses.map((c, i) => (
          <motion.div
            key={c.field}
            initial={reduced ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduced ? 0 : i * 0.06, duration: 0.2 }}
            className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
          >
            <span className="w-20 shrink-0 whitespace-nowrap text-right text-dim">
              {c.first ? t('matchLogic.anyOf') : t('matchLogic.andAnyOf')}
            </span>
            <span className="w-24 shrink-0 whitespace-nowrap uppercase tracking-wide text-dim/70">
              {t(`policyTable.${c.field}`)}
            </span>
            {c.entries.length > 0 ? (
              c.entries.map((e, j) => (
                <span key={e} className="inline-flex items-center gap-1.5">
                  {j > 0 && <span className="text-aura/70">{t('matchLogic.or')}</span>}
                  <span className="rounded-row bg-panel px-1.5 py-0.5 text-ink">{e}</span>
                </span>
              ))
            ) : (
              <span className="italic text-dim/50">{t('matchLogic.notSet')}</span>
            )}
          </motion.div>
        ))}
      </div>
      <p className="mt-1.5 border-t border-aura/15 pt-1.5 font-mono text-[9.5px] leading-relaxed text-dim/80">
        {t('matchLogic.explain')}
      </p>
    </div>
  );
}
