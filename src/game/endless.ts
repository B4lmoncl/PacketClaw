/**
 * Endlos-Modus (Survival): eine nie endende Folge von Verdict-Aufgaben,
 * seeded pro Runde. Die Schwierigkeit steigt mit der Runde — mehr Policies,
 * mehr Distraktoren, engere Zeit. Drei Leben; falsch oder Timeout kostet eins.
 *
 * Deterministisch (mulberry32 über `${seed}-${round}`), kein Math.random —
 * gleicher Seed ⇒ gleiche Runden (fürs Testen und faires Teilen).
 */
import { createRng, evaluate, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Packet, Policy } from '../engine';
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

export const START_LIVES = 3;

export interface EndlessRound {
  round: number; // 1-basiert
  network: NetworkConfig;
  packet: Packet;
  /** Zielzeit in Sekunden (sinkt mit steigender Runde); 0 = kein Timer */
  targetSeconds: number;
}

/** Policy-Anzahl waechst mit der Runde: 5 → gedeckelt bei 22. */
export function policyCountForRound(round: number): number {
  return Math.min(5 + Math.floor((round - 1) / 2), 22);
}

/** Zielzeit sinkt von 30 s (Runde 1) bis minimal 8 s. */
export function targetSecondsForRound(round: number): number {
  return Math.max(30 - (round - 1), 8);
}

/**
 * Erzeugt die Aufgabe der Runde. Die gewuenschten Ausgaenge rotieren
 * (accept → deny → implicit → …), damit nicht alles im Implicit Deny landet.
 */
export function generateEndlessRound(seed: string, round: number): EndlessRound {
  const rng = createRng(`${seed}-r${round}`);
  const theme = rng.pick(THEMES);
  const shape = SHAPES[theme];
  const policyCount = policyCountForRound(round);

  const policies: Policy[] = [];
  for (let i = 0; i < policyCount; i++) policies.push(themedPolicy(rng, i + 1, shape));
  // Anker-Accept ganz oben, damit ACCEPT ueberhaupt erreichbar bleibt
  const anchorService = rng.pick(['HTTPS', 'WEB', 'DNS']);
  policies[0] = makePolicy({
    id: 1,
    name: 'rule-1',
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

  const rotation: Outcome[] = ['accept', 'deny', 'implicit'];
  const wanted: Outcome = rotation[(round - 1) % 3] ?? 'accept';
  let packet: Packet | null = null;
  const seen: Partial<Record<Outcome, Packet>> = {};
  for (let attempt = 0; attempt < 200 && !packet; attempt++) {
    const candidate = randomPacket(rng);
    const outcome = outcomeOf(candidate, network);
    if (outcome === null) continue;
    if (outcome === wanted) packet = candidate;
    else seen[outcome] = seen[outcome] ?? candidate;
  }
  packet = packet ??
    seen.accept ??
    seen.deny ??
    seen.implicit ?? {
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 443,
    };

  return { round, network, packet, targetSeconds: targetSecondsForRound(round) };
}

/** Erwartetes Verdict der Runde (die Engine ist die Wahrheit). */
export function expectedVerdict(r: EndlessRound) {
  return evaluate(r.packet, r.network);
}
