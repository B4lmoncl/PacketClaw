/**
 * Was ein Modus zahlt — an EINER Stelle, mit einer Regel.
 *
 * DIE REGEL: Ein sauberer Durchgang sichert das Tagesziel.
 *
 * Warum das nicht verhandelbar ist: die Serie zählt in JEDEM Modus, sobald das
 * Tagesziel erreicht ist (siehe store.streakForGoal). Zahlt ein Modus deutlich
 * weniger als 300, ist dieses Versprechen nur auf dem Papier eingelöst — man
 * müsste vier Config-Doctor-Fälle lösen, um einen Tag zu sichern, während eine
 * Minute Blitz reicht.
 *
 * Genau so war es: Blitz ~340, Change Request 440, aber Doctor 80, DNAT 90,
 * Routing 100, Review 190, Tote Regel 260. Die Modi, die am meisten VERLANGEN
 * und am meisten LEHREN, zählten am wenigsten — das ist der Anreiz genau
 * verkehrt herum, und es widerspricht der Direktive.
 *
 * Fehler kosten weiterhin, aber nie unter den Sockel: wer eine Aufgabe am Ende
 * löst, hat etwas verstanden, und das soll sich nicht wie eine Strafe anfühlen.
 */
import { DEFAULT_DAILY_GOAL } from './rewards';

/** Was ein sauberer Durchgang bringt — knapp über dem Tagesziel. */
export const CLEAN_RUN_XP = 340;

/** Untergrenze: auch ein mühsamer Sieg bleibt ein Sieg. */
export const FLOOR_XP = 120;

function degrade(penalty: number): number {
  return Math.max(FLOOR_XP, CLEAN_RUN_XP - Math.max(0, penalty));
}

/**
 * Config Doctor: ein Fall, ein Fehler. Zusätzliche Eingriffe und Fehlversuche
 * kosten — der erste Eingriff ist der Fix selbst und deshalb frei.
 */
export function doctorPayout(edits: number, tries: number): number {
  return degrade(Math.max(0, edits - 1) * 40 + tries * 30);
}

/** DNAT/VIP-Werkstatt: jeder Fehlversuch kostet spürbar. */
export function dnatPayout(tries: number): number {
  return degrade(tries * 45);
}

/** Routing-Werkstatt: dito. */
export function routingPayout(tries: number): number {
  return degrade(tries * 45);
}

/** Management-Zugriff: dito, gezählt in Prüfläufen. */
export function mgmtPayout(attempts: number): number {
  return degrade(Math.max(0, attempts - 1) * 45);
}

/**
 * Sitzungs-Modi mit fester Rundenzahl (Review, Tote Regel): ein Sockel plus
 * Anteil je richtiger Runde, so dass ein perfekter Durchgang das Ziel reißt.
 */
export function sessionPayout(correct: number, total: number): number {
  const safeTotal = Math.max(1, total);
  // Der Sockel ist derselbe wie überall: wer die Sitzung durchgezogen hat, hat
  // fünf Erklärungen gelesen — auch ohne einen einzigen Treffer.
  const perRound = (CLEAN_RUN_XP - FLOOR_XP) / safeTotal;
  return Math.round(FLOOR_XP + Math.min(Math.max(0, correct), safeTotal) * perRound);
}

/**
 * Change Request ist der längste Auftrag im Spiel und darf mehr zahlen — aber
 * nicht beliebig viel mehr, sonst wird er zur Abkürzung um alles andere herum.
 */
export function designPayout(stars: number, clean: boolean): number {
  return Math.round(CLEAN_RUN_XP * 1.2) + stars * 40 + (clean ? 60 : 0);
}

/** Zahlt dieser Betrag das Tagesziel? Für die Zusicherung in den Tests. */
export function securesDay(xp: number): boolean {
  return xp >= DEFAULT_DAILY_GOAL;
}
