/**
 * Freischaltungen: Modi erscheinen nach und nach, statt alle auf einmal.
 *
 * Zwei Gründe, und beide sind ernst gemeint:
 *   1. Das Hauptmenü war überladen. Weniger sichtbare Modi = klarere Wahl.
 *   2. Ein gesperrter Modus MIT sichtbarer Bedingung erzeugt Vorfreude
 *      („noch 4 Level"). Deshalb werden gesperrte Modi NICHT versteckt —
 *      man soll sehen, was kommt, und wie nah man dran ist.
 *
 * Die Bedingungen folgen dem Lehrplan: die Routing-Werkstatt öffnet sich,
 * wenn die Kampagne Interfaces/Zonen/Routing behandelt hat (Kapitel 4), der
 * DNAT-Workshop im VIP-Kapitel (7). Wer nur Casual-Modi spielt, kommt über
 * die XP-Alternative trotzdem weiter — niemand sitzt fest.
 */

export interface UnlockRule {
  /** Modus-Schlüssel wie in HomeScreen/Screen-Namen */
  key: string;
  /** Ab so vielen geschafften Kampagnen-Leveln offen */
  levels: number;
  /** …ODER ab so viel XP (für Spieler, die lieber Casual-Modi spielen) */
  xp: number;
  /** Kapitel, dessen Stoff den Modus trägt (nur zur Anzeige/Begründung) */
  chapter?: number;
}

/**
 * Reihenfolge = Freischalt-Reihenfolge. 8 Kapitel à 10 Level, die Level-
 * Schwellen entsprechen also „Kapitel N geschafft" = N*10.
 */
export const UNLOCKS: UnlockRule[] = [
  { key: 'blitz', levels: 3, xp: 400 },
  { key: 'matchcheck', levels: 6, xp: 800 },
  { key: 'endless', levels: 10, xp: 1400, chapter: 1 },
  // Erst ab hier gibt es genug Antworten, damit Mastery etwas aussagt
  { key: 'review', levels: 14, xp: 1800 },
  { key: 'doctor', levels: 20, xp: 2600, chapter: 2 },
  { key: 'challenge', levels: 30, xp: 4200, chapter: 3 },
  { key: 'routing', levels: 40, xp: 6000, chapter: 4 },
  { key: 'design', levels: 55, xp: 9000, chapter: 6 },
  { key: 'dnat', levels: 65, xp: 12000, chapter: 7 },
];

/** Modi ohne Bedingung — von Anfang an spielbar. */
export const ALWAYS_OPEN = ['daily', 'sandbox'];

export interface UnlockState {
  key: string;
  unlocked: boolean;
  /** Noch fehlende Level (0, wenn offen oder wenn die XP-Schwelle greift) */
  levelsToGo: number;
  /** Noch fehlende XP */
  xpToGo: number;
  rule: UnlockRule;
}

export function isUnlocked(key: string, levelsDone: number, xp: number): boolean {
  if (ALWAYS_OPEN.includes(key)) return true;
  const rule = UNLOCKS.find((u) => u.key === key);
  if (!rule) return true; // unbekannte Modi nie aussperren
  return levelsDone >= rule.levels || xp >= rule.xp;
}

/** Zustand aller regelbehafteten Modi, in Freischalt-Reihenfolge. */
export function unlockStates(levelsDone: number, xp: number): UnlockState[] {
  return UNLOCKS.map((rule) => {
    const unlocked = levelsDone >= rule.levels || xp >= rule.xp;
    return {
      key: rule.key,
      unlocked,
      levelsToGo: unlocked ? 0 : Math.max(0, rule.levels - levelsDone),
      xpToGo: unlocked ? 0 : Math.max(0, rule.xp - xp),
      rule,
    };
  });
}

/** Zustand eines einzelnen Modus (für die gesperrte Kachel). */
export function unlockStateFor(
  key: string,
  levelsDone: number,
  xp: number,
): UnlockState | undefined {
  return unlockStates(levelsDone, xp).find((u) => u.key === key);
}

/**
 * Die nächste Freischaltung — der konkrete Grund, noch ein Level zu spielen.
 * undefined, wenn alles offen ist.
 */
export function nextUnlock(levelsDone: number, xp: number): UnlockState | undefined {
  return unlockStates(levelsDone, xp).find((u) => !u.unlocked);
}

/** Alle offenen Modi, die der Spieler noch nicht als „neu" gesehen hat. */
export function freshUnlocks(levelsDone: number, xp: number, seen: readonly string[]): string[] {
  return unlockStates(levelsDone, xp)
    .filter((u) => u.unlocked && !seen.includes(u.key))
    .map((u) => u.key);
}
