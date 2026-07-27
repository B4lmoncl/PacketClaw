import { describe, expect, it } from 'vitest';
import {
  isNear,
  NEAR_RATIO,
  NEAR_REMAINDER,
  ACHIEVEMENTS,
  EMPTY_STATS,
  EMPTY_STREAK,
  nearestAchievements,
} from '../progression';
import type { AchievementContext } from '../progression';

const ctx = (patch: Partial<AchievementContext['stats']> = {}, xp = 0): AchievementContext => ({
  stats: { ...EMPTY_STATS, ...patch },
  xp,
  stars: {},
  streak: { ...EMPTY_STREAK },
});

describe('nearestAchievements', () => {
  it('liefert hoechstens die gewuenschte Anzahl', () => {
    expect(nearestAchievements(ctx(), [], 3)).toHaveLength(3);
    expect(nearestAchievements(ctx(), [], 1)).toHaveLength(1);
  });

  it('sortiert das am weitesten fortgeschrittene Ziel nach vorne', () => {
    // 49 von 50 Implicit Denies — das muss ganz oben stehen
    const near = nearestAchievements(ctx({ implicitDenyCorrect: 49 }), ['first-blood-policy0'], 3);
    expect(near[0]?.achievement.id).toBe('implicit-deny-50');
    expect(near[0]?.have).toBe(49);
    expect(near[0]?.need).toBe(50);
    expect(near[0]?.ratio).toBeCloseTo(0.98);
  });

  it('blendet bereits verdiente Abzeichen aus', () => {
    const near = nearestAchievements(ctx({ levelsSolved: 5 }), [], 10);
    // first-steps (1 Level) ist laengst erfuellt und darf nicht auftauchen
    expect(near.some((n) => n.achievement.id === 'first-steps')).toBe(false);
  });

  it('respektiert die Liste schon vergebener IDs', () => {
    const all = nearestAchievements(ctx(), [], 5);
    const first = all[0]?.achievement.id ?? '';
    const without = nearestAchievements(ctx(), [first], 5);
    expect(without.some((n) => n.achievement.id === first)).toBe(false);
  });

  it('nimmt nur Abzeichen mit zaehlbarem Fortschritt', () => {
    for (const n of nearestAchievements(ctx(), [], 20)) {
      expect(n.achievement.progress).toBeDefined();
      expect(n.need).toBeGreaterThan(0);
    }
  });

  it('mindestens die Haelfte aller Abzeichen ist zaehlbar — sonst taugt die Anzeige nichts', () => {
    const countable = ACHIEVEMENTS.filter((a) => a.progress).length;
    expect(countable).toBeGreaterThanOrEqual(ACHIEVEMENTS.length / 2);
  });
});

/**
 * „Kurz davor" muss stimmen. Vorher stand dort „Aether Commander — noch 26000",
 * weil die Liste ohne Schwelle einfach auf drei aufgefuellt wurde. Ein Panel,
 * das solche Ziele als nah verkauft, wird ueberlesen — und nimmt damit auch den
 * echten Fast-Treffern die Wirkung.
 */
describe('isNear — die Schwelle fuer „kurz davor"', () => {
  it('wenige Stueck uebrig zaehlt, auch bei 0 % Fortschritt', () => {
    expect(isNear(0, 1)).toBe(true);
    expect(isNear(0, NEAR_REMAINDER)).toBe(true);
  });

  it('grosser Anteil geschafft zaehlt, auch bei grosser Restzahl', () => {
    expect(isNear(4000, 5000)).toBe(true);
    expect(isNear(NEAR_RATIO * 1000, 1000)).toBe(true);
  });

  it('weit weg ist NICHT kurz davor', () => {
    expect(isNear(9000, 30000)).toBe(false); // der urspruengliche Fehlerfall
    expect(isNear(9, 30)).toBe(false);
    expect(isNear(0, 100)).toBe(false);
  });

  it('unsinnige Ziele gelten nie als nah', () => {
    expect(isNear(0, 0)).toBe(false);
    expect(isNear(5, -1)).toBe(false);
  });

  it('nearestAchievements fuellt NICHT mehr auf', () => {
    // Frischer Spielstand: nur die wirklich greifbaren Abzeichen
    const ctx = {
      stats: { ...EMPTY_STATS },
      xp: 0,
      stars: {},
      streak: { ...EMPTY_STREAK },
    };
    const near = nearestAchievements(ctx, [], 3);
    for (const p of near) {
      expect(isNear(p.have, p.need), p.achievement.id).toBe(true);
    }
  });

  it('ein weit entferntes Ziel taucht nicht auf, auch wenn Platz waere', () => {
    const ctx = {
      stats: { ...EMPTY_STATS },
      xp: 9000,
      stars: {},
      streak: { ...EMPTY_STREAK },
    };
    const ids = nearestAchievements(ctx, [], 5).map((p) => p.achievement.id);
    // 9000 von 30000 XP ist nicht „kurz davor"
    const far = nearestAchievements(ctx, [], 99).find((p) => p.need === 30000);
    expect(far, 'ein 30000-XP-Ziel bei 9000 XP darf nicht als nah gelten').toBeUndefined();
    for (const id of ids) expect(typeof id).toBe('string');
  });
});
