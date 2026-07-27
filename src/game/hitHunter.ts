/**
 * Hit-Hunter: „welche Regel feuert hier nie?"
 *
 * DIE ECHTE FÄHIGKEIT DAHINTER. Auf einer FortiGate steht in der Spalte
 * Trefferzahl eine Null, und die Aufgabe ist zu entscheiden, WARUM. Eine Regel
 * mit null Treffern ist entweder verschattet, abgeschaltet, oder für Verkehr
 * geschrieben, der über dieses Interface-Paar nie läuft. Alle drei sehen in der
 * Tabelle identisch aus, und alle drei werden identisch behandelt: gar nicht.
 *
 * WARUM DIE ENGINE HIER DIE PRÜFINSTANZ IST. Der Modus behauptet nicht, eine
 * Regel sei tot — er lässt es sich von `findShadowedPolicies` bestätigen
 * (CLAUDE.md: die Engine ist die Wahrheit). Der Generator baut einen Fall und
 * verwirft ihn, wenn die Analyse ihn nicht bestätigt. Damit kann keine Runde
 * eine Antwort verlangen, die fachlich falsch ist.
 *
 * Kurze Runden zu je einer Frage — der Modus gehört zu den schnellen
 * Formaten, nicht zu den Werkstätten. Deterministisch pro Seed.
 */
import { createRng, findShadowedPolicies, makeConfig, makePolicy } from '../engine';
import type { NetworkConfig, Policy } from '../engine';
import { ADDRESSES, ADDRESS_GROUPS, INTERFACES, SERVICES, SERVICE_GROUPS, ZONES } from './daily';

/** Warum die Regel nie feuert. */
export type DeadReason = 'shadowed' | 'disabled' | 'wrongPair';
export const DEAD_REASONS: DeadReason[] = ['shadowed', 'disabled', 'wrongPair'];

export interface HitHunterRound {
  network: NetworkConfig;
  /** Die Regel, die nie feuert */
  deadPolicyId: number;
  reason: DeadReason;
  /** Bei 'shadowed': die Regel, die sie verdeckt — für den Debrief */
  shadowedBy?: number;
}

/** Fertige Bausteine: echte Objektnamen aus dem Übungsnetz. */
const SRC = ['LAN_NET', 'GUEST_NET'] as const;
const DST = ['SRV_WEB01', 'DMZ_NET', 'all'] as const;
const SVC = ['HTTPS', 'HTTP', 'SSH', 'DNS', 'RDP'] as const;

/**
 * Ein Regelwerk, in dem GENAU EINE Regel nie feuert.
 *
 * Die lebenden Regeln werden absichtlich so gebaut, dass sie sich nicht
 * gegenseitig verdecken: sonst gäbe es mehrere richtige Antworten, und eine
 * Frage mit zwei Lösungen ist keine Frage.
 */
