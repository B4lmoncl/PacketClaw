import { describe, expect, it } from 'vitest';
import { createRng, mulberry32 } from '../rng';

describe('mulberry32', () => {
  it('gleicher Seed → identische Folge', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('liefert Werte in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createRng', () => {
  it('String-Seeds sind deterministisch', () => {
    const a = createRng('daily-2026-07-10');
    const b = createRng('daily-2026-07-10');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('verschiedene Seeds → verschiedene Folgen', () => {
    const a = createRng('daily-2026-07-10');
    const b = createRng('daily-2026-07-11');
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('int(): inklusive Grenzen, deckt den ganzen Bereich ab', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('int(): wirft bei ungültigem Bereich', () => {
    expect(() => createRng(1).int(5, 4)).toThrow(/Ungültiger Bereich/);
  });

  it('pick(): deterministisch, wirft bei leerem Array', () => {
    const rng = createRng('seed');
    const items = ['a', 'b', 'c'];
    expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(/leerem Array/);
  });

  it('shuffle(): Permutation, Original unverändert', () => {
    const rng = createRng('seed');
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(original);
    // gleicher Seed → gleiche Permutation
    expect(createRng('seed').shuffle(original)).toEqual(shuffled);
  });

  it('numerischer Seed verhält sich wie mulberry32', () => {
    const rng = createRng(42);
    const raw = mulberry32(42);
    expect(rng.next()).toBe(raw());
  });
});
