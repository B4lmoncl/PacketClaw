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
import { comboMultiplier } from './scoring';

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

/**
 * Stufen-BENENNUNG über der echten Kurve. Der Multiplikator selbst kommt
 * IMMER aus scoring.comboMultiplier — es darf nur eine Wahrheit geben, sonst
 * zeigt die Anzeige einen anderen Wert als die Punkte, die vergeben werden.
 * (Genau dieser Fehler war hier drin: eigene Stufenwerte ×1,25/×1,5/×2,0
 * gegen die tatsächliche Kurve ×1,0 +0,1 je Treffer bis ×3,0.)
 */
function tierLevel(streak: number): { level: ComboLevel; key: string } {
  if (streak >= 12) return { level: 4, key: 'perfect' };
  if (streak >= 8) return { level: 3, key: 'blaze' };
  if (streak >= 5) return { level: 2, key: 'hot' };
  if (streak >= 3) return { level: 1, key: 'warm' };
  return { level: 0, key: '' };
}

/** Ab 3 richtigen in Folge eskaliert das Feedback. */
export function comboTier(streak: number): ComboTier {
  const { level, key } = tierLevel(streak);
  return { level, key, multiplier: comboMultiplier(streak) };
}

/** Score einer Aufgabe inklusive Combo-Bonus (immer ganzzahlig). */
export function applyCombo(baseScore: number, streak: number): number {
  return Math.round(baseScore * comboMultiplier(streak));
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

/**
 * Wieviel steht heute auf dem Spiel?
 *
 * Der stärkste Hebel fürs tägliche Wiederkommen ist nicht die Belohnung,
 * sondern das, was man verlieren kann — deshalb darf eine lange Serie mit
 * offenem Tagesziel nicht genauso leise dastehen wie Tag null. Das Tagesziel
 * eskaliert also seine SICHTBARKEIT mit dem Einsatz.
 *
 * Was NICHT eskaliert, ist die Sprache. Kein Countdown, keine Drohung, kein
 * „schnell noch!" — die Karte stellt fest, was der Stand ist („Zwölf Tage.
 * Heute ist noch keiner davon."). Das trifft härter als eine Warnung und
 * bleibt bei der Tonlage des Spiels.
 *
 * Die Schwelle liegt bei sieben Tagen: ab einer ganzen Woche fühlt sich eine
 * Serie wie Besitz an, und Besitz verliert man nicht gern. Darunter ist noch
 * nichts aufgebaut, das man schützen müsste.
 */
export const STAKE_STREAK_THRESHOLD = 7;

export type StakeLevel = 'calm' | 'notice' | 'urgent';

export function stakeLevel(streak: number, goalDone: boolean, freezeTokens = 0): StakeLevel {
  // Geschafft: es steht nichts mehr aus, also auch nichts mehr im Weg
  if (goalDone) return 'calm';
  // Ein Freeze-Token federt den Tag ab — dann ist es eine Notiz, kein Alarm
  if (streak >= STAKE_STREAK_THRESHOLD && freezeTokens === 0) return 'urgent';
  return 'notice';
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
