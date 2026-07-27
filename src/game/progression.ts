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
  { id: 'claw-commander', name: 'Aether-Kommandant', minXp: 30000 },
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
  /**
   * Fortschritt fuer zaehlbare Ziele („noch 2 bis zum Abzeichen"). Nur
   * gesetzt, wo es eine sinnvolle Zahl gibt — Kapitel-Achievements etwa
   * haben keine.
   */
  progress?: (ctx: AchievementContext) => { have: number; need: number };
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
    description: {
      de: 'Ein Level gelöst. Die Firewall hat es überlebt, du auch — das ist mehr, als der Schichtbeginn üblicherweise hergibt.',
      en: 'One level solved. The firewall survived and so did you, which is more than most shift starts manage.',
    },
    earned: (c) => c.stats.levelsSolved >= 1,
    progress: (c) => ({ have: c.stats.levelsSolved, need: 1 }),
  },
  {
    id: 'first-blood-policy0',
    rarity: 'common',
    title: { de: 'First Blood: Policy 0', en: 'First Blood: Policy 0' },
    description: {
      de: 'Zum ersten Mal die Regel erkannt, die niemand geschrieben hat. Policy 0 steht in keiner Liste und entscheidet trotzdem.',
      en: 'Spotted the rule nobody wrote. Policy 0 is on no list and still decides.',
    },
    earned: (c) => c.stats.implicitDenyCorrect >= 1,
    progress: (c) => ({ have: c.stats.implicitDenyCorrect, need: 1 }),
  },
  {
    id: 'implicit-deny-50',
    rarity: 'epic',
    title: { de: 'Zeile-0-Stammgast', en: 'Row 0 Regular' },
    description: {
      de: '50× das Implicit Deny erkannt. Die Regel, die es nicht gibt, kennst du inzwischen besser als die, die es gibt.',
      en: "Caught the implicit deny 50 times. You now know the rule that doesn't exist better than the ones that do.",
    },
    earned: (c) => c.stats.implicitDenyCorrect >= 50,
    progress: (c) => ({ have: c.stats.implicitDenyCorrect, need: 50 }),
  },
  {
    id: 'combo-x2',
    rarity: 'rare',
    title: { de: 'Combo ×2', en: 'Combo ×2' },
    description: {
      de: 'Elf richtige in Folge. Irgendwann hört das Raten auf und es fängt das Wissen an.',
      en: 'Eleven correct in a row. At some point the guessing stops and the knowing starts.',
    },
    earned: (c) => c.stats.maxComboStreak >= 11,
    progress: (c) => ({ have: c.stats.maxComboStreak, need: 11 }),
  },
  {
    id: 'combo-x3',
    rarity: 'epic',
    title: { de: 'Combo ×3', en: 'Combo ×3' },
    description: {
      de: 'Einundzwanzig in Folge, Multiplikator am Anschlag. Der Anschlag war vorher nur Theorie.',
      en: 'Twenty-one in a row, multiplier maxed. Until now the maximum was theoretical.',
    },
    earned: (c) => c.stats.maxComboStreak >= 21,
    progress: (c) => ({ have: c.stats.maxComboStreak, need: 21 }),
  },
  {
    id: 'speedreader',
    rarity: 'rare',
    title: { de: 'Speedreader', en: 'Speedreader' },
    description: {
      de: 'Ein Verdict in unter fünf Sekunden. Entweder hast du es gelesen oder geraten, und diesmal war es Lesen.',
      en: 'A verdict in under five seconds. Either you read it or you guessed, and this time you read it.',
    },
    earned: (c) => c.stats.fastCorrect >= 1,
    progress: (c) => ({ have: c.stats.fastCorrect, need: 1 }),
  },
  {
    id: 'shadow-first',
    rarity: 'common',
    title: { de: 'Schattenseher', en: 'Shadow Seer' },
    description: {
      de: 'Erste verschattete Regel gefunden. Sie stand die ganze Zeit da und tat nichts. Jemand hat sie mal gebraucht, vermutlich.',
      en: 'Found your first shadowed rule. It sat there the whole time doing nothing. Someone needed it once, presumably.',
    },
    earned: (c) => c.stats.shadowedFound >= 1,
    progress: (c) => ({ have: c.stats.shadowedFound, need: 1 }),
  },
  {
    id: 'shadow-hunter',
    rarity: 'epic',
    title: { de: 'Shadow Hunter', en: 'Shadow Hunter' },
    description: {
      de: 'Zehn verschattete Regeln gefunden. Zehn Regeln, die jemand geschrieben, getestet und nie wieder angesehen hat.',
      en: 'Ten shadowed rules found. Ten rules someone wrote, tested and never looked at again.',
    },
    earned: (c) => c.stats.shadowedFound >= 10,
    progress: (c) => ({ have: c.stats.shadowedFound, need: 10 }),
  },
  {
    id: 'least-privilege',
    rarity: 'rare',
    title: { de: 'Least Privilege', en: 'Least Privilege' },
    description: {
      de: 'Ein Any-Any enger gefasst, ohne dass etwas kaputtging. Der Auditor bemerkt es nicht. Das ist der Punkt.',
      en: "Tightened an any-any without breaking anything. The auditor won't notice. That's the point.",
    },
    earned: (c) => c.stats.anyHardened >= 1,
    progress: (c) => ({ have: c.stats.anyHardened, need: 1 }),
  },
  {
    id: 'aufraeumer',
    rarity: 'rare',
    title: { de: 'Aufräumer', en: 'Declutterer' },
    description: {
      de: 'Fünf überflüssige Regeln gelöscht. Das Regelwerk ist kürzer und tut genau dasselbe, was Fragen über die letzten Jahre aufwirft.',
      en: 'Deleted five redundant rules. The ruleset is shorter and does exactly the same, which raises questions about the last few years.',
    },
    earned: (c) => c.stats.redundantDeleted >= 5,
    progress: (c) => ({ have: c.stats.redundantDeleted, need: 5 }),
  },
  {
    id: 'kein-all-heute',
    rarity: 'rare',
    title: { de: 'Kein ALL heute', en: 'No ALL Today' },
    description: {
      de: 'Drei Architect-Level ohne ein einziges all/ALL/any. Es geht also. Das hätte man auch früher erwähnen können.',
      en: 'Three architect levels without a single all/ALL/any. So it is possible. Someone might have mentioned that earlier.',
    },
    earned: (c) => c.stats.architectNoBroad >= 3,
    progress: (c) => ({ have: c.stats.architectNoBroad, need: 3 }),
  },
  {
    id: 'hairpin',
    rarity: 'rare',
    title: { de: 'Hairpin? Kein Problem', en: 'Hairpin? No Problem' },
    description: {
      de: 'Das VIP/DNAT-Kapitel abgeschlossen. Port-Forwarding ist keine Magie, es ist nur sehr genau — und Genauigkeit verzeiht nichts.',
      en: "Finished the VIP/DNAT chapter. Port forwarding isn't magic, it's just precise, and precision forgives nothing.",
    },
    earned: (c) => chapterDone(c.stars, 7),
  },
  {
    id: 'incident-first',
    rarity: 'common',
    title: { de: 'Feuerwehr', en: 'Firefighter' },
    description: {
      de: 'Ersten Incident gelöst. Es lag nicht am Netzwerk. Es lag nie am Netzwerk.',
      en: "First incident solved. It wasn't the network. It's never the network.",
    },
    earned: (c) => c.stats.incidentsSolved >= 1,
    progress: (c) => ({ have: c.stats.incidentsSolved, need: 1 }),
  },
  {
    id: 'all-modes',
    rarity: 'rare',
    title: { de: 'Vier Gewerke', en: 'Four Trades' },
    description: {
      de: 'Je ein Level in jedem Modus. Vier Handwerke, dieselbe Firewall, vier Arten sich zu irren.',
      en: 'One level in every mode. Four trades, one firewall, four ways to be wrong.',
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
      de: 'Zehn Level ohne einen Fehlversuch. Das ist keine Serie mehr, das ist eine Gewohnheit.',
      en: "Ten levels without a wrong attempt. That's not a streak anymore, that's a habit.",
    },
    earned: (c) => c.stats.noMistakeLevels >= 10,
    progress: (c) => ({ have: c.stats.noMistakeLevels, need: 10 }),
  },
  {
    id: 'nachtschicht',
    rarity: 'rare',
    title: { de: 'Nachtschicht', en: 'Night Shift' },
    description: {
      de: 'Ein Level zwischen null und fünf Uhr gelöst. Die Firewall arbeitet auch nachts. Offenbar nicht allein.',
      en: 'Solved a level between midnight and five. The firewall works nights too. Apparently not alone.',
    },
    earned: (c) => c.stats.nightSolves >= 1,
    progress: (c) => ({ have: c.stats.nightSolves, need: 1 }),
  },
  {
    id: 'daily-first',
    rarity: 'common',
    title: { de: 'Tagesgeschäft', en: 'Daily Business' },
    description: {
      de: 'Ersten Tagessatz gespielt. Zehn Pakete, die für alle gleich sind — Ausreden also auch.',
      en: 'Played your first daily set. Ten packets, the same for everyone, which goes for the excuses too.',
    },
    earned: (c) => c.stats.dailiesPlayed >= 1,
    progress: (c) => ({ have: c.stats.dailiesPlayed, need: 1 }),
  },
  {
    id: 'daily-perfect',
    rarity: 'epic',
    title: { de: 'Zehn von Zehn', en: 'Ten Out of Ten' },
    description: {
      de: 'Ein Tagessatz ohne Fehler. Zehn von zehn, und niemand hat zugesehen.',
      en: 'A daily set without a mistake. Ten out of ten, and nobody was watching.',
    },
    earned: (c) => c.stats.dailiesPerfect >= 1,
    progress: (c) => ({ have: c.stats.dailiesPerfect, need: 1 }),
  },
  {
    id: 'streak-7',
    rarity: 'epic',
    title: { de: '7-Tage-Daily-Streak', en: '7-Day Daily Streak' },
    description: {
      de: 'Sieben Tage in Folge. Aus einem Vorsatz ist ein Ablauf geworden.',
      en: 'Seven days in a row. An intention has quietly become a procedure.',
    },
    earned: (c) => c.streak.best >= 7,
    progress: (c) => ({ have: c.streak.best, need: 7 }),
  },
  {
    id: 'streak-30',
    rarity: 'legendary',
    title: { de: 'Monatswache', en: 'Month Watch' },
    description: {
      de: 'Dreißig Tage in Folge. Das Schichtbuch führt dich inzwischen als Inventar.',
      en: 'Thirty days in a row. The shift log now lists you as inventory.',
    },
    earned: (c) => c.streak.best >= 30,
    progress: (c) => ({ have: c.streak.best, need: 30 }),
  },
  {
    id: 'sandbox-fired',
    rarity: 'common',
    title: { de: 'Testfeuer', en: 'Test Fire' },
    description: {
      de: 'Erstes Paket in der Sandbox abgefeuert. Nichts explodiert, was in einer Sandbox als Erfolg durchgeht.',
      en: 'Fired your first packet in the sandbox. Nothing exploded, which in a sandbox counts as success.',
    },
    earned: (c) => c.stats.sandboxFired >= 1,
    progress: (c) => ({ have: c.stats.sandboxFired, need: 1 }),
  },
  {
    id: 'stars-50',
    rarity: 'rare',
    title: { de: 'Sternenwanderer', en: 'Star Walker' },
    description: {
      de: '50 Sterne gesammelt. Die ersten zwanzig waren Neugier, der Rest war Absicht.',
      en: 'Fifty stars collected. The first twenty were curiosity, the rest were intent.',
    },
    earned: (c) => Object.values(c.stars).reduce((a, b) => a + b, 0) >= 50,
  },
  {
    id: 'stars-150',
    rarity: 'epic',
    title: { de: 'Sternenflut', en: 'Star Flood' },
    description: {
      de: '150 Sterne gesammelt. Das ist kein Lernen mehr, das ist Routine mit Sternen dran.',
      en: "150 stars collected. That isn't learning anymore, that's routine with stars on it.",
    },
    earned: (c) => Object.values(c.stars).reduce((a, b) => a + b, 0) >= 150,
  },
  {
    id: 'kapitel-perfekt',
    rarity: 'legendary',
    title: { de: 'Kapitel perfekt', en: 'Perfect Chapter' },
    description: {
      de: 'Ein Kapitel komplett mit drei Sternen. Nichts ausgelassen, nichts geraten, nichts stillschweigend übersprungen.',
      en: 'A full chapter at three stars. Nothing skipped, nothing guessed, nothing quietly passed over.',
    },
    earned: (c) => [1, 2, 3, 4, 5, 6, 7, 8].some((n) => chapterPerfect(c.stars, n)),
  },
  {
    id: 'boss-slayer',
    rarity: 'legendary',
    title: { de: 'Torwächter des Turms', en: 'Warden of the Tower' },
    description: {
      de: 'Alle acht Boss-Level gelöst. Der Turm hat acht Tore und du kennst jedes von innen.',
      en: 'All eight boss levels solved. The tower has eight gates and you know each one from the inside.',
    },
    earned: (c) => allLevels.filter((l) => l.index === 10).every((l) => (c.stars[l.id] ?? 0) >= 1),
  },
  {
    id: 'rank-navigator',
    rarity: 'rare',
    title: { de: 'Aufsteiger', en: 'Climber' },
    description: {
      de: 'Rang NAT Navigator erreicht. Der Rang steht in keinem Lebenslauf und ist trotzdem verdient.',
      en: 'Reached NAT Navigator. The rank appears on no résumé and is earned anyway.',
    },
    earned: (c) => c.xp >= 5000,
    progress: (c) => ({ have: c.xp, need: 5000 }),
  },
  {
    id: 'rank-commander',
    rarity: 'legendary',
    title: { de: 'Aether-Kommandant', en: 'Aether Commander' },
    description: {
      de: 'Höchster Rang erreicht. Es gibt keinen weiteren. Man hätte es vorher sagen können.',
      en: 'Highest rank reached. There is no further one. Someone could have said so beforehand.',
    },
    earned: (c) => c.xp >= 30000,
    progress: (c) => ({ have: c.xp, need: 30000 }),
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

/** Ein noch offenes Abzeichen mit Fortschritt — Basis fuer „noch N bis …". */
export interface AchievementProgress {
  achievement: Achievement;
  have: number;
  need: number;
  /** 0..1 */
  ratio: number;
}

/**
 * Die Abzeichen, denen der Spieler am naechsten ist. Genau das erzeugt die
 * Vorfreude, die vorher fehlte: 39 Achievements existierten, aber niemand
 * wusste, welches gerade zum Greifen nah ist.
 */
/**
 * Ab wann ist etwas „kurz davor"?
 *
 * Zwei ehrliche Wege, und beide braucht es:
 *  - WENIGE STÜCK ÜBRIG. „noch 1 Level" ist greifbar, auch wenn der
 *    Fortschritt bei 0 % steht (0 von 1).
 *  - GROSSER ANTEIL GESCHAFFT. 4000 von 5000 XP ist greifbar, auch wenn die
 *    Restzahl groß aussieht.
 *
 * Ohne diese Schwelle stand im Panel „Aether Commander — noch 26000" unter der
 * Überschrift KURZ DAVOR. Ein Panel, das solche Ziele als nah verkauft, wird
 * überlesen — und nimmt damit auch den echten Fast-Treffern die Wirkung.
 */
export const NEAR_REMAINDER = 5;
export const NEAR_RATIO = 0.5;

export function isNear(have: number, need: number): boolean {
  if (need <= 0) return false;
  return need - have <= NEAR_REMAINDER || have / need >= NEAR_RATIO;
}

export function nearestAchievements(
  ctx: AchievementContext,
  earnedIds: readonly string[],
  limit = 3,
): AchievementProgress[] {
  return (
    ACHIEVEMENTS.filter((a) => !earnedIds.includes(a.id) && a.progress && !a.earned(ctx))
      .map((a) => {
        const { have, need } = a.progress!(ctx);
        return { achievement: a, have, need, ratio: need > 0 ? Math.min(1, have / need) : 0 };
      })
      // Lieber eine kurze ehrliche Liste als eine aufgefuellte
      .filter((p) => isNear(p.have, p.need))
      // Fast fertige zuerst; bei Gleichstand das mit dem kleineren Rest
      .sort((a, b) => b.ratio - a.ratio || a.need - a.have - (b.need - b.have))
      .slice(0, limit)
  );
}
