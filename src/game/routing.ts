/**
 * Routing-Werkstatt: „warum geht der Verkehr aufs falsche Interface?"
 *
 * Der didaktische Kniff: das Regelwerk ist KORREKT und read-only. Der Fehler
 * liegt ausschließlich in der Routing-Tabelle. Damit lernt der Spieler die
 * Reihenfolge, die in FortiOS zählt — Route zuerst, sie bestimmt das dstintf,
 * und erst danach entscheidet der Policy-Match. Eine Policy mit
 * `dstintf: port2` greift nie, wenn die Route den Verkehr nach wan1 schickt.
 *
 * Drei Fallarten, alle aus der Praxis:
 *   missing     — die spezifische Route fehlt, also greift die Default-Route
 *                 und schickt internen Verkehr Richtung Internet
 *   wrong-iface — Route existiert, zeigt aber aufs falsche Interface
 *   hijack      — jemand hat eine SPEZIFISCHERE Route eingetragen; Longest
 *                 Prefix Match schlägt „die richtige Route ist doch da"
 *
 * WICHTIG (und der stärkste Lerneffekt): solange eine Default-Route existiert,
 * gibt es kein „no route to destination" — 0.0.0.0/0 fängt alles ab. Der
 * Verkehr wird dann nach wan1 geroutet und dort von der Egress-Regel sogar
 * ERLAUBT. Die Firewall sagt ACCEPT, und die Anwendung funktioniert trotzdem
 * nicht. Deshalb prüft dieser Modus nicht nur die Action, sondern auch das
 * Egress-Interface: accept über das falsche Interface ist ein Fehler.
 *
 * Deterministisch pro Seed (mulberry32, kein Math.random).
 */
import { createRng, evaluate, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Packet, RouteEntry } from '../engine';
import { ADDRESS_GROUPS, ADDRESSES, INTERFACES, SERVICE_GROUPS, SERVICES, ZONES } from './daily';

export type RoutingBug = 'missing' | 'wrong-iface' | 'hijack';
export const ROUTING_BUGS: RoutingBug[] = ['missing', 'wrong-iface', 'hijack'];

/** Welches Konzept der Fall trainiert (für den Debrief). */
export const ROUTING_CONCEPT: Record<RoutingBug, string> = {
  missing: 'defaultRoute',
  'wrong-iface': 'dstintf',
  hijack: 'lpm',
};

/**
 * Prüfpunkt der Routing-Suite. Anders als TestPacket zählt hier auch das
 * Egress-Interface: „accept, aber übers falsche Interface" ist genau der
 * Fehler, den dieser Modus lehrt.
 */
export interface RoutingCheck {
  packet: Packet;
  expect: 'accept' | 'deny';
  expectNat?: boolean;
  /** Interface, über das der Verkehr rausgehen MUSS */
  expectDstintf?: string;
}

/** Die korrekte Routing-Tabelle des Übungsnetzes. */
const CORRECT_ROUTES: RouteEntry[] = [
  { dst: '10.0.1.0/24', iface: 'port1' },
  { dst: '10.0.20.0/24', iface: 'vlan20' },
  { dst: '172.16.0.0/24', iface: 'port2' },
  { dst: '0.0.0.0/0', iface: 'wan1' },
];

export interface RoutingCase {
  /** Netz mit korrektem Regelwerk, aber kaputter Routing-Tabelle */
  network: NetworkConfig;
  bug: RoutingBug;
  /** i18n-Schlüssel des Symptom-Tickets */
  symptomKey: string;
  /** Das Paket aus dem Ticket — damit zeigt der Trace den Fehler */
  probe: Packet;
  /** muss nach dem Fix erfüllt sein */
  suite: RoutingCheck[];
}

