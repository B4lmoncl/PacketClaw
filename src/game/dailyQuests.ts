/**
 * Tagesaufträge — drei kleine Aufgaben pro Tag.
 *
 * Aus der Retention-Recherche: Tagesaufträge sind der stärkste Einzelhebel
 * fürs tägliche Spielen, ABER nur wenn sie in einer Sitzung schaffbar sind.
 * Deshalb sind alle Ziele klein (1–3 Einheiten), und es sind bewusst genau
 * drei — nicht sieben, aus denen man dann zwei macht und sich schlecht fühlt.
 *
 * Drei Entwurfsentscheidungen, die hier wichtig sind:
 *
 *  1. NUR FREIGESCHALTETE MODI. Ein Auftrag „repariere ein Regelwerk", wenn
 *     der Config Doctor noch zu ist, wäre eine Sackgasse. Die Auswahl filtert
 *     deshalb nach den offenen Modi.
 *  2. EINMAL GEZOGEN, DANN STABIL. Die gewählten Aufträge landen im Save.
 *     Sonst würden sie sich mitten am Tag ändern, wenn man einen Modus
 *     freischaltet — und der Fortschritt wäre weg.
 *  3. NUR KUMULATIVE ZÄHLER. Fortschritt = aktueller Stand minus Stand bei
 *     Tagesbeginn. Das funktioniert nur bei Zählern, die monoton steigen;
 *     Maxima wie „bester Combo" lassen sich so nicht messen und sind hier
 *     bewusst nicht im Pool.
 */
import { createRng } from '../engine';

/** Kumulative Zähler, aus denen sich Auftrags-Fortschritt ableiten lässt. */
export interface QuestCounters {
  tasksSolved: number;
  starsTotal: number;
  reviewsDone: number;
  implicitDenyCorrect: number;
  doctorSolved: number;
  routingSolved: number;
  designSolved: number;
  dnatSolved: number;
  dailiesPlayed: number;
}

export type QuestMetric = keyof QuestCounters;

export interface QuestTemplate {
  id: string;
  metric: QuestMetric;
  /** wie viel an diesem Tag dazukommen muss */
  target: number;
  xp: number;
  /** Modus, der offen sein muss — undefined = immer verfügbar */
  requiresMode?: string;
}

/**
 * Der Pool. Ziele absichtlich niedrig: ein Auftrag soll ein Grund sein,
 * einmal reinzuschauen, keine Zweitbeschäftigung.
 */
export const QUEST_POOL: QuestTemplate[] = [
  { id: 'tasks3', metric: 'tasksSolved', target: 3, xp: 120 },
  { id: 'tasks6', metric: 'tasksSolved', target: 6, xp: 220 },
  { id: 'stars3', metric: 'starsTotal', target: 3, xp: 140 },
  { id: 'deny3', metric: 'implicitDenyCorrect', target: 3, xp: 150 },
  { id: 'daily1', metric: 'dailiesPlayed', target: 1, xp: 160 },
  { id: 'doctor1', metric: 'doctorSolved', target: 1, xp: 180, requiresMode: 'doctor' },
  { id: 'doctor2', metric: 'doctorSolved', target: 2, xp: 300, requiresMode: 'doctor' },
  { id: 'routing1', metric: 'routingSolved', target: 1, xp: 200, requiresMode: 'routing' },
  { id: 'design1', metric: 'designSolved', target: 1, xp: 240, requiresMode: 'design' },
  { id: 'dnat1', metric: 'dnatSolved', target: 1, xp: 240, requiresMode: 'dnat' },
  // Der lernwirksamste Auftrag: gezielt an den eigenen Schwaechen ueben
  { id: 'review1', metric: 'reviewsDone', target: 1, xp: 220, requiresMode: 'review' },
];

export const QUESTS_PER_DAY = 3;

/** Bonus, wenn alle drei an einem Tag erfüllt sind. */
export const ALL_DONE_BONUS_XP = 250;

/**
 * Zieht die Aufträge für einen Tag: deterministisch aus dem Datum, aber nur
 * aus dem, was der Spieler auch erreichen kann.
 */
export function pickQuests(date: string, unlockedModes: readonly string[]): QuestTemplate[] {
  const available = QUEST_POOL.filter(
    (q) => q.requiresMode === undefined || unlockedModes.includes(q.requiresMode),
  );
  const rng = createRng(`aethergate-quests-${date}`);
  const pool = [...available];
  const picked: QuestTemplate[] = [];
  // Kein Metrik-Doppel: zwei „löse N Aufgaben" an einem Tag wirken kaputt
  const usedMetrics = new Set<QuestMetric>();
  while (picked.length < QUESTS_PER_DAY && pool.length > 0) {
    const index = Math.floor(rng.next() * pool.length);
    const [candidate] = pool.splice(index, 1);
    if (!candidate) continue;
    if (usedMetrics.has(candidate.metric)) continue;
    usedMetrics.add(candidate.metric);
    picked.push(candidate);
  }
  return picked;
}

export interface QuestProgress {
  quest: QuestTemplate;
  have: number;
  target: number;
  done: boolean;
  /** 0..1 */
  ratio: number;
  claimed: boolean;
}

/**
 * Fortschritt aller Tagesaufträge. `snapshot` ist der Zählerstand bei
 * Tagesbeginn; alles darüber ist heute passiert.
 */
export function questProgress(
  quests: readonly QuestTemplate[],
  snapshot: QuestCounters,
  now: QuestCounters,
  claimed: readonly string[],
): QuestProgress[] {
  return quests.map((quest) => {
    const gained = Math.max(0, (now[quest.metric] ?? 0) - (snapshot[quest.metric] ?? 0));
    const have = Math.min(gained, quest.target);
    return {
      quest,
      have,
      target: quest.target,
      done: gained >= quest.target,
      ratio: quest.target > 0 ? Math.min(1, gained / quest.target) : 1,
      claimed: claimed.includes(quest.id),
    };
  });
}

/** true, wenn alle Aufträge des Tages erfüllt sind. */
export function allQuestsDone(progress: readonly QuestProgress[]): boolean {
  return progress.length > 0 && progress.every((p) => p.done);
}

/** Noch nicht eingelöste, aber erfüllte Aufträge — die warten auf Abholung. */
export function claimableQuests(progress: readonly QuestProgress[]): QuestProgress[] {
  return progress.filter((p) => p.done && !p.claimed);
}

// ---------------------------------------------------------------------------
// Wochenmeilenstein
// ---------------------------------------------------------------------------

/**
 * Sieben Tage mit steigender Belohnung. Laut Recherche der Punkt, an dem ein
 * Streak-System messbar auf die tägliche Rückkehr wirkt — der siebte Tag muss
 * sich deutlich anders anfühlen als der zweite.
 */
export const WEEK_REWARDS = [60, 90, 130, 180, 240, 320, 500] as const;

export interface WeekMilestone {
  /** Tag im Zyklus, 1..7 */
  day: number;
  reward: number;
  /** Belohnung des siebten Tages, als Ausblick */
  finalReward: number;
  isFinal: boolean;
}

export function weekMilestone(streakDays: number): WeekMilestone {
  const safe = Math.max(0, streakDays);
  // Tag 0 (noch keine Serie) zeigt Tag 1 als Nächstes
  const day = safe === 0 ? 1 : ((safe - 1) % 7) + 1;
  return {
    day,
    reward: WEEK_REWARDS[day - 1] ?? WEEK_REWARDS[0],
    finalReward: WEEK_REWARDS[6],
    isFinal: day === 7,
  };
}
