import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  advanceStreak,
  EMPTY_STATS,
  EMPTY_STREAK,
  evaluateAchievements,
  RANKS,
  rankFor,
  type StreakState,
} from '../progression';

describe('rankFor', () => {
  it('10 Ränge, aufsteigende Schwellen', () => {
    expect(RANKS).toHaveLength(10);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i]!.minXp).toBeGreaterThan(RANKS[i - 1]!.minXp);
    }
  });

  it('ordnet XP dem richtigen Rang zu', () => {
    expect(rankFor(0).rank.name).toBe('Packet Rookie');
    expect(rankFor(499).rank.name).toBe('Packet Rookie');
    expect(rankFor(500).rank.name).toBe('Port Wächter');
    expect(rankFor(999999).rank.name).toBe('Aether-Kommandant');
    expect(rankFor(999999).next).toBeNull();
  });

  it('progress liegt in [0,1]', () => {
    const { progress } = rankFor(1000);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
  });
});

describe('advanceStreak', () => {
  it('startet bei 1 und zählt Folgetage hoch', () => {
    let s = advanceStreak(EMPTY_STREAK, '2026-07-01');
    expect(s.current).toBe(1);
    s = advanceStreak(s, '2026-07-02');
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it('gleicher Tag ist idempotent', () => {
    const s1 = advanceStreak(EMPTY_STREAK, '2026-07-01');
    expect(advanceStreak(s1, '2026-07-01')).toBe(s1);
  });

  it('Lücke ohne Token resetted auf 1', () => {
    let s = advanceStreak(EMPTY_STREAK, '2026-07-01');
    s = advanceStreak(s, '2026-07-04');
    expect(s.current).toBe(1);
  });

  it('Freeze-Token überbrückt genau einen verpassten Tag', () => {
    let s: StreakState = {
      ...EMPTY_STREAK,
      current: 6,
      best: 6,
      lastDate: '2026-07-06',
      freezeTokens: 1,
    };
    s = advanceStreak(s, '2026-07-08'); // 07.07. verpasst
    expect(s.current).toBe(7);
    expect(s.freezeTokens).toBe(1); // 1 verbraucht, 1 neu bei Streak 7
  });

  it('alle 7 Tage gibt es ein Freeze-Token (max 3)', () => {
    let s = { ...EMPTY_STREAK };
    for (let day = 1; day <= 21; day++) {
      s = advanceStreak(s, `2026-07-${String(day).padStart(2, '0')}`);
    }
    expect(s.current).toBe(21);
    expect(s.freezeTokens).toBe(3);
  });
});

describe('Achievements', () => {
  const baseCtx = { stats: { ...EMPTY_STATS }, xp: 0, stars: {}, streak: { ...EMPTY_STREAK } };

  it('mindestens 25 Achievements definiert, IDs eindeutig', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('frischer Spielstand hat keine Achievements', () => {
    expect(evaluateAchievements(baseCtx, [])).toEqual([]);
  });

  it('First Blood: Policy 0', () => {
    const ctx = { ...baseCtx, stats: { ...EMPTY_STATS, implicitDenyCorrect: 1, levelsSolved: 1 } };
    const unlocked = evaluateAchievements(ctx, []);
    expect(unlocked).toContain('first-blood-policy0');
    expect(unlocked).toContain('first-steps');
  });

  it('bereits freigeschaltete Achievements kommen nicht erneut', () => {
    const ctx = { ...baseCtx, stats: { ...EMPTY_STATS, implicitDenyCorrect: 1 } };
    expect(evaluateAchievements(ctx, ['first-blood-policy0'])).not.toContain('first-blood-policy0');
  });

  it('Combo- und Streak-Achievements', () => {
    const ctx = {
      ...baseCtx,
      stats: { ...EMPTY_STATS, maxComboStreak: 21 },
      streak: { current: 7, best: 7, lastDate: '2026-07-10', freezeTokens: 1 },
    };
    const unlocked = evaluateAchievements(ctx, []);
    expect(unlocked).toEqual(expect.arrayContaining(['combo-x2', 'combo-x3', 'streak-7']));
    expect(unlocked).not.toContain('streak-30');
  });

  it('Sterne-basierte Achievements zählen über alle Level', () => {
    const stars: Record<string, number> = {};
    for (let i = 0; i < 20; i++) stars[`x-${i}`] = 3;
    const ctx = { ...baseCtx, stars };
    expect(evaluateAchievements(ctx, [])).toContain('stars-50');
  });
});
