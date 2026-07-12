import { describe, expect, it } from 'vitest';
import { evaluate } from '../../engine';
import { generateEndlessRound, policyCountForRound, targetSecondsForRound } from '../endless';

describe('endless — Schwierigkeitskurve', () => {
  it('Policy-Anzahl steigt und ist gedeckelt', () => {
    expect(policyCountForRound(1)).toBe(5);
    expect(policyCountForRound(3)).toBe(6);
    expect(policyCountForRound(100)).toBe(22);
    // monoton nicht fallend
    for (let r = 2; r < 60; r++) {
      expect(policyCountForRound(r)).toBeGreaterThanOrEqual(policyCountForRound(r - 1));
    }
  });

  it('Zielzeit sinkt, bleibt aber >= 8 s', () => {
    expect(targetSecondsForRound(1)).toBe(30);
    expect(targetSecondsForRound(100)).toBe(8);
    for (let r = 2; r < 60; r++) {
      expect(targetSecondsForRound(r)).toBeLessThanOrEqual(targetSecondsForRound(r - 1));
    }
  });
});

describe('endless — Runden', () => {
  it('gleicher Seed + Runde ⇒ identische Aufgabe', () => {
    const a = generateEndlessRound('seed-x', 7);
    const b = generateEndlessRound('seed-x', 7);
    expect(a).toEqual(b);
  });

  it('jede Runde ist auswertbar und beruehrt eine Policy', () => {
    for (let r = 1; r <= 40; r++) {
      const round = generateEndlessRound('seed-y', r);
      const verdict = evaluate(round.packet, round.network);
      expect(['accept', 'deny']).toContain(verdict.action);
      expect(verdict.trace.some((s) => s.kind.startsWith('policy'))).toBe(true);
      expect(round.network.policies.length).toBe(policyCountForRound(r));
      if (round.packet.protocol !== 'icmp') expect(round.packet.dstPort).toBeDefined();
    }
  });

  it('Ausgaenge rotieren — nicht alles Implicit Deny (Runden 1–30)', () => {
    let implicit = 0;
    let accept = 0;
    for (let r = 1; r <= 30; r++) {
      const round = generateEndlessRound('seed-z', r);
      const verdict = evaluate(round.packet, round.network);
      if (verdict.matchedPolicyId === 0) implicit++;
      if (verdict.action === 'accept') accept++;
    }
    expect(implicit).toBeLessThanOrEqual(15);
    expect(accept).toBeGreaterThanOrEqual(6);
  });
});
