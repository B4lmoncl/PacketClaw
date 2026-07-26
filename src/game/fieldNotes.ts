/**
 * Feldnotizen — das, was in den Truhen liegt.
 *
 * WARUM DAS EXISTIERT. Eine Truhe gab bisher XP. XP gibt es aber für alles,
 * also war die Truhe eine lautere Version von dem, was ohnehin passiert. Für
 * eine variable Belohnung muss der INHALT variieren, nicht der Betrag.
 *
 * Eine Feldnotiz ist eine Sammelkarte mit genau einer echten FortiOS-Wahrheit
 * darauf. Damit zieht sie in beide Richtungen:
 *  - RETENTION: eine Sammlung mit Lücken ist ein Grund zurückzukommen, und die
 *    Lücken sind sichtbar.
 *  - LERNEN (Oberste Direktive): jede Karte ist ein Satz Betriebswissen, das
 *    auf einer echten FortiGate stimmt. Keine Deko.
 *
 * Der Text steht in den i18n-Dateien (`notes.<id>.title` / `.body`), damit die
 * Karten zweisprachig sind. Hier steht nur, WAS es gibt und wie gezogen wird.
 */
import { createRng } from '../engine';
import type { Concept } from './mastery';

export const NOTE_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type NoteRarity = (typeof NOTE_RARITIES)[number];

/**
 * Themenbereiche der Sammlung. `forward` und `localIn` haben ein
 * Mastery-Konzept; `ops` ist Betriebswissen, das mit der Paketentscheidung
 * nichts zu tun hat (DHCP, DNS, HA).
 */
export const NOTE_TOPICS = ['forward', 'localIn', 'ops'] as const;
export type NoteTopic = (typeof NOTE_TOPICS)[number];

export interface FieldNote {
  id: string;
  rarity: NoteRarity;
  /**
   * Das Konzept, zu dem die Karte gehört — die Brücke zwischen Sammlung und
   * Mastery.
   *
   * OPTIONAL, und das ist eine bewusste Entscheidung: DHCP, DNS und HA sind
   * echtes FortiGate-Wissen, aber sie entscheiden kein Paket. Ihnen ein
   * Verdict-Konzept anzudichten, damit das Feld gefüllt ist, würde die
   * Mastery-Messung verfälschen — sie misst, woran man beim Beurteilen von
   * Verkehr scheitert. Karten ohne Konzept sind Nachschlagewerk, kein Messwert.
   */
  concept?: Concept;
  topic: NoteTopic;
}

/**
 * Der Katalog. Die Seltenheit folgt der Lernrelevanz, nicht dem Zufall: die
 * beiden Legendaries sind die zwei Einsichten, an denen sich echte
 * Fehlersuchen entscheiden (Policy 0 und „Route vor Policy").
 */
export const FIELD_NOTES: FieldNote[] = [
  // legendary — die zwei Lektionen, die alles andere sortieren
  { id: 'policy0', rarity: 'legendary', concept: 'implicitDeny', topic: 'forward' },
  { id: 'routeFirst', rarity: 'legendary', concept: 'routing', topic: 'forward' },

  // Local-In: die Asymmetrie ist so grundlegend wie Policy 0 selbst
  { id: 'localInAccept', rarity: 'legendary', concept: 'interface', topic: 'localIn' },

  // epic
  { id: 'allowaccess', rarity: 'epic', concept: 'interface', topic: 'localIn' },
  { id: 'trusthost', rarity: 'epic', concept: 'interface', topic: 'localIn' },
  { id: 'vipOnly', rarity: 'epic', concept: 'vip', topic: 'forward' },
  { id: 'prednatPort', rarity: 'epic', concept: 'service', topic: 'forward' },
  { id: 'shadowing', rarity: 'epic', concept: 'firstMatch', topic: 'forward' },
  { id: 'sessionTable', rarity: 'epic', concept: 'firstMatch', topic: 'forward' },

  // rare
  { id: 'firstMatch', rarity: 'rare', concept: 'firstMatch', topic: 'forward' },
  { id: 'objectNotName', rarity: 'rare', concept: 'address', topic: 'forward' },
  { id: 'noNatNoReturn', rarity: 'rare', concept: 'snat', topic: 'forward' },
  { id: 'debugFlow', rarity: 'rare', concept: 'routing', topic: 'forward' },
  { id: 'intrazone', rarity: 'rare', concept: 'interface', topic: 'forward' },
  { id: 'anyAnyAll', rarity: 'rare', concept: 'service', topic: 'forward' },
  { id: 'fqdnMoves', rarity: 'rare', concept: 'address', topic: 'forward' },
  { id: 'midnightSchedule', rarity: 'rare', concept: 'schedule', topic: 'forward' },

  // ops — echtes Betriebswissen ohne Verdict-Konzept (DHCP, DNS, HA)
  { id: 'haSyncNotConfig', rarity: 'legendary', topic: 'ops' },
  { id: 'haOverride', rarity: 'epic', topic: 'ops' },
  { id: 'dhcpLease', rarity: 'epic', topic: 'ops' },
  { id: 'dnsResolverVsProxy', rarity: 'rare', topic: 'ops' },
  { id: 'dhcpRelay', rarity: 'rare', topic: 'ops' },
  { id: 'dnsTtl', rarity: 'rare', topic: 'ops' },
  { id: 'dhcpReserve', rarity: 'common', topic: 'ops' },
  { id: 'haHeartbeat', rarity: 'common', topic: 'ops' },
  { id: 'dnsSplit', rarity: 'common', topic: 'ops' },

  // common
  { id: 'interfaceAny', rarity: 'common', concept: 'interface', topic: 'forward' },
  { id: 'zoneTradeoff', rarity: 'common', concept: 'interface', topic: 'forward' },
  { id: 'hitCountZero', rarity: 'common', concept: 'firstMatch', topic: 'forward' },
  { id: 'policyIdNotOrder', rarity: 'common', concept: 'firstMatch', topic: 'forward' },
  { id: 'disabledRule', rarity: 'common', concept: 'firstMatch', topic: 'forward' },
  { id: 'addressGroup', rarity: 'common', concept: 'address', topic: 'forward' },
  { id: 'denyNoLog', rarity: 'common', concept: 'implicitDeny', topic: 'forward' },
  { id: 'serviceAll', rarity: 'common', concept: 'service', topic: 'forward' },
  { id: 'policyLookup', rarity: 'common', concept: 'routing', topic: 'forward' },
  { id: 'scheduleLooksOn', rarity: 'common', concept: 'schedule', topic: 'forward' },
];

