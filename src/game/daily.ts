/**
 * Daily Run: 10 prozedural generierte Verdict-Aufgaben, geseedet mit dem
 * Datum — gleicher Tag ⇒ gleiche Aufgaben für alle. Kein Math.random.
 * Jeder Tag hat ein THEMA (egress/dmz/lockdown), das Struktur und Länge
 * des Regelwerks prägt (6–14 Policies), und die 10 Pakete werden nach
 * Ausgang balanciert: ~4× ACCEPT, ~3× explizites DENY, ~3× Implicit Deny —
 * statt "fast alles fällt durch bis Policy 0".
 */
import { createRng, evaluate, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Packet, Policy, Rng } from '../engine';

export interface DailyRun {
  date: string; // YYYY-MM-DD
  network: NetworkConfig;
  packets: Packet[];
}

export const INTERFACES = [
  { id: 'if-p1', name: 'port1' },
  { id: 'if-v20', name: 'vlan20' },
  { id: 'if-p2', name: 'port2' },
  { id: 'if-w1', name: 'wan1' },
];

export const ZONES = [{ id: 'z-in', name: 'inside', members: ['if-p1', 'if-v20'] }];

export const ADDRESSES = [
  { id: 'LAN_NET', name: 'LAN_NET', type: 'subnet' as const, subnet: '10.0.1.0/24' },
  { id: 'GUEST_NET', name: 'GUEST_NET', type: 'subnet' as const, subnet: '10.0.20.0/24' },
  { id: 'DMZ_NET', name: 'DMZ_NET', type: 'subnet' as const, subnet: '172.16.0.0/24' },
  { id: 'SRV_WEB01', name: 'SRV_WEB01', type: 'host' as const, host: '172.16.0.10' },
  { id: 'ADMIN_PC', name: 'ADMIN_PC', type: 'host' as const, host: '10.0.1.10' },
  {
    id: 'MGMT_RANGE',
    name: 'MGMT_RANGE',
    type: 'range' as const,
    range: { from: '10.0.1.10', to: '10.0.1.19' },
  },
];

