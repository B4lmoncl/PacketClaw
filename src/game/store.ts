/**
 * Zentraler Spielzustand (Zustand + persist).
 * Persistiert wird nur der Savegame-Anteil (versioniert, migrierbar) —
 * Navigation und Laufzeit-Zustand bleiben flüchtig.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  bumpStats(increments: Partial<Stats>, maxima?: Partial<Stats>): void;
  setOnboarded(): void;
  clearUnlocked(): void;
  setCombo(combo: number): void;
  updateSettings(patch: Partial<Settings>): void;
  exportSave(): string;
  importSave(json: string): boolean;
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
          return {
            xp,
            stars: nextStars,
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
          return {
            xp,
            streak,
            stats,
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