export function generateRoutingCase(seed: string): RoutingCase {
  const rng = createRng(`aethergate-routing-${seed}`);
  const bug = rng.pick(ROUTING_BUGS);

  // Der Verkehr, um den es im Ticket geht: LAN → Webserver in der DMZ.
  const probe: Packet = {
    srcintf: 'port1',
    srcIp: rng.pick(['10.0.1.5', '10.0.1.42', '10.0.1.200']),
    dstIp: '172.16.0.10',
    protocol: 'tcp',
    dstPort: 443,
  };

  // Korrektes, unantastbares Regelwerk: LAN darf per HTTPS in die DMZ.
  const policies = [
    makePolicy({
      id: 1,
      name: 'lan-to-dmz-https',
      srcintf: ['port1'],
      dstintf: ['port2'],
      srcaddr: ['LAN_NET'],
      dstaddr: ['SRV_WEB01'],
      service: ['HTTPS'],
      action: 'accept',
    }),
    makePolicy({
      id: 2,
      name: 'lan-web-out',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET'],
      dstaddr: ['all'],
      service: ['WEB'],
      action: 'accept',
      nat: true,
    }),
  ];

  let routes: RouteEntry[];
  if (bug === 'missing') {
    // Die DMZ-Route fehlt ganz — das Paket findet keinen Weg.
    routes = CORRECT_ROUTES.filter((r) => r.dst !== '172.16.0.0/24');
  } else if (bug === 'wrong-iface') {
    // Route zeigt aufs falsche Interface ⇒ dstintf passt zu keiner Policy.
    routes = CORRECT_ROUTES.map((r) =>
      r.dst === '172.16.0.0/24' ? { ...r, iface: rng.pick(['wan1', 'vlan20']) } : r,
    );
  } else {
    // Hijack: eine spezifischere Route gewinnt per Longest Prefix Match.
    routes = [...CORRECT_ROUTES, { dst: '172.16.0.0/25', iface: rng.pick(['wan1', 'vlan20']) }];
  }

  const network = makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes,
    policies,
  });

  // Der Ticket-Verkehr muss ankommen; der Rest darf nicht kaputtgehen —
  // insbesondere soll niemand die DMZ-Route „reparieren", indem er alles
  // nach port2 schickt (dann bricht der Web-Zugang ins Internet).
  const suite: RoutingCheck[] = [
    // Muss ankommen UND über port2 rausgehen — accept über wan1 ist der Fehler
    { packet: probe, expect: 'accept', expectDstintf: 'port2' },
    {
      packet: {
        srcintf: 'port1',
        srcIp: probe.srcIp,
        dstIp: '203.0.113.50',
        protocol: 'tcp',
        dstPort: 443,
      },
      expect: 'accept',
      expectNat: true,
      expectDstintf: 'wan1',
    },
    // SSH in die DMZ ist von keiner Policy erlaubt und muss geblockt bleiben
    {
      packet: {
        srcintf: 'port1',
        srcIp: probe.srcIp,
        dstIp: '172.16.0.10',
        protocol: 'tcp',
        dstPort: 22,
      },
      expect: 'deny',
    },
  ];

  return { network, bug, symptomKey: `routing.symptom.${bug}`, probe, suite };
}

/** Wie viele Suite-Prüfungen die aktuelle Routing-Tabelle NICHT erfüllt. */
export function failingRoutes(suite: readonly RoutingCheck[], config: NetworkConfig): number {
  return suite.filter((check) => !checkPasses(check, config)).length;
}

/** Einzelprüfung — auch für die Live-Anzeige im UI. */
export function checkPasses(check: RoutingCheck, config: NetworkConfig): boolean {
  const verdict = evaluate(check.packet, config);
  if (verdict.action !== check.expect) return false;
  if (check.expectNat !== undefined && verdict.natApplied !== check.expectNat) return false;
  // Nur bei erlaubtem Verkehr ist das Egress-Interface überhaupt relevant
  if (check.expect === 'accept' && check.expectDstintf !== undefined) {
    return verdict.dstintf === check.expectDstintf;
  }
  return true;
}

/**
 * Route-Lookup wie in FortiOS: welche Route gewinnt für diese Ziel-IP, und
 * über welches Interface geht der Verkehr dann raus? Nutzt bewusst die Engine
 * (evaluate → Trace), damit Anzeige und Wahrheit nicht auseinanderlaufen.
 */
export interface RouteLookupResult {
  matched: RouteEntry | undefined;
  dstintf: string | undefined;
}

export function lookupRoute(config: NetworkConfig, dstIp: string): RouteLookupResult {
  const verdict = evaluate(
    { srcintf: 'port1', srcIp: '10.0.1.5', dstIp, protocol: 'tcp', dstPort: 443 },
    config,
  );
  const step = verdict.trace.find((s) => s.kind === 'route');
  if (step?.kind !== 'route') return { matched: undefined, dstintf: undefined };
  return {
    matched: config.routes.find((r) => r.dst === step.route && r.iface === step.dstintf),
    dstintf: step.dstintf,
  };
}
