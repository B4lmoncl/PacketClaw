import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../progression';

/**
 * Textqualitäts-Gate für Abzeichen. Diese Texte stehen sichtbar im UI
 * („Kurz davor"-Panel), deshalb sind sie kein Beiwerk.
 *
 * Das Lyra-Playbook (QuestHall, Abschnitt 0) verbietet ausdrücklich die
 * nackte Bedingung als Beschreibung — „Schließe 10 Quests ab" ist dort das
 * Negativbeispiel. Jeder Text braucht eine Landung. Ein Test kann Humor nicht
 * messen, aber er kann verhindern, dass jemand wieder eine reine
 * Bedingungszeile einträgt: zwei Sätze bzw. ausreichend Länge, beide Sprachen
 * gepflegt, keine Motivationsposter-Floskeln.
 */
describe('Abzeichen-Texte', () => {
  it('jedes Abzeichen hat Titel und Beschreibung in beiden Sprachen', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.de.length, a.id).toBeGreaterThan(2);
      expect(a.title.en.length, a.id).toBeGreaterThan(2);
      expect(a.description.de.length, a.id).toBeGreaterThan(2);
      expect(a.description.en.length, a.id).toBeGreaterThan(2);
    }
  });

  it('DE und EN sind wirklich uebersetzt, nicht kopiert', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.description.de, a.id).not.toBe(a.description.en);
    }
  });

  it('keine nackte Bedingungszeile — jeder Text hat eine Landung', () => {
    for (const a of ACHIEVEMENTS) {
      for (const text of [a.description.de, a.description.en]) {
        // Eine reine Bedingung ist kurz und hat genau einen Satz.
        const sentences = text.split(/[.!?](\s|$)/).filter((part) => part.trim().length > 0).length;
        const longEnough = text.length >= 60;
        expect(
          longEnough || sentences > 1,
          `${a.id}: „${text}" ist eine nackte Bedingung ohne Landung`,
        ).toBe(true);
      }
    }
  });

  it('keine Motivationsposter-Sprache (Playbook-Verbot)', () => {
    const banned = [
      /ist eine Superkraft/i,
      /ist ein Geschenk/i,
      /die Magie liegt/i,
      /is a superpower/i,
      /believe in yourself/i,
      /you got this/i,
    ];
    for (const a of ACHIEVEMENTS) {
      for (const text of [a.description.de, a.description.en, a.title.de, a.title.en]) {
        for (const pattern of banned) {
          expect(pattern.test(text), `${a.id}: „${text}"`).toBe(false);
        }
      }
    }
  });

  it('IDs sind einzigartig', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
