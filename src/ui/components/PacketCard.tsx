import { useTranslation } from 'react-i18next';
import type { Packet } from '../../engine';

function protoLabel(packet: Packet): string {
  if (packet.protocol === 'icmp') {
    return packet.icmpType !== undefined ? `icmp/type ${packet.icmpType}` : 'icmp';
  }
  return `${packet.protocol}/${packet.dstPort ?? '?'}`;
}

/** Das zu bewertende Paket — als leuchtender Chip inszeniert. */
export function PacketCard({ packet }: { packet: Packet }) {
  const { t } = useTranslation();
  return (
    <div className="bg-panel border border-claw/40 rounded-panel px-4 py-3 shadow-[0_0_18px_rgba(255,90,60,0.15)]">
      <div className="text-[10px] uppercase tracking-widest text-dim mb-1.5">
        {t('packet.title')}
      </div>
      <div className="font-mono text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-claw animate-pulse" aria-hidden />
          <span className="text-warn">{packet.srcintf}</span>
        </span>
        <span>
          <span className="text-ink">{packet.srcIp}</span>
          <span className="text-dim"> → </span>
          <span className="text-ink">{packet.dstIp}</span>
        </span>
        <span className="text-trace">{protoLabel(packet)}</span>
        {packet.timestamp && (
          <span className="text-dim text-xs">
            {t('packet.time')} {packet.timestamp.replace('T', ' ').slice(0, 16)}
          </span>
        )}
      </div>
    </div>
  );
}
