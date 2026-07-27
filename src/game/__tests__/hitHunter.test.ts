import { describe, expect, it } from 'vitest';
import { findShadowedPolicies } from '../../engine';
import {
  DEAD_REASONS,
  generateHunt,
  huntAnswerCorrect,
  huntHitCounts,
  huntPlan,
} from '../hitHunter';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

/**
 * Alle drei Gruende MUESSEN im Spiel vorkommen.
 *
 * Genau hier lag ein echter Fehler: 'shadowed' kam NIE vor, weil die breite
 * Regel auch die lebenden Regeln verdeckte und die Engine-Pruefung den Fall
 * jedes Mal verwarf. Drei Tests darunter liefen dadurch stillschweigend leer.
 * Diese Zusicherung macht so etwas laut.
 */
describe('Alle Fallarten kommen vor', () => {
  it('ueber die Seeds treten alle drei Gruende auf', () => {
    const seen = new Set(SEEDS.map((s) => generateHunt(s).reason));
    for (const reason of DEAD_REASONS) {
      expect(seen.has(reason), `Grund '${reason}' kam bei keinem Seed vor`).toBe(true);
    }
  });
});

describe('Rundengenerierung', () => {
  it('ist deterministisch pro Seed', () => {
    const a = generateHunt('same');
    const b = generateHunt('same');
    expect(a.deadPolicyId).toBe(b.deadPolicyId);
    expect(a.reason).toBe(b.reason);
    expect(JSON.stringify(a.network)).toBe(JSON.stringify(b.network));
  });

  it('liefert immer eine Runde und nennt einen bekannten Grund', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      expect(DEAD_REASONS, seed).toContain(round.reason);
      expect(round.network.policies.length, seed).toBeGreaterThanOrEqual(4);
    }
  });

  it('die tote Regel steckt wirklich im Regelwerk', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      const ids = round.network.policies.map((p) => p.id);
      expect(ids, seed).toContain(round.deadPolicyId);
    }
  });

  /**
   * DIE ENTSCHEIDENDE ZUSICHERUNG: genau EINE richtige Antwort.
   *
   * Bei 'shadowed' muss die Engine-Analyse exakt diese eine Regel melden. Gaebe
   * es zwei verschattete Regeln, haette die Frage zwei Loesungen — und eine
   * Frage mit zwei Loesungen ist keine Frage.
   */
  it('bei shadowed meldet die Engine GENAU die eine Regel', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      if (round.reason !== 'shadowed') continue;
      const shadowed = findShadowedPolicies(round.network);
      expect(
        shadowed.map((s) => s.policyId),
        seed,
      ).toEqual([round.deadPolicyId]);
      expect(round.shadowedBy, seed).toBe(shadowed[0]?.shadowedBy);
    }
  });

  /**
   * Umgekehrt: in den anderen Faellen darf es GAR KEINE Verschattung geben,
   * sonst waere eine zweite Regel ebenfalls tot und ebenfalls richtig.
   */
  it('bei disabled/wrongPair gibt es keine zusaetzliche verschattete Regel', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      if (round.reason === 'shadowed') continue;
      expect(findShadowedPolicies(round.network), `${seed}/${round.reason}`).toEqual([]);
    }
  });

  it('die disabled-Regel ist auch wirklich abgeschaltet', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      if (round.reason !== 'disabled') continue;
      const dead = round.network.policies.find((p) => p.id === round.deadPolicyId);
      expect(dead?.enabled, seed).toBe(false);
    }
  });

  /**
   * Die wrongPair-Regel ist tot, WEIL keine Route zu ihrem dstintf fuehrt —
   * genau der Grund, aus dem sie auf einer echten FortiGate nie feuert.
   */
  it('bei wrongPair fuehrt keine Route zum dstintf der toten Regel', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      if (round.reason !== 'wrongPair') continue;
      const dead = round.network.policies.find((p) => p.id === round.deadPolicyId);
      const reachable = new Set(round.network.routes.map((r) => r.iface));
      for (const intf of dead?.dstintf ?? []) {
        expect(reachable.has(intf), `${seed}: ${intf} sollte unerreichbar sein`).toBe(false);
      }
    }
  });

  it('alle uebrigen Regeln sind aktiv — nur EINE ist tot', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      const others = round.network.policies.filter((p) => p.id !== round.deadPolicyId);
      for (const p of others) expect(p.enabled, `${seed}/${p.id}`).toBe(true);
    }
  });
});

describe('Antwort und Anzeige', () => {
  it('nur die tote Regel gilt als richtig', () => {
    const round = generateHunt('answer');
    expect(huntAnswerCorrect(round, round.deadPolicyId)).toBe(true);
    for (const p of round.network.policies) {
      if (p.id === round.deadPolicyId) continue;
      expect(huntAnswerCorrect(round, p.id), `Policy ${p.id}`).toBe(false);
    }
    expect(huntAnswerCorrect(round, 0)).toBe(false);
  });

  /**
   * Die Trefferzahl ist der Hinweis, mit dem man auf einer FortiGate anfaengt:
   * genau eine Null. Stuende bei mehreren Regeln 0, waere die Spalte nutzlos.
   */
  it('genau eine Regel steht auf Trefferzahl 0', () => {
    for (const seed of SEEDS) {
      const round = generateHunt(seed);
      const hits = huntHitCounts(round, seed);
      const zeros = Object.entries(hits).filter(([, n]) => n === 0);
      expect(
        zeros.map(([id]) => Number(id)),
        seed,
      ).toEqual([round.deadPolicyId]);
    }
  });

  /**
   * Ohne eigene Zahl stand in der Implicit-Deny-Zeile ebenfalls 0 — es gab
   * also ZWEI Nullen, und die Praemisse des Modus war falsch. Auf einer
   * FortiGate ist Policy 0 ohnehin die mit den meisten Treffern.
   */
  it('Policy 0 hat eine echte Trefferzahl, keine Null', () => {
    for (const seed of SEEDS) {
      const hits = huntHitCounts(generateHunt(seed), seed);
      expect(hits[0], seed).toBeGreaterThan(0);
    }
  });

  it('Trefferzahlen sind deterministisch und decken alle Regeln ab', () => {
    const round = generateHunt('hits');
    const a = huntHitCounts(round, 'x');
    const b = huntHitCounts(round, 'x');
    expect(a).toEqual(b);
    // alle Regeln PLUS die Implicit-Deny-Zeile
    expect(Object.keys(a).length).toBe(round.network.policies.length + 1);
  });

  it('huntPlan liefert die verlangte Anzahl, mindestens aber eine', () => {
    expect(huntPlan('plan', 5)).toHaveLength(5);
    expect(huntPlan('plan', 0)).toHaveLength(1);
    expect(huntPlan('plan', -3)).toHaveLength(1);
  });

  it('eine Sitzung besteht nicht aus lauter identischen Runden', () => {
    const plan = huntPlan('variety', 6);
    const shapes = new Set(plan.map((r) => `${r.reason}:${r.network.policies.length}`));
    expect(shapes.size).toBeGreaterThan(1);
  });
});
