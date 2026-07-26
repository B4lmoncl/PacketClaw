/**
 * Zentraler Spielzustand (Zustand + persist).
 * Persistiert wird nur der Savegame-Anteil (versioniert, migrierbar) —
 * Navigation und Laufzeit-Zustand bleiben flüchtig.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayString } from './daily';
import { DEFAULT_DAILY_GOAL } from './rewards';
import { pickQuests } from './dailyQuests';
import type { QuestCounters } from './dailyQuests';
import { chestsEarned, openChest } from './rewards';
import { getLevel, levelsForChapter } from './levels';
import {
  advanceStreak,
  EMPTY_STATS,
  EMPTY_STREAK,
  evaluateAchievements,
  type Stats,
  type StreakState,
} from './progression';

export const SAVE_VERSION = 1;

export interface Settings {
  sound: boolean;
  /** 'system' folgt prefers-reduced-motion; 'reduced' erzwingt die statische Ansicht */
  motion: 'system' | 'reduced';
  scanlines: boolean;
  locale: 'de' | 'en';
}

export type Screen =
  | { name: 'home' }
  | { name: 'chapter'; chapter: number }
  | { name: 'level'; levelId: string }
  | { name: 'daily' }
  | { name: 'endless' }
  | { name: 'blitz' }
  | { name: 'matchcheck' }
  | { name: 'doctor' }
  | { name: 'dnat' }
  | { name: 'design' }
  | { name: 'routing' }
  | { name: 'challenge' }
  | { name: 'sandbox' }
  | { name: 'profile' }
  | { name: 'settings' };

/** Bestwert im Endlos-Modus (überstandene Runden + Score). */
export interface EndlessBest {
  rounds: number;
  score: number;
}

interface GameState {
  // --- persistiert (Savegame) ---
  saveVersion: number;
  xp: number;
  stars: Record<string, number>;
  bestScores: Record<string, number>;
  /** Daily-Historie: Datum → Ergebnis pro Paket */
  dailyHistory: Record<string, boolean[]>;
  endlessBest: EndlessBest;
  /** Bester Blitz-Score (60-Sekunden-Runde) */
  blitzBest: number;
  /** Bester Match-Check-Score (45-Sekunden-Runde) */
  matchBest: number;
  /** Gelöste Config-Doctor-Fälle */
  doctorSolved: number;
  /** Gelöste DNAT/VIP-Workshops */
  dnatSolved: number;
  /** Angenommene Change Requests (Regelwerk nach Vorgaben) */
  designSolved: number;
  /** Reparierte Routing-Faelle */
  routingSolved: number;
  /** XP von heute (fuer das Tagesziel) — Datum + Betrag */
  dailyXp: { date: string; xp: number };
  /** Insgesamt geloeste Einzelaufgaben (Truhen-Zaehler) */
  tasksSolved: number;
  /** Bereits geoeffnete Truhen */
  chestsOpened: number;
  /** Freischaltungen, die der Spieler schon gefeiert bekommen hat */
  seenUnlocks: string[];
  /**
   * Tagesauftraege. Einmal pro Tag gezogen und dann STABIL — sonst wuerden
   * sie sich mitten am Tag aendern, wenn ein Modus freigeschaltet wird.
   * snapshot = Zaehlerstand bei Tagesbeginn, alles darueber ist von heute.
   */
  questDay: {
    date: string;
    ids: string[];
    snapshot: QuestCounters;
    claimed: string[];
  };
  stats: Stats;
  achievements: string[];
  streak: StreakState;
  onboarded: boolean;
  settings: Settings;
  // --- flüchtig ---
  screen: Screen;
  combo: number; // aktuelle Serie richtiger Antworten (über Level hinweg)

  /** zuletzt freigeschaltete Achievements (für Toasts, flüchtig) */
  lastUnlocked: string[];

  navigate(screen: Screen): void;
  recordLevelResult(levelId: string, stars: number, score: number): void;
  recordDaily(date: string, results: boolean[], score: number): void;
  recordEndless(rounds: number, score: number): void;
  recordBlitz(score: number): void;
  recordMatchCheck(score: number): void;
  recordDoctor(score: number): void;
  recordDnat(score: number): void;
  recordDesign(score: number): void;
  recordRouting(score: number): void;
  /** Eine Einzelaufgabe geloest: zaehlt fuer Truhen und Tagesziel */
  addTaskXp(score: number, date: string): void;
  openNextChest(): { xp: number; rarity: string } | null;
  markUnlocksSeen(keys: string[]): void;
  /** Legt die Auftraege des Tages an bzw. rollt auf einen neuen Tag um */
  ensureQuestDay(date: string, unlockedModes: string[]): void;
  /** Erfuellten Auftrag einloesen; gibt die XP zurueck oder null */
  claimQuest(id: string, xp: number): number | null;
  bumpStats(increments: Partial<Stats>, maxima?: Partial<Stats>): void;
  setOnboarded(): void;
  clearUnlocked(): void;
  setCombo(combo: number): void;
  updateSettings(patch: Partial<Settings>): void;
  exportSave(): string;
  importSave(json: string): boolean;
}

