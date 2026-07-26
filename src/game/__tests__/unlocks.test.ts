import { describe, expect, it } from 'vitest';
import {
  ALWAYS_OPEN,
  freshUnlocks,
  isUnlocked,
  nextUnlock,
  UNLOCKS,
  unlockStates,
} from '../unlocks';

describe('Freischaltungen', () => {
  it('Daily und Sandbox sind von Anfang an offen', () => {
    for (const key of ALWAYS_OPEN) {
      expect(isUnlocked(key, 0, 0)).toBe(true);
    }
  });

  it('unbekannte Modi werden nie ausgesperrt', () => {
    expect(isUnlocked('gibt-es-nicht', 0, 0)).toBe(true);
  });

  it('frischer Spieler: alles Regelbehaftete zu, Blitz ist das naechste Ziel', () => {
    const states = unlockStates(0, 0);
    expect(states.every((s) => !s.unlocked)).toBe(true);
    const next = nextUnlock(0, 0);
    expect(next?.key).toBe('blitz');
    expect(next?.levelsToGo).toBe(3);
  });

  it('Level-Fortschritt schaltet in der vorgesehenen Reihenfolge frei', () => {
    expect(isUnlocked('blitz', 3, 0)).toBe(true);
    expect(isUnlocked('matchcheck', 3, 0)).toBe(false);
    expect(isUnlocked('matchcheck', 6, 0)).toBe(true);
    expect(isUnlocked('routing', 39, 0)).toBe(false);
    expect(isUnlocked('routing', 40, 0)).toBe(true);
  });

  it('XP-Alternative: wer nur Casual spielt, kommt trotzdem weiter', () => {
    // Kein einziges Kampagnen-Level, aber viel XP aus Daily/Blitz
    expect(isUnlocked('doctor', 0, 2600)).toBe(true);
    expect(isUnlocked('doctor', 0, 2599)).toBe(false);
  });

  it('nach allem Fortschritt gibt es kein naechstes Ziel mehr', () => {
    expect(nextUnlock(80, 99999)).toBeUndefined();
  });

  it('Countdown zaehlt sowohl Level als auch XP herunter', () => {
    const next = nextUnlock(1, 100);
    expect(next?.key).toBe('blitz');
    expect(next?.levelsToGo).toBe(2);
    expect(next?.xpToGo).toBe(300);
  });

  it('freshUnlocks meldet nur noch nicht gesehene Freischaltungen', () => {
    expect(freshUnlocks(6, 0, [])).toEqual(['blitz', 'matchcheck']);
    expect(freshUnlocks(6, 0, ['blitz'])).toEqual(['matchcheck']);
    expect(freshUnlocks(6, 0, ['blitz', 'matchcheck'])).toEqual([]);
  });

  it('Schwellen steigen monoton — spaetere Modi sind nie frueher offen', () => {
    for (let i = 1; i < UNLOCKS.length; i++) {
      const prev = UNLOCKS[i - 1]!;
      const cur = UNLOCKS[i]!;
      expect(cur.levels).toBeGreaterThan(prev.levels);
      expect(cur.xp).toBeGreaterThan(prev.xp);
    }
  });

  it('jeder freischaltbare Modus ist mit der vollen Kampagne erreichbar', () => {
    for (const rule of UNLOCKS) {
      expect(isUnlocked(rule.key, 80, 0), rule.key).toBe(true);
    }
  });
});
