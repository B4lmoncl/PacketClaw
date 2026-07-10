/**
 * Analysefunktionen für den Audit-Modus.
 *
 * findShadowedPolicies: konservative Mengenlogik — eine Policy gilt nur dann als
 * shadowed, wenn EINE frühere enabled Policy ihre Match-Menge beweisbar vollständig
 * abdeckt (Feld für Feld; das ist hinreichend, weil die Engine Felder unabhängig
 * per UND verknüpft). Kombinationen mehrerer früherer Policies werden bewusst
 * nicht betrachtet (Unentscheidbarkeits-Grauzone → nicht markieren).
 */
import { evaluate } from './evaluate';
import { ipToInt, parseCidr } from './ip';
import { addressObjectContainsIp, createResolver, serviceObjectMatches } from './resolve';
import type { Resolver } from './resolve';
import type {
  AddressObject,
  IPv4,
  MatchField,
  NetworkConfig,
  Packet,
  ServiceObject,
  TestPacket,
  Verdict,
} from './types';

type Interval = [number, number];

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter(([from, to]) => to >= from)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + 1) {
      last[1] = Math.max(last[1], to);
    } else {
      out.push([from, to]);
    }
  }
  return out;
}

/** true, wenn die Vereinigung von `cover` jedes Intervall aus `covered` vollständig enthält */
function intervalsCover(cover: readonly Interval[], covered: readonly Interval[]): boolean {
  const merged = mergeIntervals(cover);
  return mergeIntervals(covered).every(([from, to]) =>
    merged.some(([f, t]) => f <= from && to <= t),
  );
}

function addressObjectInterval(obj: AddressObject): Interval | null {
  switch (obj.type) {
    case 'subnet': {
      if (!obj.subnet) return null;
      const { from, to } = parseCidr(obj.subnet);
      return [from, to];
    }
    case 'range':
      return obj.range ? [ipToInt(obj.range.from), ipToInt(obj.range.to)] : null;
    case 'host':
      return obj.host ? [ipToInt(obj.host), ipToInt(obj.host)] : null;
  }
}

// ---------------------------------------------------------------------------
// Mengen-Repräsentationen pro Feld
// ---------------------------------------------------------------------------

/**
 * Interface-Mengen arbeiten closed-world: "any" wird auf die deklarierten
 * Interfaces expandiert (der Level-Validator stellt sicher, dass Pakete nur
 * deklarierte Interfaces nutzen).
 */
function expandIntfSet(entries: readonly string[], config: NetworkConfig): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    if (entry === 'any') {
      for (const iface of config.interfaces) out.add(iface.name);
      continue;
    }
    const zone = config.zones.find((z) => z.name === entry);
    if (zone) {
      for (const member of zone.members) {
        const iface = config.interfaces.find((i) => i.id === member || i.name === member);
        if (iface) out.add(iface.name);
      }
      continue;
    }
    if (config.interfaces.some((i) => i.name === entry)) out.add(entry);
    // unbekannter Name: matcht nie → trägt nichts bei
  }
  return out;
}

interface AddrSet {
  intervals: Interval[];
  /** VIP-Namen als eigene Atome: "all" deckt DNAT-Traffic NICHT ab (Engine-Semantik) */
  vips: Set<string>;
}

function expandAddrSet(
  entries: readonly string[],
  resolver: Resolver,
  allowVips: boolean,
): AddrSet {
  const intervals: Interval[] = [];
  const vips = new Set<string>();
  for (const entry of entries) {
    if (entry === 'all') {
      intervals.push([0, 0xffffffff]);
      continue;
    }
    if (allowVips && resolver.vipByName.has(entry)) {
      vips.add(entry);
      continue;
    }
    for (const obj of resolver.resolveAddressEntry(entry)) {
      const interval = addressObjectInterval(obj);
      if (interval) intervals.push(interval);
    }
  }
  return { intervals: mergeIntervals(intervals), vips };
}

interface SvcSet {
  anyProto: boolean;
  tcp: Interval[];
  udp: Interval[];
  icmpAny: boolean;
  icmpTypes: Set<number>;
}

const FULL_PORT_RANGE: readonly Interval[] = [[0, 65535]];

function expandSvcSet(entries: readonly string[], resolver: Resolver): SvcSet {
  const set: SvcSet = { anyProto: false, tcp: [], udp: [], icmpAny: false, icmpTypes: new Set() };
  for (const entry of entries) {
    if (entry === 'ALL') {
      set.anyProto = true;
      continue;
    }
    for (const svc of resolver.resolveServiceEntry(entry)) {
      if (svc.protocol === 'any') {
        set.anyProto = true;
      } else if (svc.protocol === 'icmp') {
        if (svc.icmpType === undefined) set.icmpAny = true;
        else set.icmpTypes.add(svc.icmpType);
      } else {
        const ranges: Interval[] =
          svc.dstPorts && svc.dstPorts.length > 0
            ? svc.dstPorts.map((r) => [r.from, r.to] as Interval)
            : [[0, 65535]];
        if (svc.protocol === 'tcp') set.tcp.push(...ranges);
        else set.udp.push(...ranges);
      }
    }
  }
  set.tcp = mergeIntervals(set.tcp);
  set.udp = mergeIntervals(set.udp);
  return set;
}

