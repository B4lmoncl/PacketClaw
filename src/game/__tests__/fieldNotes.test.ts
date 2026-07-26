import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { CONCEPTS } from '../mastery';
import {
  collectionProgress,
  drawNote,
  FIELD_NOTES,
  NOTE_RARITIES,
  noteById,
  notesForConcept,
  RARITY_XP,
  sortedCollection,
} from '../fieldNotes';

describe('Katalog', () => {
  it('IDs sind einzigartig', () => {
    const ids = FIELD_NOTES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jede Karte haengt an einem bekannten Konzept und einer bekannten Stufe', () => {
    for (const note of FIELD_NOTES) {
      expect(CONCEPTS, note.id).toContain(note.concept);
      expect(NOTE_RARITIES, note.id).toContain(note.rarity);
    }
  });

  /**
   * Der Sinn der Karten ist LERNEN (Oberste Direktive), nicht Deko. Eine Karte
   * ohne Text waere eine leere Belohnung — und weil der Text in i18n steht,
   * faellt so ein Fehler sonst erst im GUI auf.
   */
  it('jede Karte hat in BEIDEN Sprachen Titel und Text', () => {
    for (const locale of ['de', 'en'] as const) {
      const t = i18n.getFixedT(locale);
      for (const note of FIELD_NOTES) {
        const title = t(`notes.card.${note.id}.title`);
        const body = t(`notes.card.${note.id}.body`);
        expect(title, `${locale}/${note.id}/title`).not.toBe(`notes.card.${note.id}.title`);
        expect(body, `${locale}/${note.id}/body`).not.toBe(`notes.card.${note.id}.body`);
        // Ein Satz ist keine Feldnotiz; die Landung braucht Platz
        expect(String(body).length, `${locale}/${note.id}/body`).toBeGreaterThan(80);
      }
    }
  });

  it('jede Stufe kommt vor und XP steigen mit der Seltenheit', () => {
    for (const rarity of NOTE_RARITIES) {
      expect(
        FIELD_NOTES.some((n) => n.rarity === rarity),
        rarity,
      ).toBe(true);
    }
    expect(RARITY_XP.common).toBeLessThan(RARITY_XP.rare);
    expect(RARITY_XP.rare).toBeLessThan(RARITY_XP.epic);
    expect(RARITY_XP.epic).toBeLessThan(RARITY_XP.legendary);
  });

  it('noteById findet und erfindet nichts', () => {
    expect(noteById('policy0')?.rarity).toBe('legendary');
    expect(noteById('gibtsnicht')).toBeUndefined();
  });
});

describe('Ziehen', () => {
  /**
   * KEINE DUBLETTEN. Eine Truhe, die etwas ausspuckt, das man schon hat, ist
   * eine Enttaeuschung mit Animation.
   */
  it('zieht nie eine Karte, die man schon hat', () => {
    let owned: string[] = [];
    for (let i = 0; i < FIELD_NOTES.length; i++) {
      const note = drawNote(owned, `chest-${i}`);
      expect(note, `Zug ${i}`).not.toBeNull();
      expect(owned).not.toContain(note?.id);
      owned = [...owned, note?.id ?? ''];
    }
    expect(owned).toHaveLength(FIELD_NOTES.length);
    expect(new Set(owned).size).toBe(FIELD_NOTES.length);
  });

  it('vollstaendige Sammlung ⇒ null, damit der Aufrufer XP zahlen kann', () => {
    const all = FIELD_NOTES.map((n) => n.id);
    expect(drawNote(all, 'whatever')).toBeNull();
  });

  it('ist deterministisch pro Seed', () => {
    expect(drawNote([], 'same')?.id).toBe(drawNote([], 'same')?.id);
  });

  it('verschiedene Seeds liefern nicht immer dieselbe Karte', () => {
    const drawn = new Set(
      Array.from({ length: 30 }, (_, i) => drawNote([], `seed-${i}`)?.id ?? ''),
    );
    expect(drawn.size).toBeGreaterThan(3);
  });

  it('haeufige Stufen kommen haeufiger — sonst waere die Seltenheit bedeutungslos', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const note = drawNote([], `w-${i}`);
      if (note) counts[note.rarity] = (counts[note.rarity] ?? 0) + 1;
    }
    expect(counts.common ?? 0).toBeGreaterThan(counts.legendary ?? 0);
    // aber legendary darf nicht praktisch unerreichbar sein
    expect(counts.legendary ?? 0).toBeGreaterThan(0);
  });
});

describe('Sammlungs-Fortschritt', () => {
  it('leer und vollstaendig sind beide korrekt', () => {
    const empty = collectionProgress([]);
    expect(empty).toMatchObject({ owned: 0, total: FIELD_NOTES.length, complete: false });
    expect(empty.ratio).toBe(0);

    const full = collectionProgress(FIELD_NOTES.map((n) => n.id));
    expect(full).toMatchObject({ owned: FIELD_NOTES.length, complete: true });
    expect(full.ratio).toBe(1);
  });

  it('zaehlt pro Stufe und ignoriert unbekannte IDs', () => {
    const p = collectionProgress(['policy0', 'gibtsnicht']);
    expect(p.owned).toBe(1);
    expect(p.byRarity.legendary.owned).toBe(1);
    expect(p.byRarity.common.owned).toBe(0);
    for (const rarity of NOTE_RARITIES) {
      expect(p.byRarity[rarity].total).toBe(FIELD_NOTES.filter((n) => n.rarity === rarity).length);
    }
  });
});

describe('Anzeigereihenfolge', () => {
  it('seltenste zuerst, und innerhalb der Stufe Besitz vor Mangel', () => {
    const sorted = sortedCollection(['routeFirst']);
    expect(sorted[0]?.id).toBe('routeFirst'); // legendary UND vorhanden
    expect(sorted[1]?.rarity).toBe('legendary');
    expect(sorted).toHaveLength(FIELD_NOTES.length);
    // Stufen bleiben in absteigender Seltenheit gruppiert
    const rank = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev && cur) expect(rank[prev.rarity]).toBeLessThanOrEqual(rank[cur.rarity]);
    }
  });

  it('notesForConcept verbindet Sammlung und Mastery', () => {
    for (const note of notesForConcept('routing')) expect(note.concept).toBe('routing');
    // jedes Konzept hat mindestens eine Karte, sonst waere die Bruecke luecken-
    // haft und ein schwaches Konzept haette nichts zum Nachlesen
    for (const concept of CONCEPTS) {
      expect(notesForConcept(concept).length, concept).toBeGreaterThan(0);
    }
  });
});
