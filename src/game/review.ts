/**
 * Review: Aufgaben GEZIELT zum schwachen Konzept.
 *
 * Damit schließt sich der Lernkreis — Mastery zeigt die Lücke, Review füllt
 * sie, Mastery misst nach. Ohne das wäre Mastery nur eine Diagnose ohne
 * Behandlung.
 *
 * Der harte Teil ist nicht die Aufgabe, sondern die GARANTIE: eine
 * Übungsaufgabe zum Konzept „Service" muss auch wirklich am Service scheitern
 * und nicht zufällig am Interface. Deshalb baut jeder Generator sein Netz so,
 * dass conceptOfVerdict() genau sein Zielkonzept liefert — und der Test prüft
 * das für alle Konzepte durch. Das ist prüfbar, weil beides aus derselben
 * Engine-Wahrheit kommt.
 */
import { createRng, evaluate, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Packet, Rng } from '../engine';
import { CONCEPTS, conceptOfVerdict } from './mastery';
import type { Concept } from './mastery';

export interface ReviewTask {
  concept: Concept;
  network: NetworkConfig;
  packet: Packet;
  /** die Wahrheit der Engine, damit die Anzeige nichts nachrechnen muss */
  expected: 'accept' | 'deny';
  expectedPolicyId: number;
}

