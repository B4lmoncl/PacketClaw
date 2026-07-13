/**
 * Match-Check (Casual): EINE Regel, EIN Paket — matcht die Regel das Paket?
 * Trainiert das Feld-fuer-Feld-Lesen (srcintf/dstintf via Routing, Adressen,
 * Service, Schedule), die Vorstufe zum First-Match-Denken. Bei "kein Match"
 * liefert die Engine das Feld, an dem es scheitert — das leuchtet im
 * Feedback rot.
 *
 * Wahrheit: evaluate() ueber ein Netz mit NUR dieser einen Regel.
 */
import { createRng, evaluate, makeConfig } from '../engine';
import type { MatchField, NetworkConfig, Packet, Policy, Rng } from '../engine';
import {
  ADDRESSES,
  ADDRESS_GROUPS,
  INTERFACES,
  randomPacket,
  ROUTES,
  SERVICES,
  SERVICE_GROUPS,
  SHAPES,
  themedPolicy,
  THEMES,
  ZONES,
} from './daily';

export const MATCHCHECK_SECONDS = 45;
const POOL_SIZE = 8;

export interface MatchQuestion {
  /** Netz mit genau dieser einen Regel (fuer die Tabelle + Engine-Wahrheit) */
  network: NetworkConfig;
  packet: Packet;
  matches: boolean;
  /** bei "kein Match": das Feld, an dem die Regel scheitert */
  failedField?: MatchField;
}

/** Pool lesbarer Einzelregeln — immer enabled (disabled waere hier unfair). */
export function generateMatchPool(seed: string): Policy[] {
  const rng = createRng(`aethergate-match-${seed}`);
  const pool: Policy[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const shape = SHAPES[rng.pick(THEMES)];
    pool.push({ ...themedPolicy(rng, i + 1, shape), enabled: true });
  }
  return pool;
}

function singlePolicyNet(policy: Policy): NetworkConfig {
  return makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes: ROUTES,
    policies: [{ ...policy, id: 1 }],
  });
}

/**
 * Naechste Frage: Match/Kein-Match wechseln sich ab, damit die richtige
 * Antwort nicht vorhersagbar ist. Pakete ohne Route werden verworfen
 * (dstintf waere sonst nie pruefbar).
 */
export function matchQuestion(rng: Rng, pool: Policy[], index: number): MatchQuestion {
  const wantMatch = index % 2 === 0;
  let fallback: MatchQuestion | null = null;
  for (let attempt = 0; attempt < 250; attempt++) {
    const policy = rng.pick(pool);
    const network = singlePolicyNet(policy);
    const packet = randomPacket(rng);
    const verdict = evaluate(packet, network);
    if (verdict.trace.some((s) => s.kind === 'no-route')) continue;
    const matches = verdict.matchedPolicyId === 1;
    const noMatch = verdict.trace.find((s) => s.kind === 'policy-no-match');
    const question: MatchQuestion = {
      network,
      packet,
      matches,
      ...(noMatch && noMatch.kind === 'policy-no-match'
        ? { failedField: noMatch.failedField }
        : {}),
    };
    if (matches === wantMatch) return question;
    fallback = fallback ?? question;
  }
  return (
    fallback ?? {
      network: singlePolicyNet(pool[0] as Policy),
      packet: {
        srcintf: 'port1',
        srcIp: '10.0.1.5',
        dstIp: '203.0.113.50',
        protocol: 'tcp',
        dstPort: 443,
      },
      matches: false,
    }
  );
}
