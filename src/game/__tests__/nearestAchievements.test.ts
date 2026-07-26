import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, EMPTY_STATS, EMPTY_STREAK, nearestAchievements } from '../progression';
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
