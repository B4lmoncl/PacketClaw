import { describe, expect, it } from 'vitest';
import {
  applyCombo,
  CHEST_EVERY,
  chestsEarned,
  comboTier,
  dailyGoal,
  DEFAULT_DAILY_GOAL,
  openChest,
} from '../rewards';

describe('Combo', () => {
  it('unter 3 richtigen gibt es keinen Bonus', () => {
    for (const streak of [0, 1, 2]) {
      expect(comboTier(streak).level).toBe(0);
      expect(comboTier(streak).multiplier).toBe(1);
    }
  });

  it('eskaliert in Stufen und deckelt bei 2x', () => {
    expect(comboTier(3).multiplier).toBe(1.25);
    expect(comboTier(5).multiplier).toBe(1.5);
    expect(comboTier(8).multiplier).toBe(1.75);
    expect(comboTier(12).multiplier).toBe(2);
    expect(comboTier(999).multiplier).toBe(2);
  });

  it('Stufen steigen monoton — nie ein Rueckschritt bei laengerer Serie', () => {
    let last = 0;
    for (let s = 0; s <= 30; s++) {
      const m = comboTier(s).multiplier;
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });

  it('applyCombo rechnet ganzzahlig', () => {
    expect(applyCombo(100, 0)).toBe(100);
    expect(applyCombo(100, 3)).toBe(125);
    expect(applyCombo(90, 5)).toBe(135);
    expect(applyCombo(101, 8)).toBe(177); // 176.75 gerundet
    expect(Number.isInteger(applyCombo(77, 12))).toBe(true);
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