/** Gemeinsame Objektbibliothek der Übungsnetze — klein und überschaubar. */
const BASE = {
  interfaces: [
    { id: 'p1', name: 'port1' },
    { id: 'p2', name: 'port2' },
    { id: 'v20', name: 'vlan20' },
    { id: 'w1', name: 'wan1' },
  ],
  zones: [{ id: 'z-in', name: 'inside', members: ['p1', 'v20'] }],
  addresses: [
    { id: 'LAN_NET', name: 'LAN_NET', type: 'subnet' as const, subnet: '10.0.1.0/24' },
    { id: 'GUEST_NET', name: 'GUEST_NET', type: 'subnet' as const, subnet: '10.0.20.0/24' },
    { id: 'SRV_WEB01', name: 'SRV_WEB01', type: 'host' as const, host: '172.16.0.10' },
    { id: 'DMZ_NET', name: 'DMZ_NET', type: 'subnet' as const, subnet: '172.16.0.0/24' },
  ],
  services: [
    { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp' as const, dstPorts: [{ from: 443, to: 443 }] },
    { id: 'SSH', name: 'SSH', protocol: 'tcp' as const, dstPorts: [{ from: 22, to: 22 }] },
    { id: 'RDP', name: 'RDP', protocol: 'tcp' as const, dstPorts: [{ from: 3389, to: 3389 }] },
  ],
  routes: [
    { dst: '10.0.1.0/24', iface: 'port1' },
    { dst: '10.0.20.0/24', iface: 'vlan20' },
    { dst: '172.16.0.0/24', iface: 'port2' },
    { dst: '0.0.0.0/0', iface: 'wan1' },
  ],
};

/**
 * Quell-IPs fuer die Abwechslung. ALLE liegen in LAN_NET — sonst wuerde die
 * Ziel-Regel nicht mehr treffen und das Konzept der Aufgabe kippen. Genau
 * dagegen sichert der Test „jedes Konzept trifft sein Ziel" ab.
 */
const LAN_SRC_IPS = ['10.0.1.5', '10.0.1.17', '10.0.1.42', '10.0.1.200'] as const;

function lanPacket(rng: Rng): Packet {
  return {
    srcintf: 'port1',
    srcIp: rng.pick([...LAN_SRC_IPS]),
    dstIp: '172.16.0.10',
    protocol: 'tcp',
    dstPort: 443,
  };
}

/** Die Ziel-Regel, die am Ende trifft — in jedem Fall dieselbe Form. */
const TARGET = {
  id: 2,
  name: 'lan-to-dmz',
  srcintf: ['port1'],
  dstintf: ['port2'],
  srcaddr: ['LAN_NET'],
  dstaddr: ['SRV_WEB01'],
  service: ['HTTPS'],
  action: 'accept' as const,
};

/**
 * Baut je Konzept ein Netz, in dem GENAU dieses Konzept entscheidet.
 * Der Trick bei den Feld-Konzepten: eine Beinah-Regel davor, die nur an
 * diesem einen Feld scheitert.
 */
function buildFor(concept: Concept, rng: Rng): { network: NetworkConfig; packet: Packet } {
  // id/name NACH dem Spread, sonst ueberschreibt TARGET sie wieder
  const near = (patch: Record<string, unknown>) =>
    makePolicy({ ...TARGET, action: 'deny', ...patch, id: 1, name: 'almost' });

  switch (concept) {
    case 'implicitDeny':
      // Nichts passt — der Verkehr fällt auf Policy 0
      return {
        network: makeConfig({ ...BASE, policies: [near({ service: ['RDP'] })] }),
        packet: lanPacket(rng),
      };

    case 'routing': {
      // Ziel liegt in keinem Netz der Tabelle (auch keine Default-Route)
      const routes = BASE.routes.filter((r) => r.dst !== '0.0.0.0/0' && r.dst !== '172.16.0.0/24');
      return {
        network: makeConfig({ ...BASE, routes, policies: [makePolicy(TARGET)] }),
        packet: lanPacket(rng),
      };
    }

    case 'vip':
      return {
        network: makeConfig({
          ...BASE,
          vips: [
            {
              id: 'VIP_WEB',
              name: 'VIP_WEB',
              extIp: '203.0.113.10',
              extPort: 443,
              mappedIp: '172.16.0.10',
              mappedPort: 443,
              protocol: 'tcp',
            },
          ],
          policies: [
            makePolicy({
              id: 1,
              name: 'inbound-web',
              srcintf: ['wan1'],
              dstintf: ['port2'],
              srcaddr: ['all'],
              // Der Klassiker: manchmal steht hier die VIP, manchmal 'all'
              dstaddr: [rng.next() < 0.5 ? 'VIP_WEB' : 'all'],
              service: ['HTTPS'],
              action: 'accept',
            }),
          ],
        }),
        packet: {
          srcintf: 'wan1',
          srcIp: '198.51.100.9',
          dstIp: '203.0.113.10',
          protocol: 'tcp',
          dstPort: 443,
        },
      };

    case 'snat':
      // Erste Regel trifft sofort MIT SNAT — kein Beinah-Treffer davor
      return {
        network: makeConfig({
          ...BASE,
          policies: [
            makePolicy({
              id: 1,
              name: 'lan-web-out',
              srcintf: ['port1'],
              dstintf: ['wan1'],
              srcaddr: ['LAN_NET'],
              dstaddr: ['all'],
              service: ['HTTPS'],
              action: 'accept',
              nat: true,
            }),
          ],
        }),
        packet: { ...lanPacket(rng), dstIp: '203.0.113.50' },
      };

    case 'firstMatch':
      // Erste Regel trifft sofort, ohne NAT — wer falsch liegt, hat die
      // Reihenfolge missachtet
      return {
        network: makeConfig({
          ...BASE,
          policies: [
            makePolicy({
              id: 1,
              name: 'block-first',
              srcintf: ['inside'],
              dstintf: ['port2'],
              srcaddr: ['all'],
              dstaddr: ['all'],
              service: ['ALL'],
              action: 'deny',
            }),
            makePolicy(TARGET),
          ],
        }),
        packet: lanPacket(rng),
      };

    case 'interface':
      return {
        network: makeConfig({
          ...BASE,
          policies: [near({ srcintf: ['vlan20'] }), makePolicy(TARGET)],
        }),
        packet: lanPacket(rng),
      };

    case 'address':
      return {
        network: makeConfig({
          ...BASE,
          policies: [near({ srcaddr: ['GUEST_NET'] }), makePolicy(TARGET)],
        }),
        packet: lanPacket(rng),
      };

    case 'service':
      return {
        network: makeConfig({
          ...BASE,
          policies: [near({ service: [rng.next() < 0.5 ? 'SSH' : 'RDP'] }), makePolicy(TARGET)],
        }),
        packet: lanPacket(rng),
      };

    case 'schedule':
      // Beinah-Regel gilt nur zu Bürozeiten; das Paket kommt sonntags
      return {
        network: makeConfig({
          ...BASE,
          policies: [near({ schedule: 'work-hours' }), makePolicy(TARGET)],
        }),
        // 2026-07-26 ist ein Sonntag
        packet: { ...lanPacket(rng), timestamp: '2026-07-26T14:00:00Z' },
      };
  }
}

/** Eine Übungsaufgabe zum gewünschten Konzept, deterministisch pro Seed. */
export function generateReviewTask(concept: Concept, seed: string): ReviewTask {
  const rng = createRng(`aethergate-review-${concept}-${seed}`);
  const { network, packet } = buildFor(concept, rng);
  const verdict = evaluate(packet, network);
  return {
    concept,
    network,
    packet,
    expected: verdict.action,
    expectedPolicyId: verdict.matchedPolicyId,
  };
}

/**
 * Die Aufgabenliste einer Review-Sitzung. Schwache Konzepte zuerst; sind
 * keine belegt, wird der noch ungeprüfte Stoff genommen, und erst als letzte
 * Rückfallebene alles.
 */
export function reviewPlan(
  weak: readonly Concept[],
  untested: readonly Concept[],
  seed: string,
  count = 5,
): ReviewTask[] {
  const pool = weak.length > 0 ? weak : untested.length > 0 ? untested : [...CONCEPTS];
  return Array.from({ length: count }, (_, i) => {
    const concept = pool[i % pool.length] as Concept;
    return generateReviewTask(concept, `${seed}-${i}`);
  });
}

/** Prüft, ob eine Antwort zur Engine-Wahrheit passt. */
export function reviewAnswerCorrect(task: ReviewTask, action: 'accept' | 'deny'): boolean {
  return task.expected === action;
}

/** Das Konzept, das die Aufgabe tatsächlich trainiert (zur Selbstprüfung). */
export function actualConcept(task: ReviewTask): Concept {
  return conceptOfVerdict(evaluate(task.packet, task.network));
}
