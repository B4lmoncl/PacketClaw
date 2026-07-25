/**
 * Kampagnen-Fortschritt für die „Weiterspielen"-Aktion im Hauptmenü.
 *
 * Der Spieler soll nicht jedes Mal über Kapitel → Level navigieren müssen:
 * das Hauptmenü springt direkt in das nächste offene Level. Weil die Level
 * sequenziell freigeschaltet werden (isLevelUnlocked: Vorgänger braucht
 * ≥1 Stern), ist „das erste Level in Reihenfolge ohne Stern" genau die
 * Freischalt-Grenze — deshalb braucht diese Datei den Store nicht und bleibt
 * pure (Level-Liste injizierbar, damit Tests ohne Content-Glob laufen).
 */
import { allLevels } from './levels';
import type { Level } from './levels';

/** Ein Level gilt als geschafft, sobald es mindestens einen Stern hat. */
const isDone = (level: Level, stars: Record<string, number>): boolean =>
  (stars[level.id] ?? 0) >= 1;

export interface CampaignProgress {
  /** nächstes offenes Level — undefined, wenn die Kampagne durch ist */
  next: Level | undefined;
  /** geschaffte Level */
  completed: number;
  total: number;
  /** gesammelte Sterne von maximal 3 pro Level */
  starsEarned: number;
  maxStars: number;
}

/** Das nächste offene Level in Kapitel-/Index-Reihenfolge. */
export function nextLevel(
  stars: Record<string, number>,
  levels: readonly Level[] = allLevels,
): Level | undefined {
  return levels.find((level) => !isDone(level, stars));
}

export function campaignProgress(
  stars: Record<string, number>,
  levels: readonly Level[] = allLevels,
): CampaignProgress {
  let completed = 0;
  let starsEarned = 0;
  for (const level of levels) {
    if (isDone(level, stars)) completed++;
    // Fremde/verwaiste Level-IDs im Save zählen nicht mit
    starsEarned += Math.min(3, Math.max(0, stars[level.id] ?? 0));
  }
  return {
    next: nextLevel(stars, levels),
    completed,
    total: levels.length,
    starsEarned,
    maxStars: levels.length * 3,
  };
}
