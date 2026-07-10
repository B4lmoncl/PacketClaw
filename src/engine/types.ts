/**
 * PacketClaw Engine — Datenmodell.
 * Pure TypeScript, keine UI-Abhängigkeiten. Semantik: siehe docs/ENGINE.md.
 */

export type IPv4 = string; // "10.0.1.5"
export type Cidr = string; // "10.0.1.0/24"

export type Protocol = 'tcp' | 'udp' | 'icmp';

export interface AddressObject {
  id: string;
  name: string; // z. B. "LAN_NET", "SRV_WEB01"
  type: 'subnet' | 'range' | 'host';
  subnet?: Cidr;
  range?: { from: IPv4; to: IPv4 };
  host?: IPv4;
}

/** Verschachtelbar: members referenzieren AddressObject- und AddressGroup-Namen */
export interface AddressGroup {
  id: string;
  name: string;
  members: string[];
}

export interface ServiceObject {
  id: string;
  name: string; // "HTTPS", "DNS", "ALL", "RDP"
  protocol: Protocol | 'any';
  dstPorts?: Array<{ from: number; to: number }>; // nur tcp/udp
  icmpType?: number; // optional, sonst any icmp
}

export interface ServiceGroup {
  id: string;
  name: string;
  members: string[];
}

export interface Iface {
  id: string;
  name: string; // "port1", "wan1", "vlan20"
}

/** members: Interface-IDs (Engine akzeptiert lenient auch Interface-Namen) */
export interface Zone {
  id: string;
  name: string;
  members: string[];
}

export interface Vip {
  id: string;
  name: string;
  extIp: IPv4;
  extPort?: number;
  mappedIp: IPv4;
  mappedPort?: number;
  protocol?: 'tcp' | 'udp';
}

export type PolicyAction = 'accept' | 'deny';
export type ScheduleName = 'always' | 'work-hours'; // work-hours = Mo–Fr 08:00–17:59

export interface Policy {
  id: number; // sichtbare Policy-ID (>0; 0 ist Implicit Deny)
  name: string;
  enabled: boolean;
  srcintf: string[]; // Iface-/Zonen-Namen oder "any"
  dstintf: string[];
  srcaddr: string[]; // Objekt-/Gruppen-Namen oder "all"
  dstaddr: string[]; // dito; darf VIP-Namen enthalten
  service: string[]; // Service-/Gruppen-Namen oder "ALL"
  action: PolicyAction;
  nat: boolean; // SNAT auf Egress-Interface-IP (nur Flag, keine Pools)
  schedule: ScheduleName;
  log: boolean;
}

export interface Packet {
  srcintf: string; // Ingress-Interface-Name
  srcIp: IPv4;
  dstIp: IPv4;
  protocol: Protocol;
  dstPort?: number; // Pflicht bei tcp/udp (Level-Validator erzwingt das)
  icmpType?: number;
  timestamp?: string; // ISO, Pflicht sobald ein Level work-hours nutzt
}

/** Longest-Prefix-Match; iface = Interface-Name */
export interface RouteEntry {
  dst: Cidr;
  iface: string;
}

export type MatchField = 'srcintf' | 'dstintf' | 'srcaddr' | 'dstaddr' | 'service' | 'schedule';

export type TraceStep =
  | { kind: 'dnat'; vipName: string; toIp: IPv4; toPort?: number }
  | { kind: 'route'; dstintf: string; route: Cidr }
  | { kind: 'no-route' }
  | { kind: 'policy-skipped'; policyId: number; reason: 'disabled' }
  | { kind: 'policy-no-match'; policyId: number; failedField: MatchField }
  | { kind: 'policy-match'; policyId: number; action: PolicyAction }
  | { kind: 'implicit-deny' };

export interface Verdict {
  action: PolicyAction;
  /** 0 = Implicit Deny (auch bei fehlender Route) */
  matchedPolicyId: number;
  /** '' wenn keine Route existiert */
  dstintf: string;
  natApplied: boolean;
  /** nur gesetzt bei ACCEPT einer DNAT-Verbindung (VIP-Match) */
  dnat?: { toIp: IPv4; toPort?: number };
  trace: TraceStep[];
}

/** Komplette Netz-Definition eines Levels — Input für evaluate() */
export interface NetworkConfig {
  interfaces: Iface[];
  zones: Zone[];
  addresses: AddressObject[];
  addressGroups: AddressGroup[];
  services: ServiceObject[];
  serviceGroups: ServiceGroup[];
  vips: Vip[];
  routes: RouteEntry[];
  policies: Policy[];
}

/** Testpaket mit Erwartung — Basis für Architect/Audit/Incident-Verifikation */
export interface TestPacket {
  packet: Packet;
  expect: PolicyAction;
  /** optional: erwartetes SNAT-Verhalten (Kapitel 6, "vergessenes NAT") */
  expectNat?: boolean;
  note?: string;
}