/** Zusatz-XP nach Seltenheit — die Karte ist der Lohn, das XP nur die Beilage. */
export const RARITY_XP: Record<NoteRarity, number> = {
  common: 20,
  rare: 45,
  epic: 90,
  legendary: 180,
};

/**
 * Ziehgewichte. Legendary bleibt selten genug, dass die Karte etwas bedeutet,
 * aber nicht so selten, dass sie nie kommt — bei 24 Karten wäre 1 % nur
 * Frustration mit Extraschritten.
 */
const WEIGHT: Record<NoteRarity, number> = {
  common: 50,
  rare: 28,
  epic: 16,
  legendary: 6,
};

export function noteById(id: string): FieldNote | undefined {
  return FIELD_NOTES.find((n) => n.id === id);
}

/**
 * Zieht eine noch nicht besessene Karte.
 *
 * KEINE DUBLETTEN. Eine Truhe, die etwas ausspuckt, das man schon hat, ist
 * eine Enttäuschung mit Animation. Deshalb wird ausschließlich aus dem
 * offenen Rest gezogen; ist der leer, gibt die Truhe null zurück und der
 * Aufrufer zahlt stattdessen XP aus.
 */
export function drawNote(owned: readonly string[], seed: string): FieldNote | null {
  const pool = FIELD_NOTES.filter((n) => !owned.includes(n.id));
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, n) => sum + WEIGHT[n.rarity], 0);
  const rng = createRng(`aethergate-note-${seed}`);
  let ticket = rng.next() * total;
  for (const note of pool) {
    ticket -= WEIGHT[note.rarity];
    if (ticket <= 0) return note;
  }
  // Rundungsrest: die letzte Karte ist genauso gültig wie jede andere
  return pool[pool.length - 1] ?? null;
}

export interface CollectionProgress {
  owned: number;
  total: number;
  /** 0..1 */
  ratio: number;
  byRarity: Record<NoteRarity, { owned: number; total: number }>;
  complete: boolean;
}

export function collectionProgress(owned: readonly string[]): CollectionProgress {
  const byRarity = {} as Record<NoteRarity, { owned: number; total: number }>;
  for (const rarity of NOTE_RARITIES) byRarity[rarity] = { owned: 0, total: 0 };
  let ownedCount = 0;
  for (const note of FIELD_NOTES) {
    const bucket = byRarity[note.rarity];
    bucket.total += 1;
    if (owned.includes(note.id)) {
      bucket.owned += 1;
      ownedCount += 1;
    }
  }
  return {
    owned: ownedCount,
    total: FIELD_NOTES.length,
    ratio: FIELD_NOTES.length > 0 ? ownedCount / FIELD_NOTES.length : 0,
    byRarity,
    complete: ownedCount >= FIELD_NOTES.length,
  };
}

/**
 * Die Sammlung in Anzeigereihenfolge: seltenste zuerst, innerhalb einer
 * Stufe die eigenen vor den fehlenden. Die Lücke soll auffallen, aber die
 * Karten, die man hat, sollen zuerst zu sehen sein — Besitz vor Mangel.
 */
export function sortedCollection(owned: readonly string[]): (FieldNote & { owned: boolean })[] {
  const rank: Record<NoteRarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
  return FIELD_NOTES.map((n) => ({ ...n, owned: owned.includes(n.id) })).sort(
    (a, b) => rank[a.rarity] - rank[b.rarity] || Number(b.owned) - Number(a.owned),
  );
}

/** Karten zu einem Konzept — verbindet die Schwachstellen-Anzeige mit der Sammlung. */
export function notesForConcept(concept: Concept): FieldNote[] {
  return FIELD_NOTES.filter((n) => n.concept === concept);
}

/** Karten eines Themenbereichs — fuer die Gliederung im Archiv. */
export function notesForTopic(topic: NoteTopic): FieldNote[] {
  return FIELD_NOTES.filter((n) => n.topic === topic);
}
