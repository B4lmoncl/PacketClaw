import { useTranslation } from 'react-i18next';
import type { Packet } from '../../engine';

function protoLabel(packet: Packet): string {
  if (packet.protocol === 'icmp') {
    return packet.icmpType !== undefined ? `icmp/type ${packet.icmpType}` : 'icmp';
  }
  return `${packet.protocol}/${packet.dstPort ?? '?'}`;
}

/** Das zu bewertende Paket — als leuchtende „Transmission" inszeniert. */
export function PacketCard({ packet }: { packet: Packet }) {
  const { t } = useTranslation();
  return (
    <div className="glass relative overflow-hidden rounded-panel border-claw/40 px-4 py-3 shadow-glow-claw">
      {/* wandernder Scan-Streifen oben — signalisiert „live" */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px animate-shimmer bg-gradient-to-r from-transparent via-claw to-transparent bg-[length:200%_100%] motion-reduce:animate-none"
      />
      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-dim">
        {t('packet.title')}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-claw shadow-[0_0_8px_rgba(255,90,60,0.9)]"
            aria-hidden
          />
          <span className="text-warn">{packet.srcintf}</span>
        </span>
        <span>
          <span className="text-ink">{packet.srcIp}</span>
          <span className="mx-0.5 text-claw"> → </span>
          <span className="text-ink">{packet.dstIp}</span>
        </span>
        <span className="rounded-row bg-trace/10 px-1.5 py-0.5 text-trace">
          {protoLabel(packet)}
        </span>
        {packet.timestamp && (
          <span className="text-xs text-dim">
            {t('packet.time')} {packet.timestamp.replace('T', ' ').slice(0, 16)}
          </span>
        )}
      </div>
    </div>
  );
}
