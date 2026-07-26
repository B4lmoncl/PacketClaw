/**
 * Was sich in dieser Sitzung bewegt hat.
 *
 * Der Punktestand einer Übungssitzung verpufft; eine Zahl, die sich bewegt,
 * bleibt. Deshalb steht hier nicht „4 von 5 richtig", sondern
 * „Adressobjekte 33 % → 50 %" — und zwar auch dann, wenn es abwärts ging.
 * Eine Messung, die nur gute Nachrichten zeigt, ist keine Messung.
 *
 * Die Balken laufen gestaffelt ein (60 ms Abstand): die größte Bewegung zuerst,
 * damit das Auge die wichtige Zeile zuerst erwischt.
 */
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { MasteryDelta } from '../../game/mastery';

interface Props {
  deltas: MasteryDelta[];
}

const pct = (v: number) => Math.round(v * 100);

export function MasteryDeltaList({ deltas }: Props) {
  const { t } = useTranslation();
  if (deltas.length === 0) return null;

  return (
    <section className="w-full">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-aura/90">
          {t('mastery.moved')}
        </h3>
        <div className="h-px flex-1 bg-gradient-to-r from-aura/40 to-transparent" aria-hidden />
      </div>

      <ul className="flex flex-col gap-1.5">
        {deltas.map((d, i) => {
          const up = d.change > 0;
          const flat = d.change === 0;
          const tone = flat ? 'text-dim' : up ? 'text-trace' : 'text-deny';
          return (
            <motion.li
              key={d.concept}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.3 }}
              className="panel-inset flex items-center gap-3 rounded-panel px-3 py-2 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-ink">
                    {t(`mastery.concept.${d.concept}`)}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    <span className="text-dim/70">{pct(d.before)}%</span>
                    <span className="mx-1 text-dim/50" aria-hidden>
                      →
                    </span>
                    <span className={`font-bold ${tone}`}>{pct(d.after)}%</span>
                  </span>
                </div>

                {/* Zwei Balken übereinander: der alte Stand bleibt als Schatten
                    stehen, damit der Zuwachs auch räumlich sichtbar ist */}
                <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-bg/80">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-dim/30"
                    style={{ width: `${pct(d.before)}%` }}
                  />
                  <motion.div
                    initial={{ width: `${pct(d.before)}%` }}
                    animate={{ width: `${pct(d.after)}%` }}
                    transition={{ delay: 0.35 + i * 0.06, duration: 0.7, ease: 'easeOut' }}
                    className={`absolute inset-y-0 left-0 rounded-full ${
                      up ? 'bg-trace' : flat ? 'bg-dim' : 'bg-deny'
                    }`}
                  />
                </div>

                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-dim/70">
                  <span>{t('mastery.plusAttempts', { count: d.attemptsAdded })}</span>
                  {d.newlyProven && <span className="text-aura">{t('mastery.nowProven')}</span>}
                </div>
              </div>

              <span
                className={`shrink-0 font-mono text-xs font-bold tabular-nums ${tone}`}
                aria-hidden
              >
                {flat ? '±0' : `${up ? '+' : '−'}${Math.abs(pct(d.change))}`}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
