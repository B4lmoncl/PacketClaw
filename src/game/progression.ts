/**
 * Progression: Ränge (XP-Schwellen), Achievements (mit Rarity, QuestHall-Anleihe)
 * und Daily-Streak mit Freeze-Token. Pure Logik, vollständig testbar.
 */
import { allLevels, levelsForChapter } from './levels';

// ---------------------------------------------------------------------------
// Ränge
// ---------------------------------------------------------------------------

export interface Rank {
  id: string;
  name: string; // Ränge sind Eigennamen — bewusst nicht übersetzt
  minXp: number;
}

export const RANKS: Rank[] = [
  { id: 'rookie', name: 'Packet Rookie', minXp: 0 },
  { id: 'port-waechter', name: 'Port Wächter', minXp: 500 },
  { id: 'rule-runner', name: 'Rule Runner', minXp: 1500 },
  { id: 'zone-keeper', name: 'Zone Keeper', minXp: 3000 },
  { id: 'nat-navigator', name: 'NAT Navigator', minXp: 5000 },
  { id: 'session-sensei', name: 'Session Sensei', minXp: 8000 },
  { id: 'audit-ace', name: 'Audit Ace', minXp: 12000 },
  { id: 'policy-architect', name: 'Policy Architect', minXp: 17000 },
  { id: 'implicit-deny-veteran', name: 'Implicit-Deny-Veteran', minXp: 23000 },
  { id: 'claw-commander', name: 'Claw Commander', minXp: 30000 },
];

export function rankFor(xp: number): { rank: Rank; next: Rank | null; progress: number } {
  let index = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= (RANKS[i] as Rank).minXp) {
      index = i;
      break;
    }
  }
  const rank = RANKS[index] as Rank;
  const next = RANKS[index + 1] ?? null;
  const progress = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, progress: Math.min(1, Math.max(0, progress)) };
}

// ---------------------------------------------------------------------------
// Streak (Daily) mit Freeze-Token alle 7 Tage
// ---------------------------------------------------------------------------

export interface StreakState {
  current: number;
  best: number;
  lastDate: string | null; // YYYY-MM-DD
  freezeTokens: number;
}

