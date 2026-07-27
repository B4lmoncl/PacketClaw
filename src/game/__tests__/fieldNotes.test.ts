import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { CONCEPTS } from '../mastery';
import {
  claimableTopics,
  collectionProgress,
  drawNote,
  FIELD_NOTES,
  NOTE_RARITIES,
  noteById,
  NOTE_TOPICS,
  notesForConcept,
  notesForTopic,
  RARITY_XP,
  sortedCollection,
  TOPIC_BONUS,
  topicProgress,
} from '../fieldNotes';

describe('Katalog', () => {
  it('IDs sind einzigartig', () => {
    const ids = FIELD_NOTES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jede Karte hat eine bekannte Stufe und ein bekanntes Thema', () => {
    for (const note of FIELD_NOTES) {
      expect(NOTE_RARITIES, note.id).toContain(note.rarity);
      expect(NOTE_TOPICS, note.id).toContain(note.topic);
    }
  });

  /**
   * concept ist optional, aber wenn es dasteht, muss es echt sein — sonst
   * verweist die Bruecke zur Mastery auf ein Konzept, das es nicht gibt.
   */
  it('ein gesetztes Konzept ist immer ein echtes', () => {
    for (const note of FIELD_NOTES) {
      if (note.concept !== undefined) expect(CONCEPTS, note.id).toContain(note.concept);
    }
  });

  /**
   * DHCP, DNS und HA entscheiden kein Paket. Ihnen ein Verdict-Konzept
   * anzudichten wuerde die Mastery-Messung verfaelschen — sie misst, woran man
   * beim BEURTEILEN von Verkehr scheitert.
   */
  it('ops-Karten tragen bewusst KEIN Verdict-Konzept', () => {
    const ops = notesForTopic('ops');
    expect(ops.length).toBeGreaterThan(0);
    for (const note of ops) expect(note.concept, note.id).toBeUndefined();
  });

  it('forward- und localIn-Karten tragen immer ein Konzept', () => {
    for (const topic of ['forward', 'localIn'] as const) {
      const cards = notesForTopic(topic);
      expect(cards.length, topic).toBeGreaterThan(0);
      for (const note of cards) expect(note.concept, `${topic}/${note.id}`).toBeDefined();
    }
  });

  it('jede Karte gehoert zu genau einem Thema — die Themen ueberdecken alles', () => {
    const sum = NOTE_TOPICS.reduce((n, topic) => n + notesForTopic(topic).length, 0);
    expect(sum).toBe(FIELD_NOTES.length);
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

  /**
   * Die Karte zeigt oben rechts das Konzept — oder, wenn es keines gibt, das
   * Thema. Fehlt beides in i18n, stand dort „mastery.concept.undefined" im GUI.
   * Genau das ist beim Einbau der ops-Karten passiert.
   */
  it('jede Karte hat eine aufloesbare Kopfzeile in beiden Sprachen', () => {
    for (const locale of ['de', 'en'] as const) {
      const t = i18n.getFixedT(locale);
      for (const note of FIELD_NOTES) {
        const key = note.concept ? `mastery.concept.${note.concept}` : `notes.topic.${note.topic}`;
        const label = t(key);
        expect(label, `${locale}/${note.id}`).not.toBe(key);
        expect(String(label).toLowerCase(), `${locale}/${note.id}`).not.toContain('undefined');
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

/**
 * 36 Karten bei einer Truhe alle fuenf Aufgaben sind 180 geloeste Aufgaben bis
 * zur Vollstaendigkeit — eine einzige, weit entfernte Ziellinie. Drei Saetze
 * machen daraus drei erreichbare Ziele.
 */
describe('Satz-Belohnungen', () => {
  const ALL = FIELD_NOTES.map((n) => n.id);

  it('jeder Satz hat eine Belohnung, und groessere Saetze zahlen mehr', () => {
    for (const topic of NOTE_TOPICS) {
      expect(TOPIC_BONUS[topic], topic).toBeGreaterThan(0);
    }
    const bySize = [...NOTE_TOPICS].sort(
      (a, b) => notesForTopic(a).length - notesForTopic(b).length,
    );
    for (let i = 1; i < bySize.length; i++) {
      const small = bySize[i - 1] as (typeof NOTE_TOPICS)[number];
      const big = bySize[i] as (typeof NOTE_TOPICS)[number];
      expect(TOPIC_BONUS[big], `${big} vs ${small}`).toBeGreaterThanOrEqual(TOPIC_BONUS[small]);
    }
  });

  it('leere Sammlung: kein Satz vollstaendig, nichts abholbar', () => {
    const sets = topicProgress([]);
    expect(sets).toHaveLength(NOTE_TOPICS.length);
    expect(sets.every((s) => !s.complete)).toBe(true);
    expect(claimableTopics([])).toEqual([]);
  });

  it('ein vollstaendiger Satz wird als abholbar gemeldet', () => {
    const localIn = notesForTopic('localIn').map((n) => n.id);
    const claim = claimableTopics(localIn);
    expect(claim.map((c) => c.topic)).toEqual(['localIn']);
    expect(claim[0]?.bonus).toBe(TOPIC_BONUS.localIn);
  });

  it('eine fehlende Karte genuegt, damit der Satz NICHT zaehlt', () => {
    const localIn = notesForTopic('localIn').map((n) => n.id);
    expect(claimableTopics(localIn.slice(1))).toEqual([]);
  });

  it('abgeholte Saetze tauchen nicht wieder auf', () => {
    const localIn = notesForTopic('localIn').map((n) => n.id);
    expect(claimableTopics(localIn, ['localIn'])).toEqual([]);
    const sets = topicProgress(localIn, ['localIn']);
    expect(sets.find((s) => s.topic === 'localIn')).toMatchObject({
      complete: true,
      claimed: true,
    });
  });

  it('vollstaendige Sammlung ⇒ alle Saetze abholbar', () => {
    expect(
      claimableTopics(ALL)
        .map((c) => c.topic)
        .sort(),
    ).toEqual([...NOTE_TOPICS].sort());
  });

  /**
   * Der kleinste Satz muss frueh erreichbar sein — er ist der Beweis, dass es
   * die Belohnung wirklich gibt.
   */
  it('der kleinste Satz ist deutlich kleiner als die Sammlung', () => {
    const smallest = Math.min(...NOTE_TOPICS.map((t) => notesForTopic(t).length));
    expect(smallest).toBeLessThanOrEqual(FIELD_NOTES.length / 4);
  });
});
