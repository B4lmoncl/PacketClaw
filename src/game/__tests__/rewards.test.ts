import { describe, expect, it } from 'vitest';
import {
  applyCombo,
  CHEST_EVERY,
  chestsEarned,
  comboTier,
  dailyGoal,
  DEFAULT_DAILY_GOAL,
  openChest,
  STAKE_STREAK_THRESHOLD,
  stakeLevel,
} from '../rewards';
import { COMBO_MAX, comboMultiplier } from '../scoring';

describe('Combo', () => {
  it('DER Vertrag: comboTier zeigt IMMER den Multiplikator, mit dem auch\n     gerechnet wird — sonst luegt die Anzeige ueber die Belohnung', () => {
    for (let streak = 0; streak <= 30; streak++) {
      expect(comboTier(streak).multiplier, `Serie ${streak}`).toBe(comboMultiplier(streak));
    }
  });

  it('die Stufen-BENENNUNG beginnt bei 3 und endet bei 12', () => {
    expect(comboTier(2).level).toBe(0);
    expect(comboTier(2).key).toBe('');
    expect(comboTier(3).level).toBe(1);
    expect(comboTier(5).level).toBe(2);
    expect(comboTier(8).level).toBe(3);
    expect(comboTier(12).level).toBe(4);
    expect(comboTier(99).level).toBe(4);
  });

  it('Multiplikator steigt monoton und deckelt beim Cap der Kurve', () => {
    let last = 0;
    for (let s = 0; s <= 40; s++) {
      const m = comboTier(s).multiplier;
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
    expect(comboTier(40).multiplier).toBe(COMBO_MAX);
  });

  it('applyCombo rechnet mit derselben Kurve und liefert Ganzzahlen', () => {
    for (const [base, streak] of [
      [100, 0],
      [100, 3],
      [90, 5],
      [101, 8],
      [77, 21],
    ] as const) {
      expect(applyCombo(base, streak)).toBe(Math.round(base * comboMultiplier(streak)));
      expect(Number.isInteger(applyCombo(base, streak))).toBe(true);
    }
  });
});

describe('Tagesziel', () => {
  it('leerer Tag: nichts geschafft, alles offen', () => {
    const g = dailyGoal(0);
    expect(g).toMatchObject({ target: DEFAULT_DAILY_GOAL, earned: 0, done: false, progress: 0 });
    expect(g.remaining).toBe(DEFAULT_DAILY_GOAL);
  });

  it('halber Weg: Fortschritt 0.5', () => {
    expect(dailyGoal(150, 300).progress).toBeCloseTo(0.5);
  });

  it('erreicht und uebererfuellt: done, Fortschritt bei 1 gedeckelt', () => {
    expect(dailyGoal(300, 300)).toMatchObject({ done: true, progress: 1, remaining: 0 });
    const over = dailyGoal(900, 300);
    expect(over.done).toBe(true);
    expect(over.progress).toBe(1);
    expect(over.remaining).toBe(0);
    expect(over.earned).toBe(900); // die echte Zahl bleibt sichtbar
  });

  it('robuste Eingaben: negative XP und Ziel 0 stuerzen nicht ab', () => {
    expect(dailyGoal(-50).earned).toBe(0);
    expect(dailyGoal(10, 0).target).toBe(1);
    expect(dailyGoal(10, 0).done).toBe(true);
  });
});

describe('Truhen', () => {
  it('alle CHEST_EVERY Aufgaben eine Truhe', () => {
    expect(chestsEarned(0)).toBe(0);
    expect(chestsEarned(CHEST_EVERY - 1)).toBe(0);
    expect(chestsEarned(CHEST_EVERY)).toBe(1);
    expect(chestsEarned(CHEST_EVERY * 3 + 2)).toBe(3);
    expect(chestsEarned(-5)).toBe(0);
  });

  it('Inhalt ist deterministisch pro Truhen-Nummer', () => {
    expect(openChest(7)).toEqual(openChest(7));
  });

  it('Inhalt variiert ueber Truhen hinweg und bleibt in der Spanne', () => {
    const rewards = Array.from({ length: 60 }, (_, i) => openChest(i));
    const rarities = new Set(rewards.map((r) => r.rarity));
    expect(rarities.size).toBeGreaterThan(1);
    for (const r of rewards) {
      expect([80, 200, 500]).toContain(r.xp);
      expect(['common', 'rare', 'epic']).toContain(r.rarity);
    }
    // Common muss der Normalfall bleiben, sonst nutzt sich die Ueberraschung ab
    const commons = rewards.filter((r) => r.rarity === 'common').length;
    expect(commons).toBeGreaterThan(rewards.length / 2);
  });
});

describe('Einsatz — wie laut darf das Tagesziel sein?', () => {
  it('erfuelltes Ziel ist immer ruhig, egal wie lang die Serie', () => {
    for (const streak of [0, 3, 7, 40]) {
      expect(stakeLevel(streak, true), `Serie ${streak}`).toBe('calm');
    }
  });

  /**
   * Die Schwelle ist der ganze Punkt: erst ab einer Woche fuehlt sich eine
   * Serie wie Besitz an. Darunter gibt es nichts zu schuetzen, und ein Alarm
   * am zweiten Tag waere nur Laerm.
   */
  it('unter der Schwelle bleibt es ein Hinweis, darueber wird es dringend', () => {
    expect(stakeLevel(0, false)).toBe('notice');
    expect(stakeLevel(STAKE_STREAK_THRESHOLD - 1, false)).toBe('notice');
    expect(stakeLevel(STAKE_STREAK_THRESHOLD, false)).toBe('urgent');
    expect(stakeLevel(30, false)).toBe('urgent');
  });

  it('ein Freeze-Token federt den Tag ab und nimmt die Dringlichkeit heraus', () => {
    expect(stakeLevel(20, false, 1)).toBe('notice');
    expect(stakeLevel(20, false, 0)).toBe('urgent');
  });

  it('negative Serien (kaputter Save) erzeugen keinen Alarm', () => {
    expect(stakeLevel(-5, false)).toBe('notice');
  });
});
