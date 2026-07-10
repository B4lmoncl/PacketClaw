/**
 * Kern der Engine: deterministisches First-Match-Verdict mit vollständigem Trace.
 * Reihenfolge: VIP/DNAT → Routing (LPM) → Policies top-down → Implicit Deny.
 * Semantik-Details und bewusste Vereinfachungen: docs/ENGINE.md.
 */
import { longestPrefixMatch } from './ip';
import { createResolver, type Resolver } from './resolve';
import { scheduleMatches } from './schedule';
import type { MatchField, NetworkConfig, Packet, Policy, TraceStep, Verdict, Vip } from './types';

/** Findet das erste VIP-Objekt, dessen extIp/protocol/extPort auf das Paket passen. */
export function matchVip(packet: Packet, vips: readonly Vip[]): Vip | undefined {
  return vips.find(
    (vip) =>
      vip.extIp === packet.dstIp &&
      (vip.protocol === undefined || vip.protocol === packet.protocol) &&
      (vip.extPort === undefined || vip.extPort === packet.dstPort),
  );
}

/**
 * Prüft die Felder einer Policy in fester Reihenfolge und liefert das ERSTE
 * scheiternde Feld — oder null, wenn alle matchen. Innerhalb eines Feldes ODER,
 * zwischen Feldern UND.
 */
export function firstFailedField(
  policy: Policy,
  packet: Packet,
  dstintf: string,
  vip: Vip | undefined,
  resolver: Resolver,
): MatchField | null {
  if (!policy.srcintf.some((e) => resolver.interfaceMatches(e, packet.srcintf))) {
    return 'srcintf';
  }
  if (!policy.dstintf.some((e) => resolver.interfaceMatches(e, dstintf))) {
    return 'dstintf';
  }
  if (!policy.srcaddr.some((e) => e === 'all' || resolver.addressEntryMatchesIp(e, packet.srcIp))) {
    return 'srcaddr';
  }
  if (!destinationMatches(policy.dstaddr, packet, vip, resolver)) {
    return 'dstaddr';
  }
  if (!policy.service.some((e) => e === 'ALL' || resolver.serviceEntryMatches(e, packet))) {
    return 'service';
  }
  if (!scheduleMatches(policy.schedule, packet.timestamp)) {
    return 'schedule';
  }
  return null;
}

/**
 * DNAT-Traffic matcht ausschließlich über den VIP-Namen — weder über "all"
 * noch über Adressobjekte der internen IP (didaktischer Kern von Kapitel 7).
 * Ohne VIP-Match zählen VIP-Namen im dstaddr nicht als Adressobjekte.
 */
function destinationMatches(
  dstaddr: readonly string[],
  packet: Packet,
  vip: Vip | undefined,
  resolver: Resolver,
): boolean {
  if (vip) {
    return dstaddr.includes(vip.name);
  }
  return dstaddr.some(
    (e) =>
      e === 'all' ||
      (!resolver.vipByName.has(e) && resolver.addressEntryMatchesIp(e, packet.dstIp)),
  );
}

export function evaluate(packet: Packet, config: NetworkConfig): Verdict {
  const resolver = createResolver(config);
  const trace: TraceStep[] = [];

  // 1. VIP/DNAT vor Routing und Policy-Match (FortiOS: DNAT bestimmt das Egress-Interface)
  const vip = matchVip(packet, config.vips);
  let routeIp = packet.dstIp;
  if (vip) {
    routeIp = vip.mappedIp;
    trace.push({ kind: 'dnat', vipName: vip.name, toIp: vip.mappedIp, toPort: vip.mappedPort });
  }

  // 2. Routing: Longest-Prefix-Match bestimmt dstintf
  const route = longestPrefixMatch(config.routes, routeIp);
  if (!route) {
    trace.push({ kind: 'no-route' });
    return { action: 'deny', matchedPolicyId: 0, dstintf: '', natApplied: false, trace };
  }
  const dstintf = route.iface;
  trace.push({ kind: 'route', dstintf, route: route.dst });

  // 3. Top-down, First Match
  for (const policy of config.policies) {
    if (!policy.enabled) {
      trace.push({ kind: 'policy-skipped', policyId: policy.id, reason: 'disabled' });
      continue;
    }
    const failedField = firstFailedField(policy, packet, dstintf, vip, resolver);
    if (failedField !== null) {
      trace.push({ kind: 'policy-no-match', policyId: policy.id, failedField });
      continue;
    }
    trace.push({ kind: 'policy-match', policyId: policy.id, action: policy.action });
    const verdict: Verdict = {
      action: policy.action,
      matchedPolicyId: policy.id,
      dstintf,
      natApplied: policy.action === 'accept' && policy.nat,
      trace,
    };
    if (policy.action === 'accept' && vip) {
      verdict.dnat = { toIp: vip.mappedIp, toPort: vip.mappedPort };
    }
    return verdict;
  }

  // 4. Implicit Deny
  trace.push({ kind: 'implicit-deny' });
  return { action: 'deny', matchedPolicyId: 0, dstintf, natApplied: false, trace };
}
