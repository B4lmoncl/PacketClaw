/**
 * Objekt-Inspektion (FortiGate-Anleihe): Löst einen Policy-Feld-Eintrag
 * (SOURCE "LAN_NET", SERVICE "WEB_SERVICES", …) in eine anzeigbare Struktur
 * auf — Gruppen rekursiv als eingerückter Baum, Objekte mit ihrem Wert.
 * Pure Funktion über NetworkConfig; das Popover in der UI rendert nur.
 */
import type { AddressObject, NetworkConfig, ServiceObject } from '../engine';

export type ObjectField = 'srcintf' | 'dstintf' | 'srcaddr' | 'dstaddr' | 'service';

export interface InfoLine {
  depth: number;
  name: string;
  /** aufgelöster Wert, z. B. "10.0.1.0/24" oder "TCP/443" */
  detail?: string;
  /** true = verschachtelte Gruppe */
  group?: boolean;
}

export interface ObjectInfo {
  name: string;
  /** i18n-Suffix: objectInfo.kind.<kindKey> */
  kindKey:
    | 'address'
    | 'addressGroup'
    | 'service'
    | 'serviceGroup'
    | 'iface'
    | 'zone'
    | 'vip'
    | 'any'
    | 'unknown';
  /** Wert bei Einzelobjekten (Gruppen nutzen lines) */
  value?: string;
  /** Mitglieder (Gruppen/Zonen), rekursiv mit depth eingerückt */
  lines: InfoLine[];
  /** i18n-Suffix für Sonderhinweise: objectInfo.note.<noteKey> */
  noteKey?: 'allSrc' | 'allDst' | 'allService' | 'anyIface' | 'vip' | 'unknown';
}

export function formatAddress(obj: AddressObject): string {
  if (obj.type === 'subnet') return obj.subnet ?? '?';
  if (obj.type === 'range') return obj.range ? `${obj.range.from}–${obj.range.to}` : '?';
  return obj.host ?? '?';
}

export function formatService(svc: ServiceObject): string {
  if (svc.protocol === 'any') return 'any';
  if (svc.protocol === 'icmp') {
    return svc.icmpType === undefined ? 'ICMP' : `ICMP type ${svc.icmpType}`;
  }
  const proto = svc.protocol.toUpperCase();
  if (!svc.dstPorts || svc.dstPorts.length === 0) return proto;
  return svc.dstPorts
    .map((p) => (p.from === p.to ? `${proto}/${p.from}` : `${proto}/${p.from}-${p.to}`))
    .join(', ');
}

/** Rekursiver Mitglieder-Baum einer Adress-/Service-Gruppe (zyklensicher). */
function memberTree(
  members: string[],
  depth: number,
  seen: Set<string>,
  lookup: (name: string) => { detail?: string; members?: string[] } | null,
): InfoLine[] {
  const lines: InfoLine[] = [];
  for (const member of members) {
    const found = lookup(member);
    if (!found) {
      lines.push({ depth, name: member, detail: '?' });
      continue;
    }
    if (found.members) {
      lines.push({ depth, name: member, group: true });
      if (!seen.has(member)) {
        seen.add(member);
        lines.push(...memberTree(found.members, depth + 1, seen, lookup));
      }
      continue;
    }
    lines.push({ depth, name: member, detail: found.detail });
  }
  return lines;
}

export function resolveObjectInfo(
  config: NetworkConfig,
  field: ObjectField,
  name: string,
): ObjectInfo {
  if (field === 'srcintf' || field === 'dstintf') {
    if (name === 'any') return { name, kindKey: 'any', lines: [], noteKey: 'anyIface' };
    const zone = config.zones.find((z) => z.name === name);
    if (zone) {
      return {
        name,
        kindKey: 'zone',
        lines: zone.members.map((m) => ({ depth: 0, name: m })),
      };
    }
    const iface = config.interfaces.find((i) => i.name === name || i.id === name);
    if (iface) {
      const inZone = config.zones.find(
        (z) => z.members.includes(iface.name) || z.members.includes(iface.id),
      );
      return { name, kindKey: 'iface', value: inZone ? inZone.name : undefined, lines: [] };
    }
    return { name, kindKey: 'unknown', lines: [], noteKey: 'unknown' };
  }

  if (field === 'service') {
    if (name === 'ALL') return { name, kindKey: 'any', lines: [], noteKey: 'allService' };
    const group = config.serviceGroups.find((g) => g.name === name);
    if (group) {
      const lookup = (n: string) => {
        const g = config.serviceGroups.find((x) => x.name === n);
        if (g) return { members: g.members };
        const s = config.services.find((x) => x.name === n);
        return s ? { detail: formatService(s) } : null;
      };
      return {
        name,
        kindKey: 'serviceGroup',
        lines: memberTree(group.members, 0, new Set([name]), lookup),
      };
    }
    const svc = config.services.find((s) => s.name === name);
    if (svc) return { name, kindKey: 'service', value: formatService(svc), lines: [] };
    return { name, kindKey: 'unknown', lines: [], noteKey: 'unknown' };
  }

  // srcaddr / dstaddr
  if (name === 'all') {
    return { name, kindKey: 'any', lines: [], noteKey: field === 'dstaddr' ? 'allDst' : 'allSrc' };
  }
  const vip = config.vips.find((v) => v.name === name);
  if (vip && field === 'dstaddr') {
    const ext = vip.extPort === undefined ? vip.extIp : `${vip.extIp}:${vip.extPort}`;
    const mapped =
      vip.mappedPort === undefined ? vip.mappedIp : `${vip.mappedIp}:${vip.mappedPort}`;
    return { name, kindKey: 'vip', value: `${ext} → ${mapped}`, lines: [], noteKey: 'vip' };
  }
  const group = config.addressGroups.find((g) => g.name === name);
  if (group) {
    const lookup = (n: string) => {
      const g = config.addressGroups.find((x) => x.name === n);
      if (g) return { members: g.members };
      const a = config.addresses.find((x) => x.name === n);
      return a ? { detail: formatAddress(a) } : null;
    };
    return {
      name,
      kindKey: 'addressGroup',
      lines: memberTree(group.members, 0, new Set([name]), lookup),
    };
  }
  const addr = config.addresses.find((a) => a.name === name);
  if (addr) return { name, kindKey: 'address', value: formatAddress(addr), lines: [] };
  return { name, kindKey: 'unknown', lines: [], noteKey: 'unknown' };
}