function svcCovers(j: SvcSet, i: SvcSet): boolean {
  if (j.anyProto) return true;
  if (i.anyProto) {
    // Paket-Protokolluniversum ist {tcp, udp, icmp}
    return (
      intervalsCover(j.tcp, FULL_PORT_RANGE) && intervalsCover(j.udp, FULL_PORT_RANGE) && j.icmpAny
    );
  }
  if (!intervalsCover(j.tcp, i.tcp)) return false;
  if (!intervalsCover(j.udp, i.udp)) return false;
  if (i.icmpAny && !j.icmpAny) return false;
  if (!j.icmpAny) {
    for (const type of i.icmpTypes) {
      if (!j.icmpTypes.has(type)) return false;
    }
  }
  return true;
}

function svcEmpty(s: SvcSet): boolean {
  return (
    !s.anyProto && s.tcp.length === 0 && s.udp.length === 0 && !s.icmpAny && s.icmpTypes.size === 0
  );
}

function isSubset<T>(subset: ReadonlySet<T>, superset: ReadonlySet<T>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// findShadowedPolicies
// ---------------------------------------------------------------------------

export interface ShadowedPolicy {
  policyId: number;
  /** ID der (ersten) früheren Policy, die diese vollständig abdeckt */
  shadowedBy: number;
}

interface PolicySets {
  policyId: number;
  schedule: 'always' | 'work-hours';
  srcintf: Set<string>;
  dstintf: Set<string>;
  srcaddr: AddrSet;
  dstaddr: AddrSet;
  service: SvcSet;
}

function isEmptyMatchSet(s: PolicySets): boolean {
  return (
    s.srcintf.size === 0 ||
    s.dstintf.size === 0 ||
    (s.srcaddr.intervals.length === 0 && s.srcaddr.vips.size === 0) ||
    (s.dstaddr.intervals.length === 0 && s.dstaddr.vips.size === 0) ||
    svcEmpty(s.service)
  );
}

function fieldCovers(j: PolicySets, i: PolicySets): boolean {
  return (
    isSubset(i.srcintf, j.srcintf) &&
    isSubset(i.dstintf, j.dstintf) &&
    intervalsCover(j.srcaddr.intervals, i.srcaddr.intervals) &&
    isSubset(i.srcaddr.vips, j.srcaddr.vips) &&
    intervalsCover(j.dstaddr.intervals, i.dstaddr.intervals) &&
    isSubset(i.dstaddr.vips, j.dstaddr.vips) &&
    svcCovers(j.service, i.service) &&
    (j.schedule === 'always' || j.schedule === i.schedule)
  );
}

export function findShadowedPolicies(config: NetworkConfig): ShadowedPolicy[] {
  const resolver = createResolver(config);
  const enabled = config.policies.filter((p) => p.enabled);
  const sets: PolicySets[] = enabled.map((p) => ({
    policyId: p.id,
    schedule: p.schedule,
    srcintf: expandIntfSet(p.srcintf, config),
    dstintf: expandIntfSet(p.dstintf, config),
    srcaddr: expandAddrSet(p.srcaddr, resolver, false),
    dstaddr: expandAddrSet(p.dstaddr, resolver, true),
    service: expandSvcSet(p.service, resolver),
  }));

  const results: ShadowedPolicy[] = [];
  for (let i = 1; i < sets.length; i++) {
    const candidate = sets[i] as PolicySets;
    // Leere Match-Menge: Policy ist "tot" (kaputte Referenzen o. Ä.), aber nicht
    // durch eine andere geshadowt — das meldet der Level-Validator.
    if (isEmptyMatchSet(candidate)) continue;
    for (let j = 0; j < i; j++) {
      const earlier = sets[j] as PolicySets;
      if (fieldCovers(earlier, candidate)) {
        results.push({ policyId: candidate.policyId, shadowedBy: earlier.policyId });
        break;
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// findRedundantPolicies
// ---------------------------------------------------------------------------

function sameBehavior(a: Verdict, b: Verdict): boolean {
  return (
    a.action === b.action &&
    a.dstintf === b.dstintf &&
    a.natApplied === b.natApplied &&
    a.dnat?.toIp === b.dnat?.toIp &&
    a.dnat?.toPort === b.dnat?.toPort
  );
}

/**
 * Policies, die gegen die gegebene Testpaket-Suite entfernbar sind, ohne das
 * beobachtbare Verhalten (action, dstintf, NAT/DNAT) zu ändern.
 */
export function findRedundantPolicies(config: NetworkConfig, packets: readonly Packet[]): number[] {
  const out: number[] = [];
  for (const policy of config.policies) {
    if (!policy.enabled) continue;
    const without: NetworkConfig = {
      ...config,
      policies: config.policies.filter((p) => p.id !== policy.id),
    };
    const identical = packets.every((pkt) =>
      sameBehavior(evaluate(pkt, config), evaluate(pkt, without)),
    );
    if (identical) out.push(policy.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// findOverbroadPolicies
// ---------------------------------------------------------------------------

export interface OverbroadPolicy {
  policyId: number;
  field: Exclude<MatchField, 'schedule'>;
  /** konkrete Objekt-/Interface-Namen, mit denen sich das Feld enger fassen lässt */
  narrowerCandidates: string[];
}

const BROAD_TOKENS = {
  srcintf: 'any',
  dstintf: 'any',
  srcaddr: 'all',
  dstaddr: 'all',
  service: 'ALL',
} as const;

type BroadField = keyof typeof BROAD_TOKENS;

function addressSpan(obj: AddressObject): number | null {
  const interval = addressObjectInterval(obj);
  return interval ? interval[1] - interval[0] : null;
}

function smallestAddressFor(ip: IPv4, config: NetworkConfig): string | null {
  let best: { name: string; span: number } | null = null;
  for (const obj of config.addresses) {
    if (!addressObjectContainsIp(obj, ip)) continue;
    const span = addressSpan(obj);
    if (span === null) continue;
    if (!best || span < best.span || (span === best.span && obj.name < best.name)) {
      best = { name: obj.name, span };
    }
  }
  return best ? best.name : null;
}

function serviceSpan(svc: ServiceObject): number {
  if (svc.protocol === 'icmp') return svc.icmpType === undefined ? 256 : 1;
  if (!svc.dstPorts || svc.dstPorts.length === 0) return 65536;
  return svc.dstPorts.reduce((acc, r) => acc + (r.to - r.from + 1), 0);
}

function smallestServiceFor(packet: Packet, config: NetworkConfig): string | null {
  let best: { name: string; span: number } | null = null;
  for (const svc of config.services) {
    if (svc.protocol === 'any') continue; // breite Services sind keine Härtung
    if (!serviceObjectMatches(svc, packet)) continue;
    const span = serviceSpan(svc);
    if (!best || span < best.span || (span === best.span && svc.name < best.name)) {
      best = { name: svc.name, span };
    }
  }
  return best ? best.name : null;
}

function narrowerCandidatesFor(
  field: BroadField,
  hits: readonly TestPacket[],
  config: NetworkConfig,
): string[] | null {
  const picks = new Set<string>();
  for (const { packet } of hits) {
    let name: string | null;
    switch (field) {
      case 'srcintf':
        name = packet.srcintf;
        break;
      case 'dstintf':
        name = evaluate(packet, config).dstintf || null;
        break;
      case 'srcaddr':
        name = smallestAddressFor(packet.srcIp, config);
        break;
      case 'dstaddr':
        // DNAT-Traffic matcht nie über "all" — Pakete hier sind Nicht-VIP-Pakete
        name = smallestAddressFor(packet.dstIp, config);
        break;
      case 'service':
        name = smallestServiceFor(packet, config);
        break;
    }
    if (name === null) return null; // Objektbibliothek gibt nichts Engeres her
    picks.add(name);
  }
  return [...picks].sort();
}

/**
 * Accept-Policies mit "all"/"ALL"/"any", die sich mit Objekten aus der Bibliothek
 * enger fassen lassen, ohne dass die Testsuite (must-pass UND must-block) bricht.
 * Konservativ: ohne must-pass-Treffer auf der Policy keine Empfehlung.
 */
export function findOverbroadPolicies(
  config: NetworkConfig,
  suite: readonly TestPacket[],
): OverbroadPolicy[] {
  const out: OverbroadPolicy[] = [];
  const fields = Object.keys(BROAD_TOKENS) as BroadField[];
  for (const policy of config.policies) {
    if (!policy.enabled || policy.action !== 'accept') continue;
    const hits = suite.filter(
      (t) => t.expect === 'accept' && evaluate(t.packet, config).matchedPolicyId === policy.id,
    );
    if (hits.length === 0) continue;
    for (const field of fields) {
      const broad = BROAD_TOKENS[field];
      if (!policy[field].includes(broad)) continue;
      const candidates = narrowerCandidatesFor(field, hits, config);
      if (!candidates) continue;
      const newEntries = [...new Set([...policy[field].filter((e) => e !== broad), ...candidates])];
      const modified: NetworkConfig = {
        ...config,
        policies: config.policies.map((p) =>
          p.id === policy.id ? { ...p, [field]: newEntries } : p,
        ),
      };
      const suiteGreen = suite.every((t) => evaluate(t.packet, modified).action === t.expect);
      if (suiteGreen) out.push({ policyId: policy.id, field, narrowerCandidates: candidates });
    }
  }
  return out;
}
