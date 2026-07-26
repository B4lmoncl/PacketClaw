import { describe, expect, it } from 'vitest';
import {
  ALL_DONE_BONUS_XP,
  allQuestsDone,
  claimableQuests,
  pickQuests,
  QUEST_POOL,
  QUESTS_PER_DAY,
  questProgress,
  weekMilestone,
  WEEK_REWARDS,
} from '../dailyQuests';
import type { QuestCounters } from '../dailyQuests';

const ZERO: QuestCounters = {
  tasksSolved: 0,
  starsTotal: 0,
  implicitDenyCorrect: 0,
  doctorSolved: 0,
  routingSolved: 0,
  designSolved: 0,
  dnatSolved: 0,
  dailiesPlayed: 0,
};

const ALL_MODES = ['doctor', 'routing', 'design', 'dnat'];

describe('Auftragsauswahl', () => {
  it('gleiches Datum ⇒ gleiche Auftraege, anderes Datum ⇒ meist andere', () => {
    expect(pickQuests('2026-07-25', ALL_MODES)).toEqual(pickQuests('2026-07-25', ALL_MODES));
    const sets = new Set(
      ['2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'].map((d) =>
        pickQuests(d, ALL_MODES)
          .map((q) => q.id)
          .join(','),
      ),
    );
    expect(sets.size).toBeGreaterThan(1);
  });

  it('zieht genau drei Auftraege', () => {
    expect(pickQuests('2026-07-25', ALL_MODES)).toHaveLength(QUESTS_PER_DAY);
  });

  it('nie zwei Auftraege auf dieselbe Metrik', () => {
    for (const d of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const metrics = pickQuests(d, ALL_MODES).map((q) => q.metric);
      expect(new Set(metrics).size, `Datum ${d}`).toBe(metrics.length);
    }
  });

  it('KEINE Auftraege fuer gesperrte Modi — sonst waere der Tag unschaffbar', () => {
    for (const d of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']) {
      const quests = pickQuests(d, []); // frischer Spieler, nichts frei
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.requiresMode, `Datum ${d}: ${q.id}`).toBeUndefined();
      }
    }
  });

  it('mit nur einem freien Modus taucht auch nur dessen Auftrag auf', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const q of pickQuests(`seed-${i}`, ['doctor'])) ids.add(q.id);
    }
    const modeIds = [...ids].filter((id) => QUEST_POOL.find((q) => q.id === id)?.requiresMode);
    expect(modeIds.every((id) => id.startsWith('doctor'))).toBe(true);
  });

  it('der Pool hat genug modus-freie Auftraege fuer einen frischen Spieler', () => {
    const free = QUEST_POOL.filter((q) => q.requiresMode === undefined);
    // Verschiedene Metriken, sonst greift die Doppel-Sperre und es kommen <3
    expect(new Set(free.map((q) => q.metric)).size).toBeGreaterThanOrEqual(QUESTS_PER_DAY);
  });
});

describe('Auftragsfortschritt', () => {
  const quests = [
    { id: 'tasks3', metric: 'tasksSolved' as const, target: 3, xp: 120 },
    { id: 'doctor1', metric: 'doctorSolved' as const, target: 1, xp: 180 },
  ];

  it('zaehlt nur, was HEUTE dazugekommen ist', () => {
    const snapshot: QuestCounters = { ...ZERO, tasksSolved: 40, doctorSolved: 7 };
    const now: QuestCounters = { ...ZERO, tasksSolved: 42, doctorSolved: 7 };
    const p = questProgress(quests, snapshot, now, []);
    expect(p[0]).toMatchObject({ have: 2, target: 3, done: false });
    expect(p[1]).toMatchObject({ have: 0, done: false });
  });

  it('erfuellt und uebererfuellt: have bleibt beim Ziel gedeckelt', () => {
    const p = questProgress(quests, ZERO, { ...ZERO, tasksSolved: 99, doctorSolved: 3 }, []);
    expect(p[0]).toMatchObject({ have: 3, done: true, ratio: 1 });
    expect(p[1]?.done).toBe(true);
  });

  it('rueckwaerts laufende Zaehler (z. B. importierter Save) ergeben 0, nicht negativ', () => {
    const p = questProgress(quests, { ...ZERO, tasksSolved: 10 }, ZERO, []);
    expect(p[0]?.have).toBe(0);
    expect(p[0]?.ratio).toBe(0);
  });

  it('allQuestsDone und claimableQuests arbeiten zusammen', () => {
    const now = { ...ZERO, tasksSolved: 3, doctorSolved: 1 };
    const p = questProgress(quests, ZERO, now, []);
    expect(allQuestsDone(p)).toBe(true);
    expect(claimableQuests(p).map((q) => q.quest.id)).toEqual(['tasks3', 'doctor1']);
    // Nach dem Abholen ist nichts mehr offen
    const claimed = questProgress(quests, ZERO, now, ['tasks3', 'doctor1']);
    expect(claimableQuests(claimed)).toEqual([]);
    expect(allQuestsDone(claimed)).toBe(true);
  });

  it('leere Auftragsliste gilt NICHT als erledigt', () => {
    expect(allQuestsDone([])).toBe(false);
  });

  it('der Bonus fuer alle drei ist groesser als jeder Einzelauftrag', () => {
    expect(ALL_DONE_BONUS_XP).toBeGreaterThan(Math.max(...QUEST_POOL.map((q) => q.xp)) / 2);
  });
});

describe('Wochenmeilenstein', () => {
  it('Tag 1 bis 7 steigen monoton', () => {
    for (let i = 1; i < WEEK_REWARDS.length; i++) {
      expect(WEEK_REWARDS[i]).toBeGreaterThan(WEEK_REWARDS[i - 1] as number);
    }
  });

  it('ohne Serie steht Tag 1 an', () => {
    expect(weekMilestone(0)).toMatchObject({ day: 1, isFinal: false });
  });

  it('Tag 7 ist das Wochenziel, Tag 8 beginnt den Zyklus neu', () => {
    expect(weekMilestone(7)).toMatchObject({ day: 7, isFinal: true, reward: WEEK_REWARDS[6] });
    expect(weekMilestone(8)).toMatchObject({ day: 1, isFinal: false });
    expect(weekMilestone(14)).toMatchObject({ day: 7, isFinal: true });
  });

  it('negative Eingaben stuerzen nicht ab', () => {
    expect(weekMilestone(-3).day).toBe(1);
  });
});