export const SERVICES = [
  { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp' as const, dstPorts: [{ from: 443, to: 443 }] },
  { id: 'HTTP', name: 'HTTP', protocol: 'tcp' as const, dstPorts: [{ from: 80, to: 80 }] },
  { id: 'DNS', name: 'DNS', protocol: 'udp' as const, dstPorts: [{ from: 53, to: 53 }] },
  { id: 'SSH', name: 'SSH', protocol: 'tcp' as const, dstPorts: [{ from: 22, to: 22 }] },
  { id: 'RDP', name: 'RDP', protocol: 'tcp' as const, dstPorts: [{ from: 3389, to: 3389 }] },
  { id: 'PING', name: 'PING', protocol: 'icmp' as const, icmpType: 8 },
];

export const ROUTES = [
  { dst: '10.0.1.0/24', iface: 'port1' },
  { dst: '10.0.20.0/24', iface: 'vlan20' },
  { dst: '172.16.0.0/24', iface: 'port2' },
  { dst: '0.0.0.0/0', iface: 'wan1' },
];

export const ADDRESS_GROUPS = [
  { id: 'INTERNAL', name: 'INTERNAL', members: ['LAN_NET', 'MGMT_RANGE'] },
  { id: 'WEB_TIER', name: 'WEB_TIER', members: ['SRV_WEB01', 'DMZ_NET'] },
];

export const SERVICE_GROUPS = [{ id: 'WEB', name: 'WEB', members: ['HTTPS', 'HTTP'] }];

const SRC_IPS = [
  '10.0.1.5',
  '10.0.1.10',
  '10.0.1.19',
  '10.0.1.200',
  '10.0.20.7',
  '172.16.0.10',
  '198.51.100.66',
  '203.0.113.9',
];
const DST_IPS = ['203.0.113.50', '9.9.9.9', '172.16.0.10', '10.0.1.5', '198.51.100.20'];

/** Tages-Thema: prägt Feld-Gewichtung und Regelwerk-Charakter. */
export type Theme = 'egress' | 'dmz' | 'lockdown';
export const THEMES: Theme[] = ['egress', 'dmz', 'lockdown'];

export interface ThemeShape {
  src: string[];
  dst: string[];
  svc: string[];
  intfIn: string[];
  intfOut: string[];
  acceptBias: number; // Wahrscheinlichkeit fuer action=accept
}

export const SHAPES: Record<Theme, ThemeShape> = {
  // Ausgehender Traffic: wer darf womit ins Internet?
  egress: {
    src: ['LAN_NET', 'GUEST_NET', 'INTERNAL', 'ADMIN_PC', 'MGMT_RANGE'],
    dst: ['all'],
    svc: ['HTTPS', 'WEB', 'DNS', 'HTTP', 'PING', 'ALL'],
    intfIn: ['port1', 'vlan20', 'inside'],
    intfOut: ['wan1'],
    acceptBias: 0.6,
  },
  // Dienste in der DMZ: Zugriffe auf Server-Objekte
  dmz: {
    src: ['LAN_NET', 'GUEST_NET', 'INTERNAL', 'all', 'ADMIN_PC'],
    dst: ['DMZ_NET', 'SRV_WEB01', 'WEB_TIER'],
    svc: ['HTTPS', 'HTTP', 'WEB', 'SSH', 'PING'],
    intfIn: ['port1', 'vlan20', 'inside', 'wan1', 'any'],
    intfOut: ['port2'],
    acceptBias: 0.55,
  },
  // Deny-lastig: enge Ausnahmen vor breiten Verboten
  lockdown: {
    src: ['ADMIN_PC', 'MGMT_RANGE', 'LAN_NET', 'GUEST_NET', 'all'],
    dst: ['all', 'DMZ_NET', 'SRV_WEB01'],
    svc: ['SSH', 'RDP', 'HTTPS', 'DNS', 'ALL', 'PING'],
    intfIn: ['port1', 'vlan20', 'inside', 'any'],
    intfOut: ['wan1', 'port2', 'any'],
    acceptBias: 0.4,
  },
};

/** Feldwert mit gelegentlich zwei Eintraegen — wie gewachsene Regelwerke. */
function pickField(rng: Rng, pool: string[], multiChance = 0.2): string[] {
  const first = rng.pick(pool);
  if (first !== 'all' && first !== 'ALL' && rng.next() < multiChance) {
    const second = rng.pick(pool);
    if (second !== first && second !== 'all' && second !== 'ALL') return [first, second];
  }
  return [first];
}

export function themedPolicy(rng: Rng, id: number, shape: ThemeShape): Policy {
  return makePolicy({
    id,
    name: `daily-${id}`,
    enabled: rng.next() > 0.12, // gelegentlich disabled als Falle
    srcintf: [rng.pick(shape.intfIn)],
    dstintf: [rng.pick(shape.intfOut)],
    srcaddr: pickField(rng, shape.src),
    dstaddr: pickField(rng, shape.dst, 0.12),
    service: pickField(rng, shape.svc),
    action: rng.next() < shape.acceptBias ? 'accept' : 'deny',
    nat: rng.next() > 0.5,
  });
}

export function randomPacket(rng: Rng): Packet {
  const srcintf = rng.pick(['port1', 'vlan20', 'port2', 'wan1']);
  const protocol = rng.pick(['tcp', 'tcp', 'udp', 'icmp'] as const);
  const packet: Packet = {
    srcintf,
    srcIp: rng.pick(SRC_IPS),
    dstIp: rng.pick(DST_IPS),
    protocol,
  };
  if (protocol === 'icmp') {
    packet.icmpType = rng.pick([8, 0, 3]);
  } else {
    packet.dstPort = rng.pick([443, 80, 53, 22, 3389, 8080, 1023]);
  }
  return packet;
}

export type Outcome = 'accept' | 'deny' | 'implicit';

export function outcomeOf(packet: Packet, network: NetworkConfig): Outcome | null {
  const verdict = evaluate(packet, network);
  // Aufgabe muss mindestens eine Policy beruehren (no-route langweilt im Daily)
  if (!verdict.trace.some((s) => s.kind.startsWith('policy'))) return null;
  if (verdict.matchedPolicyId === 0) return 'implicit';
  return verdict.action;
}

export function generateDaily(date: string): DailyRun {
  const rng = createRng(`aethergate-daily-${date}`);
  const theme = rng.pick(THEMES);
  const shape = SHAPES[theme];

  const policyCount = rng.int(6, 14);
  const policies: Policy[] = [];
  for (let i = 0; i < policyCount; i++) {
    policies.push(themedPolicy(rng, i + 1, shape));
  }
  // Anker: eine sichere Accept-Regel, damit der Tag nie reine Deny-Wueste ist
  const anchorService = rng.pick(['HTTPS', 'WEB', 'DNS']);
  policies[0] = makePolicy({
    id: 1,
    name: 'daily-1',
    srcintf: ['inside'],
    dstintf: [theme === 'dmz' ? 'port2' : 'wan1'],
    srcaddr: [rng.pick(['LAN_NET', 'INTERNAL'])],
    dstaddr: theme === 'dmz' ? ['WEB_TIER'] : ['all'],
    service: [anchorService],
    action: 'accept',
    nat: theme !== 'dmz',
  });

  const network = makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes: ROUTES,
    policies,
  });

  // Ausgangs-Balance statt Implicit-Deny-Flut: Ziel 4/3/3, seeded gemischt
  const wanted: Outcome[] = [
    'accept',
    'accept',
    'accept',
    'accept',
    'deny',
    'deny',
    'deny',
    'implicit',
    'implicit',
    'implicit',
  ];
  for (let i = wanted.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = wanted[i] as Outcome;
    wanted[i] = wanted[j] as Outcome;
    wanted[j] = a;
  }

  const packets: Packet[] = [];
  for (const target of wanted) {
    let found: Packet | null = null;
    const seen: Partial<Record<Outcome, Packet>> = {};
    for (let attempt = 0; attempt < 200 && !found; attempt++) {
      const candidate = randomPacket(rng);
      const outcome = outcomeOf(candidate, network);
      if (outcome === null) continue;
      if (outcome === target) found = candidate;
      else seen[outcome] = seen[outcome] ?? candidate;
    }
    // Gibt das Tagesregelwerk den Ziel-Ausgang nicht her, lieber ein Paket
    // mit EXPLIZITEM Match als noch ein Implicit Deny
    packets.push(
      found ??
        seen.accept ??
        seen.deny ??
        seen.implicit ?? {
          srcintf: 'port1',
          srcIp: '10.0.1.5',
          dstIp: '203.0.113.50',
          protocol: 'tcp',
          dstPort: 443,
        },
    );
  }

  // Garantie: mindestens 2 ACCEPT-Aufgaben. Wenn der Wuerfel sie nicht
  // hergab, ersetzen wir Implicit-Denies durch Pakete, die sicher die
  // Anker-Regel (Policy 1, ganz oben) treffen.
  const anchorPacket = (): Packet => ({
    srcintf: rng.pick(['port1', 'vlan20']),
    srcIp: rng.pick(['10.0.1.5', '10.0.1.10', '10.0.1.19']),
    dstIp: theme === 'dmz' ? '172.16.0.10' : rng.pick(['203.0.113.50', '9.9.9.9']),
    protocol: anchorService === 'DNS' ? 'udp' : 'tcp',
    dstPort: anchorService === 'DNS' ? 53 : 443,
  });
  const countAccepts = () => packets.filter((p) => evaluate(p, network).action === 'accept').length;
  for (let i = packets.length - 1; i >= 0 && countAccepts() < 2; i--) {
    const packet = packets[i] as Packet;
    if (outcomeOf(packet, network) !== 'accept') packets[i] = anchorPacket();
  }

  return { date, network, packets };
}

/** Lokales Datum als YYYY-MM-DD — der Daily wechselt um Mitternacht Ortszeit. */
export function todayString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Share-Text im Stil "AetherGate Daily 2026-07-10 · 9/10 · 🛡️🟩🟩🟥…" */
export function buildShareText(date: string, results: boolean[]): string {
  const correct = results.filter(Boolean).length;
  const grid = results.map((r) => (r ? '🟩' : '🟥')).join('');
  return `AetherGate Daily ${date} · ${correct}/${results.length} · 🛡️${grid}`;
}
