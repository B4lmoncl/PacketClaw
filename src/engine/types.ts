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
  type: 'subnet' | 'range' | 'host' | 'fqdn';
  subnet?: Cidr;
  range?: { from: IPv4; to: IPv4 };
  host?: IPv4;
  /** FQDN-Objekt, z. B. "portal.vendor.example" */
  fqdn?: string;
  /**
   * Die per DNS aufgelösten Adressen des FQDN — auf einer echten FortiGate der
   * gecachte Auflösungsstand. LEER ODER FEHLEND heißt: noch nicht aufgelöst,
   * und dann matcht das Objekt NICHTS. Genau daran scheitern in der Praxis
   * Regeln, die syntaktisch völlig korrekt aussehen.
   */
  resolvedIps?: IPv4[];
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
  /**
   * IP der Firewall AN diesem Interface. Gesetzt heißt: Pakete an genau diese
   * Adresse sind Local-In-Traffic (Verkehr an die FortiGate selbst) und laufen
   * nicht durch die Forward-Policy-Tabelle. Fehlt sie, gibt es an diesem
   * Interface kein Local-In — so verhalten sich alle Level ohne
   * Management-Thema.
   */
  ip?: IPv4;
  /**
   * Offene Management-Dienste an diesem Interface (FortiOS `set allowaccess`).
   * Fehlt oder leer heißt: nichts offen. Das ist der sichere Zustand und
   * gleichzeitig der häufigste Grund für „ich komme nicht auf die GUI".
   */
  allowaccess?: LocalService[];
}

/** Management-Dienste, die `allowaccess` kennt. */
export type LocalService = 'ping' | 'https' | 'ssh' | 'http' | 'snmp';

/**
 * Local-In-Policy (FortiOS `config firewall local-in-policy`): filtert Verkehr
 * AN die FortiGate. Kein dstintf — Local-In-Traffic hat keines. Und kein NAT:
 * es wird nichts weitergeleitet.
 */
export interface LocalInPolicy {
  id: number;
  name: string;
  enabled: boolean;
  /** Eingangs-Interface oder Zone; "any" erlaubt */
  intf: string;
  srcaddr: string[];
  /** meist "all" oder das Adressobjekt der Interface-IP */
  dstaddr: string[];
  service: string[];
  action: PolicyAction;
  schedule: ScheduleName;
}

/**
 * Admin-Konto mit Trusted Hosts (FortiOS `config system admin`, `set
 * trusthost1..10`). LEERE Liste heißt „von überall" — Auslieferungszustand und
 * Audit-Befund in einem.
 */
export interface AdminAccount {
  name: string;
  trustedHosts: Cidr[];
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
  /** Abschnitts-Label (FortiOS global-label) — rein kosmetisch fuer die
   *  Sequence Grouping View, keine Auswirkung auf das Matching */
  label?: string;
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
  // Local-In: Verkehr an die Firewall selbst
  | { kind: 'local-in'; iface: string; service: LocalService | null }
  | { kind: 'allowaccess-denied'; iface: string; service: LocalService | null }
  | { kind: 'local-in-no-match'; policyId: number; failedField: MatchField }
  | { kind: 'local-in-match'; policyId: number; action: PolicyAction }
  /** Die Asymmetrie zur Forward-Tabelle: keine Regel getroffen ⇒ erlaubt */
  | { kind: 'local-in-implicit-accept' }
  | { kind: 'trusthost-denied'; admins: string[] }
  | { kind: 'trusthost-ok'; admin: string }
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
  /**
   * Gesetzt, wenn das Paket an die Firewall SELBST ging. Dann sind
   * matchedPolicyId (0) und dstintf ('') bedeutungslos — es war kein
   * Forward-Traffic, und die Entscheidung steht in localIn.gate.
   */
  localIn?: LocalInVerdict;
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
  /**
   * Optional: Regeln für Verkehr AN die Firewall. Fehlend ist nicht dasselbe
   * wie leer und trotzdem gleich behandelt — beides heißt „keine Regel greift",
   * und Local-In endet mit implizitem ACCEPT.
   */
  localInPolicies?: LocalInPolicy[];
  /** Optional: Admin-Konten mit Trusted Hosts. Leer = trusthost spielt keine Rolle. */
  admins?: AdminAccount[];
}

/**
 * Ergebnis für Local-In-Traffic. Eigener Typ, weil hier kein dstintf, kein
 * Routing und kein NAT vorkommt — ein Verdict mit leerem dstintf wäre eine
 * Lüge über die Natur des Verkehrs.
 */
export interface LocalInVerdict {
  action: PolicyAction;
  /** Interface, dessen IP angesprochen wurde ('' wenn gar kein Local-In) */
  iface: string;
  service: LocalService | null;
  /** Welches Tor entschieden hat */
  gate: 'not-local' | 'allowaccess' | 'local-in-policy' | 'trusthost' | 'open';
  /** Local-In-Policy, die getroffen hat (fehlt beim impliziten Accept) */
  matchedPolicyId?: number;
  /** Konto, dessen trusthost die Quelle zugelassen hat */
  admin?: string;
  trace: TraceStep[];
}

/** Testpaket mit Erwartung — Basis für Architect/Audit/Incident-Verifikation */
export interface TestPacket {
  packet: Packet;
  expect: PolicyAction;
  /** optional: erwartetes SNAT-Verhalten (Kapitel 6, "vergessenes NAT") */
  expectNat?: boolean;
  note?: string;
}
