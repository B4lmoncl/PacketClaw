/**
 * Konzept-Mastery: woran hakt es noch?
 *
 * Das ist der ehrlichste Grund, morgen wiederzukommen — nicht „hol dir
 * Punkte", sondern „an DIESEM Konzept verrechnest du dich". Deshalb steht hier
 * bewusst die Schwäche zuerst und nicht die Bestleistung.
 *
 * Formuliert als Feststellung, nie als Tadel (Playbook: niemals motivieren,
 * niemals belehren — feststellen).
 */
import { useTranslation } from 'react-i18next';
import type { ConceptMastery } from '../../game/mastery';

interface Props {
  weak: ConceptMastery[];
  untested: number;
  overall: number;
  /** Review schon freigeschaltet? Sonst waere der Knopf eine Sackgasse */
  canReview: boolean;
  onReview: () => void;
}

/** Farbe nach Beherrschung: nicht rot als Strafe, sondern als Wegweiser. */
function tone(accuracy: number): { bar: string; text: string } {
  if (accuracy >= 0.85) return { bar: 'bg-trace', text: 'text-trace' };
  if (accuracy >= 0.6) return { bar: 'bg-warn', text: 'text-warn' };
  return { bar: 'bg-deny', text: 'text-deny' };
}

export function MasteryPanel({ weak, untested, overall, canReview, onReview }: Props) {
  const { t } = useTranslation();

  // Noch keine Datenbasis: dann lieber gar nichts behaupten
  if (weak.length === 0 && overall === 0) {
    return (
      <section className="panel-inset flex items-center gap-3 rounded-panel px-4 py-3">
        <span className="text-xl opacity-60" aria-hidden>
          🧠
        </span>
        <div className="min-w-0">
          <div className="font-display text-sm font-bold text-dim">{t('mastery.title')}</div>
          <div className="font-mono text-[11px] text-dim/80">{t('mastery.noData')}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-aura/90">
          {t('mastery.title')}
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-dim">
          {Math.round(overall * 100)}%
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-aura/40 to-transparent" aria-hidden />
      </div>

      {weak.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {weak.map((m) => {
            const c = tone(m.accuracy);
            return (
              <li
                key={m.concept}
                className="panel-inset flex items-center gap-2.5 rounded-panel px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-ink">
                      {t(`mastery.concept.${m.concept}`)}
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] tabular-nums ${c.text}`}>
                      {Math.round(m.accuracy * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg/80">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${c.bar}`}
                      style={{ width: `${Math.round(m.accuracy * 100)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-dim/70">
                    {t('mastery.attempts', { correct: m.correct, total: m.attempts })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-inset rounded-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-trace">
          {t('mastery.allSolid')}
        </p>
      )}

      {/* Eine Diagnose ohne Handlungsmoeglichkeit ist nur ein Vorwurf —
          deshalb fuehrt das Panel direkt in die passende Uebung */}
      {canReview && (
        <button
          onClick={onReview}
          className="panel-action rounded-panel px-3 py-2 text-left font-display text-xs font-bold text-aura hover:-translate-y-0.5"
        >
          🧠 {weak.length > 0 ? t('mastery.trainWeak') : t('mastery.trainAny')} →
        </button>
      )}

      {untested > 0 && (
        <p className="px-1 font-mono text-[10px] text-dim/70">
          {t('mastery.untested', { count: untested })}
        </p>
      )}
    </section>
  );
}
