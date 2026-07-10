/**
 * Objektauflösung: Adress-/Service-Gruppen (rekursiv, zyklensicher),
 * Interface-/Zonen-Matching. Unbekannte Referenzen matchen nichts
 * (der Level-Validator meldet sie; die Engine bleibt deterministisch).
 */
import { ipToInt } from './ip';
import { parseCidr } from './ip';
import type {
  AddressGroup,
  AddressObject,
  Iface,
  IPv4,
  NetworkConfig,
  Packet,
  ServiceGroup,
  ServiceObject,
  Vip,
  Zone,
} from './types';

export interface Resolver {
  readonly config: NetworkConfig;
  readonly zoneByName: ReadonlyMap<string, Zone>;
  readonly vipByName: ReadonlyMap<string, Vip>;
  /** Rekursive Auflösung eines srcaddr/dstaddr-Eintrags zu konkreten Adressobjekten */
  resolveAddressEntry(name: string): AddressObject[];
  /** Rekursive Auflösung eines service-Eintrags zu konkreten Serviceobjekten */
  resolveServiceEntry(name: string): ServiceObject[];
  /** Policy-Interface-Eintrag ("any", Iface-Name oder Zonen-Name) gegen ein konkretes Interface */
  interfaceMatches(entry: string, ifaceName: string): boolean;
  /** Adress-Eintrag (Objekt/Gruppe, NICHT "all") gegen eine IP */
  addressEntryMatchesIp(entry: string, ip: IPv4): boolean;
  /** Service-Eintrag (Objekt/Gruppe, NICHT "ALL") gegen ein Paket */
  serviceEntryMatches(
    entry: string,
    packet: Pick<Packet, 'protocol' | 'dstPort' | 'icmpType'>,
  ): boolean;
}

export function addressObjectContainsIp(obj: AddressObject, ip: IPv4): boolean {
  const n = ipToInt(ip);
  switch (obj.type) {
    case 'subnet': {
      if (!obj.subnet) return false;
      const { from, to } = parseCidr(obj.subnet);
      return n >= from && n <= to;
    }
    case 'range': {
      if (!obj.range) return false;
      return n >= ipToInt(obj.range.from) && n <= ipToInt(obj.range.to);
    }
    case 'host': {
      if (!obj.host) return false;
      return n === ipToInt(obj.host);
    }
  }
}

export function serviceObjectMatches(
  svc: ServiceObject,
  packet: Pick<Packet, 'protocol' | 'dstPort' | 'icmpType'>,
): boolean {
  if (svc.protocol === 'any') return true;
  if (svc.protocol !== packet.protocol) return false;
  if (svc.protocol === 'icmp') {
    return svc.icmpType === undefined || svc.icmpType === packet.icmpType;
  }
  // tcp/udp: ohne dstPorts matcht jeder Port
  if (!svc.dstPorts || svc.dstPorts.length === 0) return true;
  const port = packet.dstPort;
  if (port === undefined) return false;
  return svc.dstPorts.some((r) => port >= r.from && port <= r.to);
}

export function createResolver(config: NetworkConfig): Resolver {
  const addrByName = new Map<string, AddressObject>(config.addresses.map((a) => [a.name, a]));
  const addrGroupByName = new Map<string, AddressGroup>(
    config.addressGroups.map((g) => [g.name, g]),
  );
  const svcByName = new Map<string, ServiceObject>(config.services.map((s) => [s.name, s]));
  const svcGroupByName = new Map<string, ServiceGroup>(
    config.serviceGroups.map((g) => [g.name, g]),
  );
  const zoneByName = new Map<string, Zone>(config.zones.map((z) => [z.name, z]));
  const vipByName = new Map<string, Vip>(config.vips.map((v) => [v.name, v]));
  const ifaceByName = new Map<string, Iface>(config.interfaces.map((i) => [i.name, i]));

  const addrCache = new Map<string, AddressObject[]>();
  const svcCache = new Map<string, ServiceObject[]>();

  function expandAddress(name: string, seen: Set<string>): AddressObject[] {
    if (seen.has(name)) return []; // Zyklus — abbrechen statt hängen
    seen.add(name);
    const obj = addrByName.get(name);
    if (obj) return [obj];
    const group = addrGroupByName.get(name);
    if (!group) return [];
    return group.members.flatMap((member) => expandAddress(member, seen));
  }

  function expandService(name: string, seen: Set<string>): ServiceObject[] {
    if (seen.has(name)) return [];
    seen.add(name);
    const obj = svcByName.get(name);
    if (obj) return [obj];
    const group = svcGroupByName.get(name);
    if (!group) return [];
    return group.members.flatMap((member) => expandService(member, seen));
  }

  const resolver: Resolver = {
    config,
    zoneByName,
    vipByName,
    resolveAddressEntry(name) {
      let cached = addrCache.get(name);
      if (!cached) {
        cached = expandAddress(name, new Set());
        addrCache.set(name, cached);
      }
      return cached;
    },
    resolveServiceEntry(name) {
      let cached = svcCache.get(name);
      if (!cached) {
        cached = expandService(name, new Set());
        svcCache.set(name, cached);
      }
      return cached;
    },
    interfaceMatches(entry, ifaceName) {
      if (entry === 'any') return true;
      if (entry === ifaceName) return true;
      const zone = zoneByName.get(entry);
      if (!zone) return false;
      const iface = ifaceByName.get(ifaceName);
      // Zonen-Member sind Interface-IDs; lenient auch Namen (Authoring-Komfort)
      return zone.members.some((m) => m === ifaceName || (iface !== undefined && m === iface.id));
    },
    addressEntryMatchesIp(entry, ip) {
      return resolver.resolveAddressEntry(entry).some((obj) => addressObjectContainsIp(obj, ip));
    },
    serviceEntryMatches(entry, packet) {
      return resolver.resolveServiceEntry(entry).some((svc) => serviceObjectMatches(svc, packet));
    },
  };
  return resolver;
}
