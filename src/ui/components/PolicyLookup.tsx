/**
 * Policy Lookup (FortiOS-Feature): Traffic-Parameter eingeben (Quell-Interface
 * ist Pflicht, wie im Original) → die Engine wertet aus und die matchende
 * Policy wird in der Tabelle hervorgehoben. Genau der Workflow, mit dem man
 * auf einer echten FortiGate prueft, welche Regel greifen wuerde.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate } from '../../engine';
import type { NetworkConfig, Packet, Verdict } from '../../engine';
import type { RowHighlight } from './PolicyTable';

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function PolicyLookup({
  network,
  onHighlight,
}: {
  network: NetworkConfig;
  /** Map fuer PolicyTable-highlights (undefined = Lookup geleert) */
  onHighlight: (highlights: Map<number, RowHighlight> | undefined) => void;
}) {
  const { t } = useTranslation();
  const [srcintf, setSrcintf] = useState(network.interfaces[0]?.name ?? '');
  const [protocol, setProtocol] = useState<'tcp' | 'udp' | 'icmp'>('tcp');
  const [srcIp, setSrcIp] = useState('');
  const [dstIp, setDstIp] = useState('');
  const [dstPort, setDstPort] = useState('443');
  const [result, setResult] = useState<Verdict | null>(null);
  const [error, setError] = useState(false);

  const valid =
    srcintf !== '' &&
    IPV4_RE.test(srcIp) &&
    IPV4_RE.test(dstIp) &&
    (protocol === 'icmp' || /^\d{1,5}$/.test(dstPort));

  function search() {
    if (!valid) {
      setError(true);
      return;
    }
    setError(false);
    const packet: Packet = { srcintf, srcIp, dstIp, protocol };
    if (protocol !== 'icmp') packet.dstPort = Number(dstPort);
    else packet.icmpType = 8;
    const verdict = evaluate(packet, network);
    setResult(verdict);
    const state: RowHighlight['state'] =
      verdict.matchedPolicyId === 0
        ? 'implicit-hit'
        : verdict.action === 'accept'
          ? 'matched-accept'
          : 'matched-deny';
    onHighlight(new Map([[verdict.matchedPolicyId, { state }]]));
  }

  function clear() {
    setResult(null);
    setError(false);
    onHighlight(undefined);
  }

  const inputClass =
    'w-28 rounded-row border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink placeholder:text-dim/50 focus:border-claw/60 focus:outline-none';

  return (
    <details className="rounded-panel border border-line bg-panel/60">
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-xs text-dim hover:text-ink">
        🔍 {t('policyLookup.title')}
      </summary>
      <div className="flex flex-wrap items-end gap-2 px-3 pb-3">
        <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wide text-dim">
          {t('policyLookup.srcintf')} *
          <select
            value={srcintf}
            onChange={(e) => setSrcintf(e.target.value)}
            className="rounded-row border border-line bg-bg px-1.5 py-1.5 font-mono text-xs text-ink"
          >
            {network.interfaces.map((i) => (
              <option key={i.id} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wide text-dim">
          {t('policyLookup.protocol')}
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as 'tcp' | 'udp' | 'icmp')}
            className="rounded-row border border-line bg-bg px-1.5 py-1.5 font-mono text-xs text-ink"
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="icmp">ICMP</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wide text-dim">
          {t('policyLookup.srcIp')} *
          <input
            value={srcIp}
            onChange={(e) => setSrcIp(e.target.value)}
            placeholder="10.0.1.5"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wide text-dim">
          {t('policyLookup.dstIp')} *
          <input
            value={dstIp}
            onChange={(e) => setDstIp(e.target.value)}
            placeholder="203.0.113.50"
            className={inputClass}
          />
        </label>
        {protocol !== 'icmp' && (
          <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('policyLookup.dstPort')} *
            <input
              value={dstPort}
              onChange={(e) => setDstPort(e.target.value)}
              placeholder="443"
              className="w-16 rounded-row border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink focus:border-claw/60 focus:outline-none"
            />
          </label>
        )}
        <button
          onClick={search}
          className="rounded-row bg-claw px-3 py-1.5 font-display text-xs font-bold text-bg hover:brightness-110"
        >
          {t('policyLookup.search')}
        </button>
        {result && (
          <button
            onClick={clear}
            className="rounded-row border border-line px-3 py-1.5 text-xs text-dim hover:text-ink"
          >
            {t('policyLookup.clear')}
          </button>
        )}
        {error && (
          <span className="font-mono text-[11px] text-deny" aria-live="polite">
            {t('policyLookup.invalid')}
          </span>
        )}
        {result && (
          <span
            className={`font-mono text-[11px] ${result.action === 'accept' ? 'text-trace' : 'text-deny'}`}
            aria-live="polite"
          >
            {result.matchedPolicyId === 0
              ? t('policyLookup.implicit')
              : t('policyLookup.matched', {
                  id: result.matchedPolicyId,
                  action: result.action.toUpperCase(),
                })}
          </span>
        )}
      </div>
    </details>
  );
}
