/**
 * Challenge-Regelwerke: große, „gewachsene" Policy-Sätze (16–40 Regeln) mit
 * realistischer Unordnung — gemischte Themen, uneinheitliche Namen, tote
 * (disabled) Regeln, doppelte/redundante Einträge. Zweck: das Auswerten
 * langer Regelwerke üben (Filter + Objekt-Browser sind hier Pflicht), so wie
 * man auf einer echten FortiGate ein historisch gewachsenes Regelwerk erbt.
 *
 * Liefert ein fertiges VerdictLevel, damit der bestehende Verdict-Flow
 * (Spaltentabelle, Spaltenkopf-Filter, Objekt-Browser, Packet Descent)
 * unverändert wiederverwendet wird. Deterministisch (seed), kein Math.random.
 */
import { createRng, makeConfig, makePolicy } from '../engine';
import type { Packet, Policy, Rng } from '../engine';
import type { VerdictLevel } from './levels';
import {
  ADDRESS_GROUPS,
  ADDRESSES,
  INTERFACES,
  outcomeOf,
  randomPacket,
  ROUTES,
  SERVICE_GROUPS,
  SERVICES,
  SHAPES,
  THEMES,
  ZONES,
  type Outcome,
} from './daily';

export type ChallengeSize = 'small' | 'medium' | 'large';

const SIZES: Record<ChallengeSize, number> = { small: 16, medium: 26, large: 38 };
const QUESTIONS = 8;

/** Uneinheitliche, „gewachsene" Regelnamen — wie in echten Alt-Regelwerken. */
const NAME_POOL = [
  'allow_web',
  'block_rdp',
  'OLD_temp_rule',
  'fw_permit_dns',
  'legacy_any',
  'test123',
  'perm_mgmt',
  'deny_guest_out',
  'vpn_split',
  'audit_hold',
  'srv_access',
  'no_lateral',
  'DONT_DELETE',
  'quickfix',
];

function pick1or2(rng: Rng, pool: string[]): string[] {
  const first = rng.pick(pool);
  if (first !== 'all' && first !== 'ALL' && rng.next() < 0.25) {
    const second = rng.pick(pool);
    if (second !== first && second !== 'all' && second !== 'ALL') return [first, second];
  }
  return [first];
}

function buildPolicy(rng: Rng, id: number, name: string): Policy {
  const theme = rng.pick(THEMES);
  const shape = SHAPES[theme];
  return makePolicy({
    id,
    name,
    enabled: rng.next() > 0.15, // ~15 % tote Regeln
    srcintf: [rng.pick(shape.intfIn)],
    dstintf: [rng.pick(shape.intfOut)],
    srcaddr: pick1or2(rng, shape.src),
    dstaddr: [rng.pick(shape.dst)],
    service: pick1or2(rng, shape.svc),
    action: rng.next() < shape.acceptBias ? 'accept' : 'deny',
    nat: rng.next() > 0.5,
  });
}

export function generateChallenge(seed: string, size: ChallengeSize = 'medium'): VerdictLevel {
  const rng = createRng(`aethergate-challenge-${seed}-${size}`);
  const count = SIZES[size];
  const policies: Policy[] = [];

  // Anker-Accept ganz oben, damit ACCEPT ueberhaupt erreichbar bleibt
  policies.push(
    makePolicy({
      id: 1,
      name: 'permit-core',
      srcintf: ['inside'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET'],
      dstaddr: ['all'],
      service: [rng.pick(['HTTPS', 'WEB', 'DNS'])],
      action: 'accept',
      nat: true,
    }),
  );

  for (let i = 1; i < count; i++) {
    const id = i + 1;
    // Gelegentlich eine frühere Regel duplizieren (redundant/„OLD_")
    if (i > 3 && rng.next() < 0.12) {
      const orig = policies[rng.int(1, policies.length - 1)] as Policy;
      policies.push({ ...orig, id, name: `OLD_${orig.name}` });
      continue;
    }
    const name = rng.next() < 0.5 ? rng.pick(NAME_POOL) : `rule-${id}`;
    policies.push(buildPolicy(rng, id, name));
  }

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

  // Balancierte Fragen (accept/deny/implicit rotierend), auswertbar
  const wanted: Outcome[] = [];
  for (let i = 0; i < QUESTIONS; i++) {
    wanted.push((['accept', 'deny', 'implicit'] as const)[i % 3] as Outcome);
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

  return {
    id: `challenge-${size}-${seed}`,
    chapter: 0,
    index: 0,
    mode: 'verdict',
    title: {
      de: `Challenge · ${count} Regeln`,
      en: `Challenge · ${count} rules`,
    },
    briefing: {
      de: 'Ein gewachsenes Regelwerk mit Altlasten — tote und doppelte Regeln inklusive. Nutze die Spaltenfilter und den Objekt-Browser. Bewerte jedes Paket.',
      en: 'A ruleset that grew over time — legacy, dead and duplicate rules included. Use the column filters and the object browser. Judge each packet.',
    },
    difficulty: 3,
    concepts: ['challenge', 'filtering', 'analysis'],
    network,
    packets,
    targetSeconds: Math.round(count * 3),
  };
}
