/**
 * Belohnungs-Loop. Drei Mechaniken, alle aus der Recherche abgeleitet:
 *
 *  1. COMBO — Feedback PRO AUFGABE statt erst am Modus-Ende („Juice it or
 *     lose it": abundant feedback pro Aktion). Die Serie richtiger Antworten
 *     hebt einen echten Multiplikator, nicht nur eine Animation: wer sauber
 *     durchzieht, bekommt spürbar mehr XP.
 *  2. TAGESZIEL — kleiner, erreichbarer Tagesbetrag statt eines fernen
 *     Fernziels. Der Ring füllt sich sichtbar (Duolingo-Prinzip: das Ziel
 *     muss heute schaffbar sein).
 *  3. TRUHEN — variable Belohnung. Feste Beträge stumpfen ab, deshalb ist der
 *     Inhalt unterschiedlich. Aber: deterministisch aus dem Seed, also kein
 *     Math.random, reproduzierbar und testbar. Und die Spanne ist eng genug,
 *     dass niemand „nachwürfeln" will — Überraschung, kein Glücksspiel.
 *
 * Bewusst NICHT gebaut: Verlust-Druck (Streak-Angst), künstliche Wartezeiten,
 * Ranglisten gegen Fremde. Das Spiel soll ziehen, weil man besser wird.
 */
import { createRng } from '../engine';

// ---------------------------------------------------------------------------
// Combo
// ---------------------------------------------------------------------------

export type ComboLevel = 0 | 1 | 2 | 3 | 4;

export interface ComboTier {
  level: ComboLevel;
  /** Multiplikator auf den Aufgaben-Score */
  multiplier: number;
  /** i18n-Suffix: combo.label.<key> — leer bei level 0 */
  key: string;
}

const TIERS: ComboTier[] = [
  { level: 0, multiplier: 1, key: '' },
  { level: 1, multiplier: 1.25, key: 'warm' },
  { level: 2, multiplier: 1.5, key: 'hot' },
  { level: 3, multiplier: 1.75, key: 'blaze' },
  { level: 4, multiplier: 2, key: 'perfect' },
];

/** Ab 3 richtigen in Folge eskaliert das Feedback, ab 12 ist Maximum. */
export function comboTier(streak: number): ComboTier {
  if (streak >= 12) return TIERS[4] as ComboTier;
  if (streak >= 8) return TIERS[3] as ComboTier;
  if (streak >= 5) return TIERS[2] as ComboTier;
  if (streak >= 3) return TIERS[1] as ComboTier;
  return TIERS[0] as ComboTier;
}

/** Score einer Aufgabe inklusive Combo-Bonus (immer ganzzahlig). */
export function applyCombo(baseScore: number, streak: number): number {
  return Math.round(baseScore * comboTier(streak).multiplier);
}

// ---------------------------------------------------------------------------
// Tagesziel
// ---------------------------------------------------------------------------

/** Klein genug für einen Kaffee, groß genug dass es zählt: ~2 Aufgaben. */
export const DEFAULT_DAILY_GOAL = 300;

export interface DailyGoal {
  target: number;
  earned: number;
  done: boolean;
  /** 0..1 für den Ring */
  progress: number;
  /** wie viel heute noch fehlt */
  remaining: number;
}

export function dailyGoal(xpToday: number, target = DEFAULT_DAILY_GOAL): DailyGoal {
  const safeTarget = Math.max(1, target);
  const earned = Math.max(0, xpToday);
  return {
    target: safeTarget,
    earned,
    done: earned >= safeTarget,
    progress: Math.min(1, earned / safeTarget),
    remaining: Math.max(0, safeTarget - earned),
  };
}

// ---------------------------------------------------------------------------
// Truhen
// ---------------------------------------------------------------------------

/** Alle so viele gelösten Aufgaben gibt es eine Truhe. */
export const CHEST_EVERY = 5;

export type ChestRarity = 'common' | 'rare' | 'epic';

export interface ChestReward {
  xp: number;
  rarity: ChestRarity;
}

/** Wie viele Truhen bei diesem Aufgabenstand insgesamt verdient wurden. */
export function chestsEarned(tasksSolved: number): number {
  return Math.floor(Math.max(0, tasksSolved) / CHEST_EVERY);
}

/**
 * Inhalt einer Truhe — variabel, aber deterministisch aus der Truhen-Nummer.
 * Verteilung: 70 % common, 25 % rare, 5 % epic.
 */
export function openChest(chestNumber: number): ChestReward {
  const rng = createRng(`aethergate-chest-${chestNumber}`);
  const roll = rng.next();
  if (roll < 0.05) return { xp: 500, rarity: 'epic' };
  if (roll < 0.3) return { xp: 200, rarity: 'rare' };
  return { xp: 80, rarity: 'common' };
}