export const EMPTY_STREAK: StreakState = { current: 0, best: 0, lastDate: null, freezeTokens: 0 };

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Streak nach einem abgeschlossenen Daily fortschreiben (idempotent pro Tag). */
export function advanceStreak(streak: StreakState, date: string): StreakState {
  if (streak.lastDate === date) return streak;
  let { current, freezeTokens } = streak;
  if (streak.lastDate === null) {
    current = 1;
  } else {
    const gap = daysBetween(streak.lastDate, date);
    if (gap === 1) {
      current += 1;
    } else if (gap === 2 && freezeTokens > 0) {
      freezeTokens -= 1; // ein verpasster Tag wird eingefroren
      current += 1;
    } else {
      current = 1;
    }
  }
  // alle 7 Streak-Tage ein Freeze-Token (max. 3 auf Halde)
  if (current > 0 && current % 7 === 0) freezeTokens = Math.min(3, freezeTokens + 1);
  return {
    current,
    best: Math.max(streak.best, current),
    lastDate: date,
    freezeTokens,
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Zähler, die das Spiel im Save fortschreibt */
export interface Stats {
  levelsSolved: number;
  implicitDenyCorrect: number;
  shadowedFound: number;
  anyHardened: number;
  redundantDeleted: number;
  fastCorrect: number; // Verdict < 5 s korrekt
  maxComboStreak: number;
  noMistakeLevels: number;
  architectNoBroad: number; // Architect ohne all/ALL/any gelöst
  incidentsSolved: number;
  architectSolved: number;
  auditsSolved: number;
  verdictSolved: number;
  nightSolves: number; // 00:00–05:00 lokal
  dailiesPlayed: number;
  dailiesPerfect: number;
  sandboxFired: number;
}

export const EMPTY_STATS: Stats = {
  levelsSolved: 0,
  implicitDenyCorrect: 0,
  shadowedFound: 0,
  anyHardened: 0,
  redundantDeleted: 0,
  fastCorrect: 0,
  maxComboStreak: 0,
  noMistakeLevels: 0,
  architectNoBroad: 0,
  incidentsSolved: 0,
  architectSolved: 0,
  auditsSolved: 0,
  verdictSolved: 0,
  nightSolves: 0,
  dailiesPlayed: 0,
  dailiesPerfect: 0,
  sandboxFired: 0,
};

export interface AchievementContext {
  stats: Stats;
  xp: number;
  stars: Record<string, number>;
  streak: StreakState;
}

export interface Achievement {
  id: string;
  rarity: Rarity;
  title: { de: string; en: string };
  description: { de: string; en: string };
  earned: (ctx: AchievementContext) => boolean;
}

function chapterDone(stars: Record<string, number>, chapter: number): boolean {
  const levels = levelsForChapter(chapter);
  return levels.length > 0 && levels.every((l) => (stars[l.id] ?? 0) >= 1);
}

function chapterPerfect(stars: Record<string, number>, chapter: number): boolean {
  const levels = levelsForChapter(chapter);
  return levels.length > 0 && levels.every((l) => (stars[l.id] ?? 0) >= 3);
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-steps',
    rarity: 'common',
    title: { de: 'Schichtbeginn', en: 'Shift Start' },
    description: { de: 'Erstes Level gelöst.', en: 'Solved your first level.' },
    earned: (c) => c.stats.levelsSolved >= 1,
  },
  {
    id: 'first-blood-policy0',
    rarity: 'common',
    title: { de: 'First Blood: Policy 0', en: 'First Blood: Policy 0' },
    description: {
      de: 'Erstes Implicit Deny korrekt erkannt.',
      en: 'Correctly identified your first implicit deny.',
    },
    earned: (c) => c.stats.implicitDenyCorrect >= 1,
  },
  {
    id: 'implicit-deny-50',
    rarity: 'epic',
    title: { de: 'Zeile-0-Stammgast', en: 'Row 0 Regular' },
    description: {
      de: '50× Implicit Deny korrekt erkannt.',
      en: 'Spotted implicit deny 50 times.',
    },
    earned: (c) => c.stats.implicitDenyCorrect >= 50,
  },
  {
    id: 'combo-x2',
    rarity: 'rare',
    title: { de: 'Combo ×2', en: 'Combo ×2' },
    description: {
      de: 'Multiplikator ×2,0 erreicht (11er-Serie).',
      en: 'Reached a ×2.0 multiplier (11 streak).',
    },
    earned: (c) => c.stats.maxComboStreak >= 11,
  },
  {
    id: 'combo-x3',
    rarity: 'epic',
    title: { de: 'Combo ×3', en: 'Combo ×3' },
    description: {
      de: 'Multiplikator-Cap ×3,0 erreicht (21er-Serie).',
      en: 'Hit the ×3.0 cap (21 streak).',
    },
    earned: (c) => c.stats.maxComboStreak >= 21,
  },
  {
    id: 'speedreader',
    rarity: 'rare',
    title: { de: 'Speedreader', en: 'Speedreader' },
    description: {
      de: 'Verdict in unter 5 Sekunden korrekt.',
      en: 'Correct verdict in under 5 seconds.',
    },
    earned: (c) => c.stats.fastCorrect >= 1,
  },
  {
    id: 'shadow-first',
    rarity: 'common',
    title: { de: 'Schattenseher', en: 'Shadow Seer' },
    description: { de: 'Erste shadowed Rule gefunden.', en: 'Found your first shadowed rule.' },
    earned: (c) => c.stats.shadowedFound >= 1,
  },
  {
    id: 'shadow-hunter',
    rarity: 'epic',
    title: { de: 'Shadow Hunter', en: 'Shadow Hunter' },
    description: { de: '10 shadowed Rules gefunden.', en: 'Found 10 shadowed rules.' },
    earned: (c) => c.stats.shadowedFound >= 10,
  },
  {
    id: 'least-privilege',
    rarity: 'rare',
    title: { de: 'Least Privilege', en: 'Least Privilege' },
    description: {
      de: 'Any-Any gehärtet, ohne die Suite zu brechen.',
      en: 'Hardened an any-any without breaking the suite.',
    },
    earned: (c) => c.stats.anyHardened >= 1,
  },
  {
    id: 'aufraeumer',
    rarity: 'rare',
    title: { de: 'Aufräumer', en: 'Declutterer' },
    description: { de: '5 redundante Regeln gelöscht.', en: 'Deleted 5 redundant rules.' },
    earned: (c) => c.stats.redundantDeleted >= 5,
  },
  {
    id: 'kein-all-heute',
    rarity: 'rare',
    title: { de: 'Kein ALL heute', en: 'No ALL Today' },
    description: {
      de: '3 Architect-Level ohne all/ALL/any gelöst.',
      en: 'Solved 3 architect levels without all/ALL/any.',
    },
    earned: (c) => c.stats.architectNoBroad >= 3,
  },
  {
    id: 'hairpin',
    rarity: 'rare',
    title: { de: 'Hairpin? Kein Problem', en: 'Hairpin? No Problem' },
    description: {
      de: 'Das VIP/DNAT-Kapitel abgeschlossen.',
      en: 'Completed the VIP/DNAT chapter.',
    },
    earned: (c) => chapterDone(c.stars, 7),
  },
  {
    id: 'incident-first',
    rarity: 'common',
    title: { de: 'Feuerwehr', en: 'Firefighter' },
    description: { de: 'Ersten Incident gelöst.', en: 'Solved your first incident.' },
    earned: (c) => c.stats.incidentsSolved >= 1,
  },
  {
    id: 'all-modes',
    rarity: 'rare',
    title: { de: 'Vier Gewerke', en: 'Four Trades' },
    description: {
      de: 'Je ein Level in jedem Modus gelöst.',
      en: 'Solved at least one level in every mode.',
    },
    earned: (c) =>
      c.stats.verdictSolved >= 1 &&
      c.stats.architectSolved >= 1 &&
      c.stats.auditsSolved >= 1 &&
      c.stats.incidentsSolved >= 1,
  },
  {
    id: 'no-mistake-10',
    rarity: 'epic',
    title: { de: 'Fehlerlos ×10', en: 'Flawless ×10' },
    description: {
      de: '10 Level ohne Fehlversuch gelöst.',
      en: 'Solved 10 levels without a failed attempt.',
    },
    earned: (c) => c.stats.noMistakeLevels >= 10,
  },
  {
    id: 'nachtschicht',
    rarity: 'rare',
    title: { de: 'Nachtschicht', en: 'Night Shift' },
    description: {
      de: 'Ein Level zwischen 0 und 5 Uhr gelöst.',
      en: 'Solved a level between midnight and 5 am.',
    },
    earned: (c) => c.stats.nightSolves >= 1,
  },
  {
    id: 'daily-first',
    rarity: 'common',
    title: { de: 'Tagesgeschäft', en: 'Daily Business' },
    description: { de: 'Ersten Daily Run gespielt.', en: 'Played your first daily run.' },
    earned: (c) => c.stats.dailiesPlayed >= 1,
  },
  {
    id: 'daily-perfect',
    rarity: 'epic',
    title: { de: 'Zehn von Zehn', en: 'Ten Out of Ten' },
    description: { de: 'Einen Daily Run perfekt gespielt.', en: 'Played a perfect daily run.' },
    earned: (c) => c.stats.dailiesPerfect >= 1,
  },
  {
    id: 'streak-7',
    rarity: 'epic',
    title: { de: '7-Tage-Daily-Streak', en: '7-Day Daily Streak' },
    description: { de: 'Sieben Tage Daily in Folge.', en: 'Seven daily runs in a row.' },
    earned: (c) => c.streak.best >= 7,
  },
  {
    id: 'streak-30',
    rarity: 'legendary',
    title: { de: 'Monatswache', en: 'Month Watch' },
    description: { de: '30 Tage Daily-Streak.', en: '30-day daily streak.' },
    earned: (c) => c.streak.best >= 30,
  },
  {
    id: 'sandbox-fired',
    rarity: 'common',
    title: { de: 'Testfeuer', en: 'Test Fire' },
    description: { de: 'Erstes Sandbox-Paket abgefeuert.', en: 'Fired your first sandbox packet.' },
    earned: (c) => c.stats.sandboxFired >= 1,
  },
  {
    id: 'stars-50',
    rarity: 'rare',
    title: { de: 'Sternenwanderer', en: 'Star Walker' },
    description: { de: '50 Sterne gesammelt.', en: 'Collected 50 stars.' },
    earned: (c) => Object.values(c.stars).reduce((a, b) => a + b, 0) >= 50,
  },
  {
    id: 'stars-150',
    rarity: 'epic',
    title: { de: 'Sternenflut', en: 'Star Flood' },
    description: { de: '150 Sterne gesammelt.', en: 'Collected 150 stars.' },
    earned: (c) => Object.values(c.stars).reduce((a, b) => a + b, 0) >= 150,
  },
  {
    id: 'kapitel-perfekt',
    rarity: 'legendary',
    title: { de: 'Kapitel perfekt', en: 'Perfect Chapter' },
    description: { de: 'Ein Kapitel komplett mit 3 Sternen.', en: 'A whole chapter at 3 stars.' },
    earned: (c) => [1, 2, 3, 4, 5, 6, 7, 8].some((n) => chapterPerfect(c.stars, n)),
  },
  {
    id: 'boss-slayer',
    rarity: 'legendary',
    title: { de: 'Torwächter des Turms', en: 'Warden of the Tower' },
    description: { de: 'Alle 8 Boss-Level gelöst.', en: 'Beat all 8 boss levels.' },
    earned: (c) => allLevels.filter((l) => l.index === 10).every((l) => (c.stars[l.id] ?? 0) >= 1),
  },
  {
    id: 'rank-navigator',
    rarity: 'rare',
    title: { de: 'Aufsteiger', en: 'Climber' },
    description: {
      de: 'Rang NAT Navigator erreicht (5000 XP).',
      en: 'Reached NAT Navigator (5000 XP).',
    },
    earned: (c) => c.xp >= 5000,
  },
  {
    id: 'rank-commander',
    rarity: 'legendary',
    title: { de: 'Claw Commander', en: 'Claw Commander' },
    description: {
      de: 'Höchsten Rang erreicht (30000 XP).',
      en: 'Reached the highest rank (30000 XP).',
    },
    earned: (c) => c.xp >= 30000,
  },
];

/** Liefert die IDs aller NEU freigeschalteten Achievements. */
export function evaluateAchievements(
  ctx: AchievementContext,
  unlocked: readonly string[],
): string[] {
  const have = new Set(unlocked);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.earned(ctx)).map((a) => a.id);
}