function buildRound(seed: string, reason: DeadReason): HitHunterRound | null {
  const rng = createRng(`aethergate-hunt-${seed}-${reason}`);
  const policies: Policy[] = [];
  let nextId = 1;

  /**
   * Beim Verschattungs-Fall gehören HTTPS und HTTP dem Regelpaar allein.
   *
   * Ohne diese Reservierung deckte die breite Regel auch die lebenden Regeln
   * ab — es gab dann DREI tote Regeln statt einer, und die Frage hatte drei
   * richtige Antworten. Die Engine-Prüfung unten hat den Fall verworfen, und
   * zwar jedes Mal: der Grund „shadowed" kam nie im Spiel vor.
   */
  const reserved = reason === 'shadowed' ? ['HTTPS', 'HTTP'] : [];
  const available = SVC.filter((s) => !reserved.includes(s));

  // Drei bis vier unauffällige, paarweise disjunkte Regeln
  const liveCount = rng.int(3, Math.min(4, available.length));
  const usedSvc = new Set<string>();
  for (let i = 0; i < liveCount; i++) {
    let service = rng.pick(available);
    // Verschiedene Services halten die lebenden Regeln disjunkt
    for (let tries = 0; tries < 8 && usedSvc.has(service); tries++) service = rng.pick(available);
    if (usedSvc.has(service)) continue;
    usedSvc.add(service);
    policies.push(
      makePolicy({
        id: nextId++,
        name: `allow-${service.toLowerCase()}`,
        srcintf: ['port1'],
        dstintf: ['wan1'],
        srcaddr: [rng.pick(SRC)],
        dstaddr: ['all'],
        service: [service],
        action: 'accept',
        nat: true,
      }),
    );
  }
  if (policies.length < 3) return null;

  let deadPolicyId: number;
  let shadowedBy: number | undefined;

  if (reason === 'shadowed') {
    /**
     * Die breite Regel deckt GENAU die engere ab und sonst nichts: derselbe
     * Quellbereich, ein Ziel, das das engere enthält, und die Service-Gruppe
     * WEB, die HTTPS enthält. Die lebenden Regeln benutzen keinen der beiden
     * Web-Services (siehe `reserved`) und bleiben deshalb unberührt.
     */
    const broad = makePolicy({
      id: nextId++,
      name: 'lan-web-out',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET'],
      dstaddr: ['all'],
      service: ['WEB'],
      action: 'accept',
      nat: true,
    });
    const narrow = makePolicy({
      id: nextId++,
      name: 'lan-https-srv',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET'],
      dstaddr: [rng.pick(DST)],
      service: ['HTTPS'],
      action: 'accept',
      nat: true,
    });
    // Die breite Regel muss VOR der engeren stehen, sonst verdeckt sie nichts
    policies.unshift(broad);
    policies.push(narrow);
    deadPolicyId = narrow.id;
    shadowedBy = broad.id;
  } else if (reason === 'disabled') {
    const off = makePolicy({
      id: nextId++,
      name: 'legacy-rdp',
      enabled: false,
      srcintf: ['port1'],
      dstintf: ['port2'],
      srcaddr: ['LAN_NET'],
      dstaddr: ['SRV_WEB01'],
      service: ['RDP'],
      action: 'accept',
    });
    policies.push(off);
    deadPolicyId = off.id;
  } else {
    // Ein Interface-Paar, das es im Netz nicht gibt: nichts wird von vlan20
    // nach port2 geroutet, die Regel kann also nie greifen
    const orphan = makePolicy({
      id: nextId++,
      name: 'guest-to-dmz',
      srcintf: ['vlan20'],
      dstintf: ['port2'],
      srcaddr: ['GUEST_NET'],
      dstaddr: ['SRV_WEB01'],
      service: [rng.pick(['SSH', 'RDP'])],
      action: 'accept',
    });
    policies.push(orphan);
    deadPolicyId = orphan.id;
  }

  const network = makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    // KEINE Route nach port2 — das ist es, was die wrongPair-Regel tötet, und
    // es ist derselbe Grund, aus dem sie auf einer echten FortiGate nie feuert
    routes: [{ dst: '0.0.0.0/0', iface: 'wan1' }],
    policies,
  });

  /**
   * PRÜFUNG DURCH DIE ENGINE. Bei 'shadowed' muss die Analyse genau diese eine
   * Regel melden — sonst ist die Frage nicht eindeutig und der Fall fliegt raus.
   */
  const shadowed = findShadowedPolicies(network);
  if (reason === 'shadowed') {
    const hit = shadowed.find((s) => s.policyId === deadPolicyId);
    if (!hit || shadowed.length !== 1) return null;
    shadowedBy = hit.shadowedBy;
  } else if (shadowed.length > 0) {
    // In den anderen Fällen darf es KEINE Verschattung geben, sonst gäbe es
    // eine zweite richtige Antwort
    return null;
  }

  return { network, deadPolicyId, reason, ...(shadowedBy !== undefined && { shadowedBy }) };
}

/**
 * Eine Runde zu einem Seed. Probiert die Gründe durch, bis einer von der Engine
 * bestätigt wird — so kann der Modus nie eine Runde stellen, deren Antwort
 * fachlich nicht stimmt.
 */
export function generateHunt(seed: string): HitHunterRound {
  const rng = createRng(`aethergate-hunt-pick-${seed}`);
  const order = [rng.pick(DEAD_REASONS), ...DEAD_REASONS];
  for (const reason of order) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const round = buildRound(`${seed}-${attempt}`, reason);
      if (round) return round;
    }
  }
  // Letzte Rückfallebene: 'disabled' ist konstruktiv immer baubar
  const fallback = buildRound(`${seed}-fallback`, 'disabled');
  if (fallback) return fallback;
  throw new Error('hitHunter: kein Fall baubar');
}

/** Runden für eine Sitzung. */
export function huntPlan(seed: string, count: number): HitHunterRound[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => generateHunt(`${seed}-${i}`));
}

export function huntAnswerCorrect(round: HitHunterRound, pickedPolicyId: number): boolean {
  return pickedPolicyId === round.deadPolicyId;
}

/**
 * Trefferzahlen für die Anzeige: die tote Regel steht auf 0, alle anderen auf
 * einer plausiblen Zahl. Das ist der Hinweis, mit dem man auf einer echten
 * FortiGate anfängt — und die 0 allein sagt noch nicht, WARUM.
 */
export function huntHitCounts(round: HitHunterRound, seed: string): Record<number, number> {
  const rng = createRng(`aethergate-hunt-hits-${seed}`);
  const out: Record<number, number> = {};
  for (const policy of round.network.policies) {
    out[policy.id] = policy.id === round.deadPolicyId ? 0 : rng.int(12, 90_000);
  }
  /**
   * Policy 0 bekommt eine ECHTE Zahl.
   *
   * Ohne sie stand in der Implicit-Deny-Zeile ebenfalls eine 0 — es gab also
   * zwei Nullen in der Tabelle, und die Prämisse des Modus („genau eine Regel
   * hat nie gefeuert") war schlicht falsch. Auf einer FortiGate ist Policy 0
   * ohnehin die mit den meisten Treffern: sie fängt alles ab, was sonst nirgends
   * passt.
   */
  out[0] = rng.int(5_000, 400_000);
  return out;
}
