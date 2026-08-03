import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  advanceStreak,
  EMPTY_STATS,
  EMPTY_STREAK,
  evaluateAchievements,
  RANKS,
  MAX_FREEZE_TOKENS,
  rankFor,
  streakOutcome,
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

  it('ein Freeze-Token überbrückt einen verpassten Tag', () => {
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

  /**
   * DER Fall, fuer den man Token ueberhaupt sammelt. Vorher ueberbrueckte ein
   * Token GENAU einen Tag: wer mit drei Token im Ruecken zwei Tage fehlte,
   * verlor die Serie und behielt alle drei. Ein Vorrat, der genau dann
   * versagt, wenn man ihn braucht, ist keine Absicherung.
   */
  it('mehrere Token überbrücken mehrere verpasste Tage', () => {
    const s: StreakState = {
      current: 20,
      best: 20,
      lastDate: '2026-07-01',
      freezeTokens: 3,
    };
    const after = advanceStreak(s, '2026-07-04'); // 02. und 03. verpasst
    expect(after.current).toBe(21);
    expect(after.freezeTokens).toBe(2); // 2 verbraucht, 1 neu bei Streak 21
  });

  it('reicht der Vorrat nicht, bricht die Serie — und die Token bleiben liegen', () => {
    const s: StreakState = { current: 20, best: 20, lastDate: '2026-07-01', freezeTokens: 1 };
    const after = advanceStreak(s, '2026-07-05'); // 3 Tage verpasst, 1 Token
    expect(after.current).toBe(1);
    expect(after.freezeTokens).toBe(1);
    expect(after.best).toBe(20); // der Bestwert bleibt
  });

  /**
   * Zeitzonenwechsel, uebernommener Spielstand von einem anderen Geraet,
   * falsch gestellte Uhr: das Datum kann rueckwaerts springen. Dafuer die
   * Serie zu loeschen waere eine Strafe fuer etwas, das der Spieler nicht
   * getan hat.
   */
  it('ein Datum in der Vergangenheit löscht die Serie NICHT', () => {
    const s: StreakState = { current: 12, best: 12, lastDate: '2026-07-10', freezeTokens: 0 };
    expect(advanceStreak(s, '2026-07-08')).toBe(s);
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

describe('streakOutcome — was passiert, WENN heute das Ziel faellt', () => {
  const at = (over: Partial<StreakState>): StreakState => ({ ...EMPTY_STREAK, ...over });

  it('benennt jeden Fall', () => {
    expect(streakOutcome(at({ lastDate: '2026-07-08' }), '2026-07-08')).toEqual({
      kind: 'unchanged',
    });
    expect(streakOutcome(EMPTY_STREAK, '2026-07-08')).toEqual({ kind: 'started' });
    expect(streakOutcome(at({ current: 3, lastDate: '2026-07-07' }), '2026-07-08')).toEqual({
      kind: 'continued',
    });
    expect(
      streakOutcome(at({ current: 9, lastDate: '2026-07-05', freezeTokens: 2 }), '2026-07-08'),
    ).toEqual({ kind: 'bridged', tokensSpent: 2, daysMissed: 2 });
    expect(
      streakOutcome(at({ current: 9, lastDate: '2026-07-01', freezeTokens: 1 }), '2026-07-08'),
    ).toEqual({ kind: 'broken', lostStreak: 9, daysMissed: 6 });
  });

  /**
   * DIE Zusicherung: die Vorhersage und das, was tatsaechlich passiert,
   * duerfen nie auseinanderlaufen. Genau solche Duplikate haben in diesem
   * Projekt schon zweimal falsche Zahlen im GUI erzeugt.
   */
  it('sagt fuer JEDE Kombination dasselbe voraus, was advanceStreak dann tut', () => {
    for (let gap = -2; gap <= 6; gap++) {
      for (let tokens = 0; tokens <= MAX_FREEZE_TOKENS; tokens++) {
        const last = new Date(Date.UTC(2026, 6, 10) + gap * -86_400_000);
        const state = at({
          current: 9,
          best: 9,
          lastDate: last.toISOString().slice(0, 10),
          freezeTokens: tokens,
        });
        const today = '2026-07-10';
        const outcome = streakOutcome(state, today);
        const after = advanceStreak(state, today);
        const label = `gap=${gap} tokens=${tokens}`;

        if (outcome.kind === 'unchanged') {
          expect(after, label).toBe(state);
          continue;
        }
        const expected = outcome.kind === 'broken' ? 1 : state.current + 1;
        expect(after.current, label).toBe(expected);
        const spent = outcome.kind === 'bridged' ? outcome.tokensSpent : 0;
        // Der Meilenstein-Token bei jedem 7. Tag kommt oben drauf
        const bonus = after.current % 7 === 0 ? 1 : 0;
        expect(after.freezeTokens, label).toBe(
          Math.min(MAX_FREEZE_TOKENS, state.freezeTokens - spent + bonus),
        );
      }
    }
  });

  it('bricht nur, wenn der Vorrat wirklich nicht reicht', () => {
    const missTwo = at({ current: 9, lastDate: '2026-07-05' });
    expect(streakOutcome({ ...missTwo, freezeTokens: 2 }, '2026-07-08').kind).toBe('bridged');
    expect(streakOutcome({ ...missTwo, freezeTokens: 1 }, '2026-07-08').kind).toBe('broken');
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
