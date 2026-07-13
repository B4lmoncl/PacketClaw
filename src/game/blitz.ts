/**
 * Blitz-Modus (Casual): 60 Sekunden, EIN kleines, lesbares Regelwerk,
 * Paket um Paket — nur die Frage "kommt das durch?" (ACCEPT/DENY).
 * Kein Policy-Picken, keine Leben: schnelles Nebenbei-Training fuer
 * First-Match-Lesen. Punkte: 10 pro Treffer + 2 je laufender Serie.
 *
 * Deterministisch pro Seed (mulberry32) wie Daily/Endless/Challenge.
 */
import { createRng, evaluate, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Packet, Policy, Rng } from '../engine';
import {
  ADDRESSES,
  ADDRESS_GROUPS,
  INTERFACES,
  outcomeOf,
  randomPacket,
  ROUTES,
  SERVICES,
  SERVICE_GROUPS,
  SHAPES,
  themedPolicy,
  THEMES,
  ZONES,
  type Outcome,
} from './daily';

export const BLITZ_SECONDS = 60;
export const BLITZ_POLICY_COUNT = 6;

/** Ein kompaktes Regelwerk fuer die ganze Runde — klein genug fuer Tempo. */
export function generateBlitzArena(seed: string): NetworkConfig {
  const rng = createRng(`aethergate-blitz-${seed}`);
  const theme = rng.pick(THEMES);
  const shape = SHAPES[theme];

  const policies: Policy[] = [];
  for (let i = 0; i < BLITZ_POLICY_COUNT; i++) policies.push(themedPolicy(rng, i + 1, shape));
  // Anker-Accept oben, damit ACCEPT erreichbar ist (wie Endless)
  policies[0] = makePolicy({
    id: 1,
    name: 'rule-1',
    srcintf: ['inside'],
    dstintf: [theme === 'dmz' ? 'port2' : 'wan1'],
    srcaddr: [rng.pick(['LAN_NET', 'INTERNAL'])],
    dstaddr: theme === 'dmz' ? ['WEB_TIER'] : ['all'],
    service: [rng.pick(['HTTPS', 'WEB', 'DNS'])],
    action: 'accept',
    nat: theme !== 'dmz',
  });

  return makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes: ROUTES,
    policies,
  });
}

/**
 * Naechstes Paket: Ausgaenge rotieren (accept → deny → implicit), damit die
 * richtige Antwort nicht vorhersagbar immer dieselbe ist.
 */
export function blitzPacket(rng: Rng, network: NetworkConfig, index: number): Packet {
  const rotation: Outcome[] = ['accept', 'deny', 'implicit'];
  const wanted: Outcome = rotation[index % 3] ?? 'accept';
  const seen: Partial<Record<Outcome, Packet>> = {};
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = randomPacket(rng);
    const outcome = outcomeOf(candidate, network);
    if (outcome === null) continue;
    if (outcome === wanted) return candidate;
    seen[outcome] = seen[outcome] ?? candidate;
  }
  return (
    seen.accept ??
    seen.deny ??
    seen.implicit ?? {
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 443,
    }
  );
}

/** Punkte fuer eine richtige Antwort bei laufender Serie (vor dem Treffer). */
export function blitzPoints(streakBefore: number): number {
  return 10 + Math.min(streakBefore, 10) * 2;
}

/** Wahrheit der Engine fuer die Anzeige/Auswertung. */
export function blitzVerdict(packet: Packet, network: NetworkConfig) {
  return evaluate(packet, network);
}
