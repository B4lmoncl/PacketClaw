import { describe, expect, it } from 'vitest';
import { comboMultiplier, modeBaseScore, scoreVerdictAnswer, starsFor } from '../scoring';

describe('comboMultiplier', () => {
  it('startet bei ×1,0 und steigt um 0,1 pro Serie', () => {
    expect(comboMultiplier(1)).toBe(1.0);
    expect(comboMultiplier(2)).toBe(1.1);
    expect(comboMultiplier(11)).toBe(2.0);
  });

  it('Cap bei ×3,0', () => {
    expect(comboMultiplier(21)).toBe(3.0);
    expect(comboMultiplier(99)).toBe(3.0);
  });

  it('0 oder negativ → ×1,0', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(-5)).toBe(1);
  });
});

describe('scoreVerdictAnswer', () => {
  it('falsche Antwort → 0 Punkte', () => {
    expect(scoreVerdictAnswer({ correct: false, streakBefore: 5 }).points).toBe(0);
  });

  it('richtige Antwort: 100 × Multiplikator', () => {
    expect(scoreVerdictAnswer({ correct: true, streakBefore: 0 }).points).toBe(100);
    expect(scoreVerdictAnswer({ correct: true, streakBefore: 1 }).points).toBe(110);
  });

  it('Zeitbonus bei Timer-Leveln: bis +50 % der Basis', () => {
    const full = scoreVerdictAnswer({
      correct: true,
      streakBefore: 0,
      secondsLeft: 30,
      timerSeconds: 30,
    });
    expect(full.timeBonus).toBe(50);
    expect(full.points).toBe(150);

    const none = scoreVerdictAnswer({
      correct: true,
      streakBefore: 0,
      secondsLeft: 0,
      timerSeconds: 30,
    });
    expect(none.timeBonus).toBe(0);
  });
});

describe('starsFor', () => {
  it('nicht gelöst → 0', () => {
    expect(starsFor({ solved: false, wrongAttempts: 0 })).toBe(0);
  });
  it('gelöst mit Fehlversuch → 1', () => {
    expect(starsFor({ solved: true, wrongAttempts: 2 })).toBe(1);
  });
  it('ohne Fehlversuch → 2', () => {
    expect(starsFor({ solved: true, wrongAttempts: 0 })).toBe(2);
  });
  it('ohne Fehlversuch + Modus-Kriterium → 3', () => {
    expect(starsFor({ solved: true, wrongAttempts: 0, underTargetTime: true })).toBe(3);
    expect(starsFor({ solved: true, wrongAttempts: 0, minimalRuleset: true })).toBe(3);
    expect(starsFor({ solved: true, wrongAttempts: 0, underTargetTime: false })).toBe(2);
  });
});

describe('modeBaseScore', () => {
  it('250–500 nach Schwierigkeit', () => {
    expect(modeBaseScore(1)).toBe(250);
    expect(modeBaseScore(2)).toBe(375);
    expect(modeBaseScore(3)).toBe(500);
  });
});
