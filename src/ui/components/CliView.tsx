/**
 * Read-only-CLI-Ansicht: das aktuelle Regelwerk als `show firewall policy`
 * in FortiOS-Syntax. Bruecke GUI↔CLI — man sieht live, wie die Tabelle im
 * CLI aussieht. Wie im Original werden Default-Werte weggelassen (`show`
 * zeigt nur Abweichungen): keine `set action`-Zeile heisst DENY, kein
 * `set status` heisst enabled.
 */
import { useTranslation } from 'react-i18next';
import type { NetworkConfig } from '../../engine';

const quote = (values: string[]) => values.map((v) => `"${v}"`).join(' ');

function policyLines(network: NetworkConfig): string[] {
  const lines: string[] = ['config firewall policy'];
  for (const p of network.policies) {
    lines.push(`    edit ${p.id}`);
    lines.push(`        set name "${p.name}"`);
    if (!p.enabled) lines.push('        set status disable');
    lines.push(`        set srcintf ${quote(p.srcintf)}`);
    lines.push(`        set dstintf ${quote(p.dstintf)}`);
    // `show` unterdrueckt Defaults: action deny ist Default → keine Zeile
    if (p.action === 'accept') lines.push('        set action accept');
    lines.push(`        set srcaddr ${quote(p.srcaddr)}`);
    lines.push(`        set dstaddr ${quote(p.dstaddr)}`);
    lines.push(`        set schedule "${p.schedule}"`);
    lines.push(`        set service ${quote(p.service)}`);
    if (p.log) lines.push('        set logtraffic all');
    if (p.nat) lines.push('        set nat enable');
    if (p.label) lines.push(`        set global-label "${p.label}"`);
    lines.push('    next');
  }
  lines.push('end');
  return lines;
}

export function CliView({ network }: { network: NetworkConfig }) {
  const { t } = useTranslation();
  const lines = policyLines(network);

  return (
    <details className="glass rounded-panel">
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-xs text-dim hover:text-ink">
        <span className="text-trace">&gt;_</span> {t('cliView.title')}
      </summary>
      <div className="px-3 pb-3">
        <pre className="overflow-x-auto rounded-row border border-line bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-ink/90">
          {lines.map((line, i) => {
            const trimmed = line.trimStart();
            const structural =
              trimmed === 'end' ||
              trimmed === 'next' ||
              trimmed.startsWith('config ') ||
              trimmed.startsWith('edit ');
            return (
              <div key={i} className={structural ? 'text-claw/80' : undefined}>
                {line}
              </div>
            );
          })}
        </pre>
        <p className="mt-1.5 font-mono text-[10px] text-dim/80">💡 {t('cliView.hint')}</p>
      </div>
    </details>
  );
}
