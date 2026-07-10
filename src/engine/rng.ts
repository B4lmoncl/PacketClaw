/**
 * Seedbarer PRNG (mulberry32) + xmur3-String-Hash.
 * Engine und Daily-Generator nutzen ausschließlich diesen RNG — kein Math.random.
 */

/** xmur3-Hash: String → 32-bit-Seed-Fabrik */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: uint32-Seed → deterministische Folge in [0, 1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Gleichverteilt in [0, 1) */
  next(): number;
  /** Ganzzahl in [min, max], beide inklusiv */
  int(min: number, max: number): number;
  /** Zufälliges Element; wirft bei leerem Array */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates auf einer Kopie — Input bleibt unverändert */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: string | number): Rng {
  const seedInt = typeof seed === 'number' ? seed >>> 0 : xmur3(seed)();
  const next = mulberry32(seedInt);
  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) throw new Error(`Ungültiger Bereich: [${min}, ${max}]`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() auf leerem Array');
      return items[rng.int(0, items.length - 1)] as (typeof items)[number];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const a = out[i] as (typeof items)[number];
        out[i] = out[j] as (typeof items)[number];
        out[j] = a;
      }
      return out;
    },
  };
  return rng;
}