/**
 * Gemeinsamer Belohnungs-Teil JEDER gelösten Aufgabe: XP, Tagesziel,
 * Truhen-Zähler, Achievements. Zentral, damit wirklich jeder Modus den
 * Belohnungs-Loop füttert und nicht nur die, an die man gerade gedacht hat.
 */

/** Nulllinie fuer Tagesauftraege, wenn noch nichts gespielt wurde. */
const EMPTY_QUEST_COUNTERS: QuestCounters = {
  tasksSolved: 0,
  starsTotal: 0,
  implicitDenyCorrect: 0,
  doctorSolved: 0,
  routingSolved: 0,
  designSolved: 0,
  dnatSolved: 0,
  dailiesPlayed: 0,
};

/** Liest die auftragsrelevanten Zaehler aus dem Zustand. */
export function readQuestCounters(state: {
  tasksSolved: number;
  stars: Record<string, number>;
  stats: Stats;
  doctorSolved: number;
  routingSolved: number;
  designSolved: number;
  dnatSolved: number;
}): QuestCounters {
  return {
    tasksSolved: state.tasksSolved,
    starsTotal: Object.values(state.stars).reduce((sum, n) => sum + Math.min(3, n), 0),
    implicitDenyCorrect: state.stats.implicitDenyCorrect,
    doctorSolved: state.doctorSolved,
    routingSolved: state.routingSolved,
    designSolved: state.designSolved,
    dnatSolved: state.dnatSolved,
    dailiesPlayed: state.stats.dailiesPlayed,
  };
}

/**
 * Streak-Regel: die Serie zaehlt, sobald das TAGESZIEL erreicht ist — egal in
 * welchem Modus. Vorher haing sie allein am Daily Run, wer also fuenf
 * Doctor-Faelle loeste und den Daily uebersprang, verlor die Serie. Das
 * bestrafte das Falsche. advanceStreak ist fuer denselben Tag idempotent,
 * mehrfaches Ausloesen am Tag ist also unschaedlich.
 */
function streakForGoal(
  streak: StreakState,
  date: string,
  xpBefore: number,
  xpAfter: number,
): StreakState {
  const crossed = xpBefore < DEFAULT_DAILY_GOAL && xpAfter >= DEFAULT_DAILY_GOAL;
  return crossed ? advanceStreak(streak, date) : streak;
}

