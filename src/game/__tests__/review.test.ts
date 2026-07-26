import { describe, expect, it } from 'vitest';
import { evaluate } from '../../engine';
import { CONCEPTS } from '../mastery';
import type { Concept } from '../mastery';
import { actualConcept, generateReviewTask, reviewAnswerCorrect, reviewPlan } from '../review';

describe('Review-Aufgaben treffen ihr Zielkonzept', () => {
  /**
   * DAS ist der Test, auf den es ankommt: eine Uebungsaufgabe zum Konzept
   * „Service" muss auch wirklich am Service haengen. Sonst uebt der Spieler
   * etwas anderes als angekuendigt — und die Mastery-Messung wird Unsinn.
   */
  it('fuer JEDES Konzept liefert der Generator genau dieses Konzept', () => {
    for (const concept of CONCEPTS) {
      for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const task = generateReviewTask(concept, seed);
        expect(actualConcept(task), `${concept} / Seed ${seed}`).toBe(concept);
        expect(task.concept).toBe(concept);
      }
    }
  });

  it('die mitgelieferte Wahrheit stimmt mit der Engine ueberein', () => {
    for (const concept of CONCEPTS) {
      const task = generateReviewTask(concept, 'truth');
      const verdict = evaluate(task.packet, task.network);
      expect(task.expected).toBe(verdict.action);
      expect(task.expectedPolicyId).toBe(verdict.matchedPolicyId);
    }
  });

  it('ist deterministisch pro Seed', () => {
    const a = generateReviewTask('service', 'same');
    const b = generateReviewTask('service', 'same');
    expect(a.expected).toBe(b.expected);
    expect(JSON.stringify(a.network)).toBe(JSON.stringify(b.network));
  });

  it('reviewAnswerCorrect vergleicht gegen die Engine, nicht gegen eine Annahme', () => {
    for (const concept of CONCEPTS) {
      const task = generateReviewTask(concept, 'answer');
      expect(reviewAnswerCorrect(task, task.expected)).toBe(true);
      const other = task.expected === 'accept' ? 'deny' : 'accept';
      expect(reviewAnswerCorrect(task, other)).toBe(false);
    }
  });
});

describe('reviewPlan', () => {
  it('nimmt die schwachen Konzepte, wenn es welche gibt', () => {
    const weak: Concept[] = ['service', 'address'];
    const plan = reviewPlan(weak, ['vip'], 'seed', 4);
    expect(plan).toHaveLength(4);
    expect(plan.map((t) => t.concept)).toEqual(['service', 'address', 'service', 'address']);
  });

  it('faellt ohne Schwaechen auf den ungeprueften Stoff zurueck', () => {
    const plan = reviewPlan([], ['vip', 'schedule'], 'seed', 2);
    expect(plan.map((t) => t.concept)).toEqual(['vip', 'schedule']);
  });

  it('letzte Rueckfallebene: alle Konzepte, nie eine leere Sitzung', () => {
    const plan = reviewPlan([], [], 'seed', 5);
    expect(plan).toHaveLength(5);
    for (const task of plan) {
      expect(CONCEPTS).toContain(task.concept);
    }
  });

  it('die Aufgaben einer Sitzung sind nicht alle identisch', () => {
    const plan = reviewPlan(['service'], [], 'seed', 5);
    // Varianz steckt im Paket (Quell-IP) und/oder im Regelwerk
    const shapes = new Set(plan.map((t) => JSON.stringify({ p: t.packet, r: t.network.policies })));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('Varianz aendert das Konzept NICHT — alle Quell-IPs liegen in LAN_NET', () => {
    for (const concept of CONCEPTS) {
      for (const seed of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']) {
        const task = generateReviewTask(concept, seed);
        expect(actualConcept(task), `${concept} / ${seed}`).toBe(concept);
      }
    }
  });
});
