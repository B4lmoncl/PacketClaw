/**
 * `diagnose debug flow` — der Engine-Trace als FortiOS-CLI-Zeilen.
 * DAS Troubleshooting-Werkzeug auf echten FortiGates: received packet →
 * Session → (DNAT) → Route → Allowed/Denied by Policy. Wer diese Zeilen
 * hier lesen lernt, erkennt sie auf der echten Box sofort wieder.
 *
 * Wie im Original tauchen die intern geprueften, NICHT matchenden Policies
 * nicht auf — debug flow zeigt nur die Entscheidung. Werte, die die Engine
 * nicht modelliert (Session-ID, Quellport), werden deterministisch aus dem
 * Paket abgeleitet, damit gleiche Pakete gleiche Ausgaben ergeben.
 */
import type { Packet, Verdict } from '../engine';

const PROTO_NUM: Record<string, number> = { tcp: 6, udp: 17, icmp: 1 };

/** Kleiner deterministischer Hash (FNV-1a) fuer Pseudo-IDs. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function line(traceId: number, func: string, msg: string): string {
  return `id=20085 trace_id=${traceId} func=${func} msg="${msg}"`;
}

export function debugFlowLines(packet: Packet, verdict: Verdict): string[] {
  const h = hash(`${packet.srcintf}|${packet.srcIp}|${packet.dstIp}|${packet.dstPort ?? ''}`);
  const traceId = (h % 900) + 1;
  const session = (h % 0xffff).toString(16).padStart(8, '0');
  const srcPort = 49152 + (h % 16384);
  const proto = PROTO_NUM[packet.protocol] ?? 0;

  const lines: string[] = [];
  const detail =
    packet.protocol === 'icmp'
      ? `proto=${proto}, ${packet.srcIp}:${packet.icmpType ?? 8}->${packet.dstIp}:0`
      : `proto=${proto}, ${packet.srcIp}:${srcPort}->${packet.dstIp}:${packet.dstPort ?? 0}`;
  lines.push(
    line(
      traceId,
      'print_pkt_detail',
      `vd-root:0 received a packet(${detail}) tun_id=0.0.0.0 from ${packet.srcintf}.` +
        (packet.protocol === 'tcp' ? ' flag [S], seq 0, ack 0, win 64240' : ''),
    ),
  );
  lines.push(line(traceId, 'init_ip_session_common', `allocate a new session-${session}`));

  for (const step of verdict.trace) {
    switch (step.kind) {
      case 'dnat':
        lines.push(
          line(
            traceId,
            'fw_pre_route_handler',
            `VIP-${step.vipName}, DNAT ${packet.dstIp}:${packet.dstPort ?? 0}->${step.toIp}:${
              step.toPort ?? packet.dstPort ?? 0
            }`,
          ),
        );
        break;
      case 'route':
        lines.push(
          line(
            traceId,
            'vf_ip_route_input_common',
            `find a route: flag=04000000 via ${step.dstintf} (${step.route})`,
          ),
        );
        break;
      case 'no-route':
        lines.push(line(traceId, 'vf_ip_route_input_common', `no route to ${packet.dstIp}, drop`));
        break;
      case 'policy-match':
        lines.push(
          line(
            traceId,
            'fw_forward_handler',
            step.action === 'accept'
              ? `Allowed by Policy-${step.policyId}:${verdict.natApplied ? ' SNAT' : ''}`
              : `Denied by forward policy check (policy ${step.policyId})`,
          ),
        );
        break;
      case 'implicit-deny':
        lines.push(
          line(traceId, 'fw_forward_handler', 'Denied by forward policy check (policy 0)'),
        );
        break;
      // policy-skipped / policy-no-match: zeigt das echte debug flow nicht
      default:
        break;
    }
  }
  return lines;
}