function rewardPatch(state: GameState, score: number, date = todayString()) {
  const xp = state.xp + score;
  const sameDay = state.dailyXp.date === date;
  const xpBefore = sameDay ? state.dailyXp.xp : 0;
  const xpToday = xpBefore + score;
  const streak = streakForGoal(state.streak, date, xpBefore, xpToday);
  const unlocked = evaluateAchievements(
    { stats: state.stats, xp, stars: state.stars, streak },
    state.achievements,
  );
  return {
    xp,
    streak,
    tasksSolved: state.tasksSolved + 1,
    dailyXp: { date, xp: xpToday },
    achievements: [...state.achievements, ...unlocked],
    lastUnlocked: unlocked.length > 0 ? unlocked : state.lastUnlocked,
  };
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      saveVersion: SAVE_VERSION,
      xp: 0,
      stars: {},
      bestScores: {},
      dailyHistory: {},
      endlessBest: { rounds: 0, score: 0 },
      blitzBest: 0,
      matchBest: 0,
      doctorSolved: 0,
      dnatSolved: 0,
      designSolved: 0,
      routingSolved: 0,
      dailyXp: { date: '', xp: 0 },
      tasksSolved: 0,
      chestsOpened: 0,
      seenUnlocks: [],
      questDay: { date: '', ids: [], snapshot: EMPTY_QUEST_COUNTERS, claimed: [] },
      stats: { ...EMPTY_STATS },
      achievements: [],
      streak: { ...EMPTY_STREAK },
      onboarded: false,
      settings: { sound: true, motion: 'system', scanlines: false, locale: 'en' },
      screen: { name: 'home' },
      combo: 0,
      lastUnlocked: [],

      navigate: (screen) => set({ screen }),

      recordLevelResult: (levelId, stars, score) =>
        set((state) => {
          const nextStars = {
            ...state.stars,
            [levelId]: Math.max(state.stars[levelId] ?? 0, stars),
          };
          const xp = state.xp + score;
          const unlocked = evaluateAchievements(
            { stats: state.stats, xp, stars: nextStars, streak: state.streak },
            state.achievements,
          );
          const date = todayString();
          const sameDay = state.dailyXp.date === date;
          const xpBefore = sameDay ? state.dailyXp.xp : 0;
          const xpToday = xpBefore + score;
          return {
            xp,
            stars: nextStars,
            streak: streakForGoal(state.streak, date, xpBefore, xpToday),
            tasksSolved: state.tasksSolved + 1,
            dailyXp: { date, xp: xpToday },
            bestScores: {
              ...state.bestScores,
              [levelId]: Math.max(state.bestScores[levelId] ?? 0, score),
            },
            achievements: [...state.achievements, ...unlocked],
            lastUnlocked: unlocked.length > 0 ? unlocked : state.lastUnlocked,
          };
        }),

      recordDaily: (date, results, score) =>
        set((state) => {
          if (state.dailyHistory[date]) return state; // ein gewertetes Ergebnis pro Tag
          const xp = state.xp + score;
          const streak = advanceStreak(state.streak, date);
          const stats: Stats = {
            ...state.stats,
            dailiesPlayed: state.stats.dailiesPlayed + 1,
            dailiesPerfect: state.stats.dailiesPerfect + (results.every(Boolean) ? 1 : 0),
          };
          const unlocked = evaluateAchievements(
            { stats, xp, stars: state.stars, streak },
            state.achievements,
          );
          const sameDay = state.dailyXp.date === date;
          return {
            xp,
            streak,
            stats,
            tasksSolved: state.tasksSolved + 1,
            dailyXp: { date, xp: (sameDay ? state.dailyXp.xp : 0) + score },
            dailyHistory: { ...state.dailyHistory, [date]: results },
            achievements: [...state.achievements, ...unlocked],
            lastUnlocked: unlocked.length > 0 ? unlocked : state.lastUnlocked,
          };
        }),

      recordEndless: (rounds, score) =>
        set((state) => {
          const xp = state.xp + score;
          const best: EndlessBest =
            score > state.endlessBest.score ? { rounds, score } : state.endlessBest;
          const unlocked = evaluateAchievements(
            { stats: state.stats, xp, stars: state.stars, streak: state.streak },
            state.achievements,
          );
          return {
            xp,
            endlessBest: best,
            achievements: [...state.achievements, ...unlocked],
            lastUnlocked: unlocked.length > 0 ? unlocked : state.lastUnlocked,
          };
        }),

      recordBlitz: (score) =>
        set((state) => ({
          ...rewardPatch(state, score),
          blitzBest: Math.max(state.blitzBest, score),
        })),

      recordMatchCheck: (score) =>
        set((state) => ({
          ...rewardPatch(state, score),
          matchBest: Math.max(state.matchBest, score),
        })),

      recordDnat: (score) =>
        set((state) => ({
          ...rewardPatch(state, score),
          dnatSolved: state.dnatSolved + 1,
        })),

      recordDesign: (score) =>
        set((state) => ({
          ...rewardPatch(state, score),
          designSolved: state.designSolved + 1,
        })),

      recordRouting: (score) =>
        set((state) => ({
          ...rewardPatch(state, score),
          routingSolved: state.routingSolved + 1,
        })),

      addTaskXp: (score, date) =>
        set((state) => {
          const xp = state.xp + score;
          // Tages-XP laufen mit dem Datum mit: neuer Tag ⇒ Zaehler beginnt neu
          const sameDay = state.dailyXp.date === date;
          const unlocked = evaluateAchievements(
            { stats: state.stats, xp, stars: state.stars, streak: state.streak },
            state.achievements,
          );
          return {
            xp,
            tasksSolved: state.tasksSolved + 1,
            dailyXp: { date, xp: (sameDay ? state.dailyXp.xp : 0) + score },
            achievements: [...state.achievements, ...unlocked],
            lastUnlocked: unlocked.length > 0 ? unlocked : state.lastUnlocked,
          };
        }),

      openNextChest: () => {
        const state = get();
        const available = chestsEarned(state.tasksSolved) - state.chestsOpened;
        if (available <= 0) return null;
        const reward = openChest(state.chestsOpened + 1);
        set({ chestsOpened: state.chestsOpened + 1, xp: state.xp + reward.xp });
        return reward;
      },

      markUnlocksSeen: (keys) =>
        set((state) => ({
          seenUnlocks: [...new Set([...state.seenUnlocks, ...keys])],
        })),

      ensureQuestDay: (date, unlockedModes) =>
        set((state) => {
          if (state.questDay.date === date && state.questDay.ids.length > 0) return state;
          // Neuer Tag: Auftraege ziehen und den Zaehlerstand als Nulllinie merken
          return {
            questDay: {
              date,
              ids: pickQuests(date, unlockedModes).map((q) => q.id),
              snapshot: readQuestCounters(state),
              claimed: [],
            },
          };
        }),

      claimQuest: (id, xp) => {
        const state = get();
        if (state.questDay.claimed.includes(id)) return null;
        set({
          xp: state.xp + xp,
          questDay: { ...state.questDay, claimed: [...state.questDay.claimed, id] },
        });
        return xp;
      },

      recordDoctor: (score) =>
        set((state) => ({
          ...rewardPatch(state, score),
          doctorSolved: state.doctorSolved + 1,
        })),

      bumpStats: (increments, maxima = {}) =>
        set((state) => {
          const stats = { ...state.stats };
          for (const [key, value] of Object.entries(increments)) {
            if (typeof value === 'number' && value !== 0) {
              stats[key as keyof Stats] += value;
            }
          }
          for (const [key, value] of Object.entries(maxima)) {
            if (typeof value === 'number') {
              const k = key as keyof Stats;
              stats[k] = Math.max(stats[k], value);
            }
          }
          const unlocked = evaluateAchievements(
            { stats, xp: state.xp, stars: state.stars, streak: state.streak },
            state.achievements,
          );
          return {
            stats,
            achievements: [...state.achievements, ...unlocked],
            lastUnlocked: unlocked.length > 0 ? unlocked : state.lastUnlocked,
          };
        }),

      setOnboarded: () => set({ onboarded: true }),
      clearUnlocked: () => set({ lastUnlocked: [] }),

      setCombo: (combo) => set({ combo }),

      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      exportSave: () => {
        const {
          saveVersion,
          xp,
          stars,
          bestScores,
          dailyHistory,
          endlessBest,
          blitzBest,
          matchBest,
          doctorSolved,
          dnatSolved,
          designSolved,
          routingSolved,
          dailyXp,
          tasksSolved,
          chestsOpened,
          seenUnlocks,
          questDay,
          stats,
          achievements,
          streak,
          onboarded,
          settings,
        } = get();
        return JSON.stringify(
          {
            saveVersion,
            xp,
            stars,
            bestScores,
            dailyHistory,
            endlessBest,
            blitzBest,
            matchBest,
            doctorSolved,
            dnatSolved,
            designSolved,
            routingSolved,
            dailyXp,
            tasksSolved,
            chestsOpened,
            seenUnlocks,
            questDay,
            stats,
            achievements,
            streak,
            onboarded,
            settings,
          },
          null,
          2,
        );
      },

      importSave: (json) => {
        try {
          const parsed: unknown = JSON.parse(json);
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            typeof (parsed as { saveVersion?: unknown }).saveVersion !== 'number'
          ) {
            return false;
          }
          const save = migrateSave(parsed as { saveVersion: number } & Record<string, unknown>);
          set(save);
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'packetclaw-save',
      version: SAVE_VERSION,
      partialize: (state) => ({
        saveVersion: state.saveVersion,
        xp: state.xp,
        stars: state.stars,
        bestScores: state.bestScores,
        dailyHistory: state.dailyHistory,
        endlessBest: state.endlessBest,
        blitzBest: state.blitzBest,
        matchBest: state.matchBest,
        doctorSolved: state.doctorSolved,
        dnatSolved: state.dnatSolved,
        designSolved: state.designSolved,
        routingSolved: state.routingSolved,
        dailyXp: state.dailyXp,
        tasksSolved: state.tasksSolved,
        chestsOpened: state.chestsOpened,
        seenUnlocks: state.seenUnlocks,
        questDay: state.questDay,
        stats: state.stats,
        achievements: state.achievements,
        streak: state.streak,
        onboarded: state.onboarded,
        settings: state.settings,
      }),
      migrate: (persisted) => migrateSave(persisted as { saveVersion: number }),
      // Jede Rehydration normalisieren: fehlende Felder (aeltere/unvollstaendige
      // Saves) werden aus den Defaults ergaenzt — unabhaengig von der Version.
      merge: (persisted, current) => ({
        ...current,
        ...migrateSave((persisted ?? {}) as { saveVersion: number }),
      }),
    },
  ),
);

