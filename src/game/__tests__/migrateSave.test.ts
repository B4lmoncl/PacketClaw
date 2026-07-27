import { describe, expect, it } from 'vitest';
import { migrateSave, SAVE_VERSION } from '../store';

/**
 * Der Nutzer hat eine laufende Instanz mit echtem Fortschritt. Jedes neue
 * Save-Feld dieser Session (fieldNotes, claimedNoteSets, mgmtSolvedCount,
 * huntsDone, unlocksInitialised, reviewsDone …) muss deshalb einen alten
 * Spielstand UNBESCHADET durchlassen — und darf ihn nicht mit undefined-Werten
 * ins GUI schreiben, wo dann „NaN" oder leere Kacheln stehen.
 */
const OLD_SAVE = {
  saveVersion: 1,
  xp: 4200,
  stars: { 'ch1-l1': 3, 'ch1-l2': 2, 'ch2-l1': 3 },
  bestScores: { 'ch1-l1': 500 },
  dailyHistory: { '2026-07-20': [true, true, false] },
  endlessBest: { rounds: 7, score: 900 },
  blitzBest: 12,
  matchBest: 9,
  doctorSolved: 3,
  stats: {},
  achievements: ['first-blood'],
  streak: { current: 2, best: 5, lastDate: '2026-07-20', freezeTokens: 0 },
  onboarded: true,
  settings: { sound: false, motion: 'reduced' as const, scanlines: false, locale: 'en' as const },
};

describe('migrateSave — ein alter Spielstand ueberlebt jeden Umbau', () => {
  it('behaelt, was schon da war', () => {
    const m = migrateSave({ ...OLD_SAVE });
    expect(m.xp).toBe(4200);
    expect(m.stars).toEqual(OLD_SAVE.stars);
    expect(m.bestScores).toEqual(OLD_SAVE.bestScores);
    expect(m.dailyHistory).toEqual(OLD_SAVE.dailyHistory);
    expect(m.endlessBest).toEqual(OLD_SAVE.endlessBest);
    expect(m.doctorSolved).toBe(3);
    expect(m.achievements).toEqual(['first-blood']);
    expect(m.streak).toMatchObject({ current: 2, best: 5 });
    expect(m.onboarded).toBe(true);
    expect(m.saveVersion).toBe(SAVE_VERSION);
  });

  it('fuellt jedes neue Feld mit einem brauchbaren Wert', () => {
    const m = migrateSave({ ...OLD_SAVE });
    expect(m.fieldNotes).toEqual([]);
    expect(m.claimedNoteSets).toEqual([]);
    expect(m.mgmtSolvedCount).toBe(0);
    expect(m.huntsDone).toBe(0);
    expect(m.reviewsDone).toBe(0);
    expect(m.routingSolved).toBe(0);
    expect(m.designSolved).toBe(0);
    expect(m.dnatSolved).toBe(0);
    expect(m.tasksSolved).toBe(0);
    expect(m.chestsOpened).toBe(0);
    expect(m.unlocksInitialised).toBe(false);
    expect(m.mastery).toEqual({});
  });

  /** Ein voellig leerer Save darf ebenso wenig krachen wie ein alter. */
  it('ein leerer Save ergibt einen vollstaendigen Zustand', () => {
    const m = migrateSave({ saveVersion: 1 });
    for (const [key, value] of Object.entries(m)) {
      expect(value, `${key} ist undefined`).toBeDefined();
    }
    expect(m.xp).toBe(0);
    expect(m.onboarded).toBe(false);
  });

  /**
   * Kaputte Typen aus einem manuell bearbeiteten oder halb uebertragenen Save
   * duerfen nicht als solche durchgereicht werden.
   */
  it('falsche Typen werden auf die Vorgabe zurueckgesetzt', () => {
    const m = migrateSave({
      saveVersion: 1,
      xp: 'viel',
      stars: null,
      fieldNotes: 'policy0',
      claimedNoteSets: 42,
      huntsDone: null,
      achievements: 'keine',
    } as unknown as { saveVersion: number });
    expect(m.xp).toBe(0);
    expect(m.stars).toEqual({});
    expect(m.fieldNotes).toEqual([]);
    expect(m.claimedNoteSets).toEqual([]);
    expect(m.huntsDone).toBe(0);
    expect(m.achievements).toEqual([]);
  });

  /** Unbekannte Notiz-IDs fliegen raus — der Katalog aendert sich, der Save nicht. */
  it('sortiert Notiz-IDs aus, die es nicht mehr gibt', () => {
    const m = migrateSave({
      saveVersion: 1,
      fieldNotes: ['policy0', 'gibtsnichtmehr', 'routeFirst'],
    } as unknown as { saveVersion: number });
    expect(m.fieldNotes).toEqual(['policy0', 'routeFirst']);
  });
});
