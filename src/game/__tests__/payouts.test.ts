import { describe, expect, it } from 'vitest';
import {
  CLEAN_RUN_XP,
  FLOOR_XP,
  designPayout,
  dnatPayout,
  doctorPayout,
  mgmtPayout,
  routingPayout,
  securesDay,
  sessionPayout,
} from '../payouts';
import { DEFAULT_DAILY_GOAL } from '../rewards';

/** Alle Modi mit ihrem sauberen Durchgang. */
const CLEAN: Array<[string, number]> = [
  ['Config Doctor', doctorPayout(1, 0)],
  ['DNAT-Werkstatt', dnatPayout(0)],
  ['Routing-Werkstatt', routingPayout(0)],
  ['Management-Zugriff', mgmtPayout(1)],
  ['Review 5/5', sessionPayout(5, 5)],
  ['Tote Regel 5/5', sessionPayout(5, 5)],
  ['Change Request 3 Sterne', designPayout(3, true)],
];

describe('Die Regel: ein sauberer Durchgang sichert das Tagesziel', () => {
  /**
   * DIE zentrale Zusicherung. Die Serie zaehlt in JEDEM Modus, sobald das
   * Tagesziel erreicht ist. Zahlt ein Modus deutlich weniger, ist dieses
   * Versprechen nur auf dem Papier eingeloest — vorher brauchte es vier
   * Config-Doctor-Faelle fuer einen Tag, waehrend eine Minute Blitz reichte.
   */
  it('JEDER Modus reisst mit einem sauberen Durchgang das Tagesziel', () => {
    for (const [name, xp] of CLEAN) {
      expect(securesDay(xp), `${name} zahlt nur ${xp}, Ziel ist ${DEFAULT_DAILY_GOAL}`).toBe(true);
    }
  });

  it('kein Modus zahlt absurd viel mehr als die anderen', () => {
    const values = CLEAN.map(([, xp]) => xp);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Faktor 2 ist die Grenze: mehr macht einen Modus zur Abkuerzung
    expect(max / min).toBeLessThanOrEqual(2);
  });
});

describe('Fehler kosten, aber nie unter den Sockel', () => {
  it('mehr Fehlversuche zahlen weniger', () => {
    expect(dnatPayout(1)).toBeLessThan(dnatPayout(0));
    expect(routingPayout(2)).toBeLessThan(routingPayout(1));
    expect(doctorPayout(3, 2)).toBeLessThan(doctorPayout(1, 0));
    expect(mgmtPayout(3)).toBeLessThan(mgmtPayout(1));
  });

  /**
   * Wer am Ende loest, hat etwas verstanden — das darf sich nicht wie eine
   * Strafe anfuehlen.
   */
  it('auch ein muehsamer Sieg bleibt ueber dem Sockel', () => {
    for (const xp of [
      doctorPayout(20, 20),
      dnatPayout(50),
      routingPayout(50),
      mgmtPayout(50),
      sessionPayout(0, 5),
    ]) {
      expect(xp).toBeGreaterThanOrEqual(FLOOR_XP);
    }
  });

  it('der erste Eingriff im Doctor ist der Fix selbst und kostet nichts', () => {
    expect(doctorPayout(1, 0)).toBe(CLEAN_RUN_XP);
    expect(doctorPayout(0, 0)).toBe(CLEAN_RUN_XP);
  });
});

describe('Sitzungs-Modi', () => {
  it('mehr richtige Runden zahlen mehr, monoton', () => {
    for (let i = 1; i <= 5; i++) {
      expect(sessionPayout(i, 5)).toBeGreaterThan(sessionPayout(i - 1, 5));
    }
  });

  it('ein perfekter Durchgang trifft den vollen Betrag', () => {
    expect(sessionPayout(5, 5)).toBe(CLEAN_RUN_XP);
    expect(sessionPayout(3, 3)).toBe(CLEAN_RUN_XP);
  });

  it('mehr richtige als Runden zaehlen nicht doppelt', () => {
    expect(sessionPayout(99, 5)).toBe(sessionPayout(5, 5));
  });

  it('unsinnige Rundenzahl stuerzt nicht ab', () => {
    expect(sessionPayout(0, 0)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sessionPayout(1, -3))).toBe(true);
  });
});

describe('Change Request darf mehr zahlen, aber keine Abkuerzung sein', () => {
  it('zahlt mehr als ein normaler sauberer Durchgang', () => {
    expect(designPayout(3, true)).toBeGreaterThan(CLEAN_RUN_XP);
  });

  it('bleibt unter dem Doppelten', () => {
    expect(designPayout(3, true)).toBeLessThan(CLEAN_RUN_XP * 2);
  });

  it('Sterne und ein sauberes Regelwerk zahlen sich aus', () => {
    expect(designPayout(3, true)).toBeGreaterThan(designPayout(1, false));
  });
});