/** Migrationskette für ältere Savegames — aktuell nur Version 1. */
export function migrateSave(save: { saveVersion: number } & Record<string, unknown>): {
  saveVersion: number;
  xp: number;
  stars: Record<string, number>;
  bestScores: Record<string, number>;
  dailyHistory: Record<string, boolean[]>;
  endlessBest: EndlessBest;
  blitzBest: number;
  matchBest: number;
  doctorSolved: number;
  dnatSolved: number;
  designSolved: number;
  routingSolved: number;
  dailyXp: { date: string; xp: number };
  tasksSolved: number;
  chestsOpened: number;
  seenUnlocks: string[];
  questDay: { date: string; ids: string[]; snapshot: QuestCounters; claimed: string[] };
  stats: Stats;
  achievements: string[];
  streak: StreakState;
  onboarded: boolean;
  settings: Settings;
} {
  // Zukünftige Migrationen: if (save.saveVersion === 1) { ...auf 2 heben... }
  return {
    saveVersion: SAVE_VERSION,
    xp: typeof save.xp === 'number' ? save.xp : 0,
    stars: (save.stars as Record<string, number>) ?? {},
    bestScores: (save.bestScores as Record<string, number>) ?? {},
    dailyHistory: (save.dailyHistory as Record<string, boolean[]>) ?? {},
    endlessBest: {
      rounds: 0,
      score: 0,
      ...((save.endlessBest as Partial<EndlessBest> | null) ?? {}),
    },
    blitzBest: typeof save.blitzBest === 'number' ? save.blitzBest : 0,
    matchBest: typeof save.matchBest === 'number' ? save.matchBest : 0,
    doctorSolved: typeof save.doctorSolved === 'number' ? save.doctorSolved : 0,
    dnatSolved: typeof save.dnatSolved === 'number' ? save.dnatSolved : 0,
    designSolved: typeof save.designSolved === 'number' ? save.designSolved : 0,
    routingSolved: typeof save.routingSolved === 'number' ? save.routingSolved : 0,
    dailyXp: { date: '', xp: 0, ...((save.dailyXp as { date: string; xp: number } | null) ?? {}) },
    tasksSolved: typeof save.tasksSolved === 'number' ? save.tasksSolved : 0,
    chestsOpened: typeof save.chestsOpened === 'number' ? save.chestsOpened : 0,
    seenUnlocks: Array.isArray(save.seenUnlocks) ? (save.seenUnlocks as string[]) : [],
    questDay: {
      date: '',
      ids: [],
      snapshot: EMPTY_QUEST_COUNTERS,
      claimed: [],
      ...((save.questDay as Record<string, unknown> | null) ?? {}),
    } as GameState['questDay'],
    stats: { ...EMPTY_STATS, ...((save.stats as Partial<Stats> | null) ?? {}) },
    achievements: Array.isArray(save.achievements) ? (save.achievements as string[]) : [],
    streak: { ...EMPTY_STREAK, ...((save.streak as Partial<StreakState> | null) ?? {}) },
    onboarded: save.onboarded === true,
    settings: {
      sound: true,
      motion: 'system',
      scanlines: false,
      locale: 'en',
      ...((save.settings as Partial<Settings>) ?? {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Freischalt-Logik
// ---------------------------------------------------------------------------

export function isLevelUnlocked(levelId: string, stars: Record<string, number>): boolean {
  const level = getLevel(levelId);
  if (!level) return false;
  // Vorgänger = nächstniedrigeres existierendes Level (lückentolerant)
  const previous = levelsForChapter(level.chapter)
    .filter((l) => l.index < level.index)
    .at(-1);
  if (!previous) return isChapterUnlocked(level.chapter, stars);
  return (stars[previous.id] ?? 0) >= 1;
}

export function isChapterUnlocked(chapter: number, stars: Record<string, number>): boolean {
  if (chapter === 1) return true;
  // Lückentolerant: das nächstniedrigere Kapitel MIT Leveln zählt als Gate
  for (let previous = chapter - 1; previous >= 1; previous--) {
    const levels = levelsForChapter(previous);
    if (levels.length === 0) continue;
    const gate = levels.find((l) => l.index === 10) ?? levels.at(-1);
    return gate !== undefined && (stars[gate.id] ?? 0) >= 1;
  }
  return true;
}
