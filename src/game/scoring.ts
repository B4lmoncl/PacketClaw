/**
 * Scoring: Verdict = 100 Basis × Combo-Multiplikator (+ Zeitbonus bei Timer-Leveln).
 * Combo: ×1,0 steigend um 0,1 je richtiger Antwort in Folge, Cap ×3,0; Fehler = Reset.
 */

export const VERDICT_BASE_SCORE = 100;
export const COMBO_STEP = 0.1;
export const COMBO_MAX = 3.0;

/** Multiplikator für die n-te richtige Antwort in Folge (streak >= 1) */
export function comboMultiplier(streak: number): number {
  if (streak <= 0) return 1;
  return Math.min(COMBO_MAX, 1 + (streak - 1) * COMBO_STEP);
}

export interface VerdictAnswerScore {
  points: number;
  multiplier: number;
  timeBonus: number;
}

export function scoreVerdictAnswer(params: {
  correct: boolean;
  streakBefore: number;
  /** verbleibende Sekunden bei Timer-Leveln, sonst undefined */
  secondsLeft?: number;
  timerSeconds?: number;
}): VerdictAnswerScore {
  if (!params.correct) return { points: 0, multiplier: 1, timeBonus: 0 };
  const streak = params.streakBefore + 1;
  const multiplier = comboMultiplier(streak);
  let timeBonus = 0;
  if (params.timerSeconds && params.secondsLeft !== undefined) {
    // bis zu +50 % der Basis, linear nach Restzeit
    timeBonus = Math.round((VERDICT_BASE_SCORE / 2) * (params.secondsLeft / params.timerSeconds));
  }
  return {
    points: Math.round(VERDICT_BASE_SCORE * multiplier) + timeBonus,
    multiplier,
    timeBonus,
  };
}

/** Basis-Score für Architect/Audit/Incident nach Schwierigkeitsmetadatum */
export function modeBaseScore(difficulty: 1 | 2 | 3): number {
  return { 1: 250, 2: 375, 3: 500 }[difficulty];
}

export interface StarParams {
  solved: boolean;
  wrongAttempts: number;
  /** Verdict: alle Pakete unter Zielzeit beantwortet */
  underTargetTime?: boolean;
  /** Architect: ≤ Referenz-Regelanzahl und ohne all/ALL, wo Objekte reichen */
  minimalRuleset?: boolean;
  /** Audit/Incident: Eingriffe ≤ Level-Metadatum */
  minimalEdits?: boolean;
}

/** 1 = gelöst · 2 = ohne Fehlversuch · 3 = zusätzlich Modus-Kriterium erfüllt */
export function starsFor(params: StarParams): 0 | 1 | 2 | 3 {
  if (!params.solved) return 0;
  if (params.wrongAttempts > 0) return 1;
  const third = params.underTargetTime ?? params.minimalRuleset ?? params.minimalEdits ?? false;
  return third ? 3 : 2;
}
