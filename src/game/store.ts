/**
 * Zentraler Spielzustand (Zustand + persist).
 * Persistiert wird nur der Savegame-Anteil (versioniert, migrierbar) —
 * Navigation und Laufzeit-Zustand bleiben flüchtig.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLevel, levelsForChapter } from './levels';

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
  | { name: 'sandbox' };

interface GameState {
  // --- persistiert (Savegame) ---
  saveVersion: number;
  xp: number;
  stars: Record<string, number>;
  bestScores: Record<string, number>;
  /** Daily-Historie: Datum → Ergebnis pro Paket */
  dailyHistory: Record<string, boolean[]>;
  settings: Settings;
  // --- flüchtig ---
  screen: Screen;
  combo: number; // aktuelle Serie richtiger Antworten (über Level hinweg)

  navigate(screen: Screen): void;
  recordLevelResult(levelId: string, stars: number, score: number): void;
  recordDaily(date: string, results: boolean[], score: number): void;
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
      settings: { sound: true, motion: 'system', scanlines: false, locale: 'de' },
      screen: { name: 'home' },
      combo: 0,

      navigate: (screen) => set({ screen }),

      recordLevelResult: (levelId, stars, score) =>
        set((state) => ({
          xp: state.xp + score,
          stars: {
            ...state.stars,
            [levelId]: Math.max(state.stars[levelId] ?? 0, stars),
          },
          bestScores: {
            ...state.bestScores,
            [levelId]: Math.max(state.bestScores[levelId] ?? 0, score),
          },
        })),

      recordDaily: (date, results, score) =>
        set((state) => ({
          xp: state.xp + score,
          dailyHistory: state.dailyHistory[date]
            ? state.dailyHistory
            : { ...state.dailyHistory, [date]: results },
        })),

      setCombo: (combo) => set({ combo }),

      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      exportSave: () => {
        const { saveVersion, xp, stars, bestScores, dailyHistory, settings } = get();
        return JSON.stringify(
          { saveVersion, xp, stars, bestScores, dailyHistory, settings },
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
        settings: state.settings,
      }),
      migrate: (persisted) => migrateSave(persisted as { saveVersion: number }),
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
  settings: Settings;
} {
  // Zukünftige Migrationen: if (save.saveVersion === 1) { ...auf 2 heben... }
  return {
    saveVersion: SAVE_VERSION,
    xp: typeof save.xp === 'number' ? save.xp : 0,
    stars: (save.stars as Record<string, number>) ?? {},
    bestScores: (save.bestScores as Record<string, number>) ?? {},
    dailyHistory: (save.dailyHistory as Record<string, boolean[]>) ?? {},
    settings: {
      sound: true,
      motion: 'system',
      scanlines: false,
      locale: 'de',
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
