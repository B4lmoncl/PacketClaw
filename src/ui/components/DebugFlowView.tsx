/**
 * CLI-Trace-Panel: `diagnose debug flow` fuer das zuletzt ausgewertete
 * Paket. Allowed-Zeilen leuchten gruen, Denied/drop rot — der Rest bleibt
 * neutral, wie man es vom Terminal kennt.
 */
import { useTranslation } from 'react-i18next';
import type { Packet, Verdict } from '../../engine';
import { debugFlowLines } from '../../game/debugFlow';

export function DebugFlowView({ packet, verdict }: { packet: Packet; verdict: Verdict }) {
  const { t } = useTranslation();
  const lines = debugFlowLines(packet, verdict);

  return (
    <details className="rounded-panel border border-line bg-panel/60">
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-xs text-dim hover:text-ink">
        <span className="text-trace">&gt;_</span> {t('debugFlow.title')}
      </summary>
      <div className="px-3 pb-3">
        <pre className="overflow-x-auto rounded-row border border-line bg-bg px-3 py-2 font-mono text-[10.5px] leading-relaxed text-ink/80">
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                l.includes('Allowed by')
                  ? 'text-trace'
                  : l.includes('Denied by') || l.includes('drop')
                    ? 'text-deny'
                    : undefined
              }
            >
              {l}
            </div>
          ))}
        </pre>
        <p className="mt-1.5 font-mono text-[10px] text-dim/80">💡 {t('debugFlow.hint')}</p>
      </div>
    </details>
  );
}
