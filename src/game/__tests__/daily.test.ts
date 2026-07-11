import { describe, expect, it } from 'vitest';
import { evaluate } from '../../engine';
import { buildShareText, generateDaily, todayString } from '../daily';

describe('generateDaily', () => {
  it('gleiches Datum → identischer Run (deterministisch)', () => {
    const a = generateDaily('2026-07-10');
    const b = generateDaily('2026-07-10');
    expect(a).toEqual(b);
  });

  it('verschiedene Tage → verschiedene Runs', () => {
    const a = generateDaily('2026-07-10');
    const b = generateDaily('2026-07-11');
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it('liefert genau 10 auswertbare Pakete', () => {
    for (const date of ['2026-07-10', '2026-01-01', '2027-12-31']) {
      const run = generateDaily(date);
      expect(run.packets).toHaveLength(10);
      for (const packet of run.packets) {
        const verdict = evaluate(packet, run.network);
        expect(['accept', 'deny']).toContain(verdict.action);
        // Jede Aufgabe berührt mindestens eine Policy (kein no-route-Trivialfall)
        expect(verdict.trace.some((s) => s.kind.startsWith('policy'))).toBe(true);
        if (packet.protocol !== 'icmp') expect(packet.dstPort).toBeDefined();
      }
    }
  });

  it('Regelwerk hat 8–12 Policies mit eindeutigen IDs', () => {
    const run = generateDaily('2026-07-10');
    expect(run.network.policies.length).toBeGreaterThanOrEqual(8);
    expect(run.network.policies.length).toBeLessThanOrEqual(12);
    const ids = run.network.policies.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('todayString', () => {
  it('formatiert lokal als YYYY-MM-DD', () => {
    expect(todayString(new Date(2026, 6, 10, 23, 59))).toBe('2026-07-10');
    expect(todayString(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('buildShareText', () => {
  it('baut den Share-Text im vereinbarten Format', () => {
    const text = buildShareText('2026-07-10', [true, true, false, true]);
    expect(text).toBe('AetherGate Daily 2026-07-10 · 3/4 · 🦞🟩🟩🟥🟩');
  });
});
