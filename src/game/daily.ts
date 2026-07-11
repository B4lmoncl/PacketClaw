/**
 * Daily Run: 10 prozedural generierte Verdict-Aufgaben, geseedet mit dem
 * Datum — gleicher Tag ⇒ gleiche Aufgaben für alle. Kein Math.random.
 * Aufbau: EIN Tagesregelwerk (8–12 Policies über einem festen Netz),
 * 10 Pakete mit steigender Gemeinheit.
 */
import { createRng, evaluate, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Packet, Policy, Rng } from '../engine';

export interface DailyRun {
  date: string; // YYYY-MM-DD
  network: NetworkConfig;
  packets: Packet[];
}

const INTERFACES = [
  { id: 'if-p1', name: 'port1' },
  { id: 'if-v20', name: 'vlan20' },
  { id: 'if-p2', name: 'port2' },
  { id: 'if-w1', name: 'wan1' },
];

const ZONES = [{ id: 'z-in', name: 'inside', members: ['if-p1', 'if-v20'] }];

const ADDRESSES = [
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

const SERVICES = [
  { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp' as const, dstPorts: [{ from: 443, to: 443 }] },
  { id: 'HTTP', name: 'HTTP', protocol: 'tcp' as const, dstPorts: [{ from: 80, to: 80 }] },
  { id: 'DNS', name: 'DNS', protocol: 'udp' as const, dstPorts: [{ from: 53, to: 53 }] },
  { id: 'SSH', name: 'SSH', protocol: 'tcp' as const, dstPorts: [{ from: 22, to: 22 }] },
  { id: 'RDP', name: 'RDP', protocol: 'tcp' as const, dstPorts: [{ from: 3389, to: 3389 }] },
  { id: 'PING', name: 'PING', protocol: 'icmp' as const, icmpType: 8 },
];

const ROUTES = [
  { dst: '10.0.1.0/24', iface: 'port1' },
  { dst: '10.0.20.0/24', iface: 'vlan20' },
  { dst: '172.16.0.0/24', iface: 'port2' },
  { dst: '0.0.0.0/0', iface: 'wan1' },
];

const SRC_ENTRIES = ['LAN_NET', 'GUEST_NET', 'DMZ_NET', 'ADMIN_PC', 'MGMT_RANGE', 'all'];
const DST_ENTRIES = ['all', 'DMZ_NET', 'SRV_WEB01'];
const SVC_ENTRIES = ['HTTPS', 'HTTP', 'DNS', 'SSH', 'RDP', 'PING', 'ALL'];
const INTF_ENTRIES = ['port1', 'vlan20', 'port2', 'wan1', 'inside', 'any'];

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

function randomPolicy(rng: Rng, id: number): Policy {
  return makePolicy({
    id,
    name: `daily-${id}`,
    enabled: rng.next() > 0.15, // gelegentlich disabled als Falle
    srcintf: [rng.pick(INTF_ENTRIES)],
    dstintf: [rng.pick(INTF_ENTRIES)],
    srcaddr: [rng.pick(SRC_ENTRIES)],
    dstaddr: [rng.pick(DST_ENTRIES)],
    service: [rng.pick(SVC_ENTRIES)],
    action: rng.next() > 0.45 ? 'accept' : 'deny',
    nat: rng.next() > 0.5,
  });
}

function randomPacket(rng: Rng): Packet {
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

/** true, wenn das Paket eine "interessante" Aufgabe ist (nicht trivial Zeile 0 ab Regel 1) */
function isInteresting(packet: Packet, network: NetworkConfig): boolean {
  const verdict = evaluate(packet, network);
  // Mindestens eine Policy muss geprüft worden sein; no-route langweilt im Daily
  return verdict.trace.some((s) => s.kind.startsWith('policy'));
}

export function generateDaily(date: string): DailyRun {
  const rng = createRng(`aethergate-daily-${date}`);

  const policyCount = rng.int(8, 12);
  const policies: Policy[] = [];
  for (let i = 0; i < policyCount; i++) {
    policies.push(randomPolicy(rng, i + 1));
  }
  // Der Tag braucht mindestens eine sichere Accept- und eine Deny-Regel
  policies[0] = makePolicy({
    id: 1,
    name: 'daily-1',
    srcintf: ['inside'],
    dstintf: ['wan1'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['all'],
    service: [rng.pick(['HTTPS', 'DNS'])],
    action: 'accept',
    nat: true,
  });

  const network = makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    services: SERVICES,
    routes: ROUTES,
    policies,
  });

  const packets: Packet[] = [];
  let guard = 0;
  while (packets.length < 10 && guard < 500) {
    guard++;
    const packet = randomPacket(rng);
    if (isInteresting(packet, network)) packets.push(packet);
  }
  // Fallback (praktisch unerreichbar): mit garantiert policy-berührenden Paketen auffüllen
  while (packets.length < 10) {
    packets.push({
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 443,
    });
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
