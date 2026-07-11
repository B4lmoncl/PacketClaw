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

  it('Regelwerk hat 6–14 Policies mit eindeutigen IDs', () => {
    const run = generateDaily('2026-07-10');
    expect(run.network.policies.length).toBeGreaterThanOrEqual(6);
    expect(run.network.policies.length).toBeLessThanOrEqual(14);
    const ids = run.network.policies.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Ausgaenge sind balanciert — keine Implicit-Deny-Flut (30 Tage)', () => {
    let totalImplicit = 0;
    for (let day = 1; day <= 30; day++) {
      const date = `2026-08-${String(day).padStart(2, '0')}`;
      const run = generateDaily(date);
      let accepts = 0;
      let implicit = 0;
      for (const packet of run.packets) {
        const verdict = evaluate(packet, run.network);
        if (verdict.action === 'accept') accepts++;
        else if (verdict.matchedPolicyId === 0) implicit++;
      }
      totalImplicit += implicit;
      // pro Tag: nie mehr als die Haelfte Implicit Deny, mindestens 2 Accepts
      expect(implicit, date).toBeLessThanOrEqual(5);
      expect(accepts, date).toBeGreaterThanOrEqual(2);
    }
    // im Schnitt ~3/10 Implicit — deutlich unter der alten Flut
    expect(totalImplicit / 30).toBeLessThanOrEqual(3.6);
  });

  it('Regelwerke variieren zwischen Tagen (Laenge und Felder)', () => {
    const lengths = new Set<number>();
    const firstServices = new Set<string>();
    for (let day = 1; day <= 14; day++) {
      const run = generateDaily(`2026-09-${String(day).padStart(2, '0')}`);
      lengths.add(run.network.policies.length);
      firstServices.add(JSON.stringify(run.network.policies.map((p) => p.service)));
    }
    expect(lengths.size).toBeGreaterThanOrEqual(4);
    expect(firstServices.size).toBe(14); // kein Tag hat dasselbe Regelwerk
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
    expect(text).toBe('AetherGate Daily 2026-07-10 · 3/4 · 🛡️🟩🟩🟥🟩');
  });
});
