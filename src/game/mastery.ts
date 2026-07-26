/**
 * Konzept-Mastery: woran scheitert der Spieler eigentlich?
 *
 * Der Sinn ist doppelt und genau deshalb steht das hier hoch auf der Liste:
 *
 *  - LERNEN. Ein Lernspiel, das nicht weiß, wo man schwach ist, kann nur
 *    zufällig üben. Mit Mastery lässt sich gezielt wiederholen.
 *  - RETENTION. Es liefert den ehrlichsten Grund, morgen wieder zu kommen:
 *    nicht „hol dir Punkte", sondern „an DIESEM Konzept hakt es noch".
 *
 * Das Konzept wird NICHT handgepflegt, sondern aus dem Engine-Trace
 * abgeleitet (CLAUDE.md: die Engine ist die Wahrheit). Damit kann die Anzeige
 * nicht von der Realität abweichen.
 */
import type { MatchField, Verdict } from '../engine';

/** Die FortiOS-Kernkonzepte, an denen man scheitern kann. */
export const CONCEPTS = [
  'implicitDeny',
  'firstMatch',
  'interface',
  'address',
  'service',
  'schedule',
  'routing',
  'vip',
  'snat',
] as const;

export type Concept = (typeof CONCEPTS)[number];

/** Welches Match-Feld gehört zu welchem Konzept. */
const FIELD_CONCEPT: Record<MatchField, Concept> = {
  srcintf: 'interface',
  dstintf: 'interface',
  srcaddr: 'address',
  dstaddr: 'address',
  service: 'service',
  schedule: 'schedule',
};

/**
 * Das Konzept, um das es in diesem Verdict WIRKLICH ging.
 *
 * Reihenfolge der Prüfung folgt der Lernrelevanz, nicht der Trace-Reihenfolge:
 *  1. keine Route → Routing, alles andere ist dann egal
 *  2. DNAT beteiligt → VIP, das ist die schwerste Lektion im Spiel
 *  3. Implicit Deny → das Konzept „die Regel, die nicht dasteht"
 *  4. sonst der NAHE TREFFER: das Feld, an dem die Regel direkt über der
 *     Treffer-Regel gescheitert ist. Genau dort verrechnet man sich.
 *  5. gar keine Beinah-Regel → First Match (die erste Regel hat einfach
 *     gepasst, wer falsch lag, hat die Reihenfolge missachtet)
 */
export function conceptOfVerdict(verdict: Verdict): Concept {
  /**
   * Verkehr AN die Firewall zaehlt hier NICHT als „Implicit Deny".
   *
   * Local-In-Verdicts tragen matchedPolicyId 0, weil keine Forward-Policy
   * beteiligt war — die Pruefung darunter wuerde daraus faelschlich die Lektion
   * „die Regel, die nicht dasteht" machen. Local-In hat kein eigenes
   * Mastery-Konzept (die Review-Aufgaben decken nur Forward-Traffic ab), also
   * ist das naechstgelegene ehrliche Konzept das Interface.
   */
  if (verdict.localIn !== undefined) return 'interface';
  if (verdict.trace.some((s) => s.kind === 'no-route')) return 'routing';
  if (verdict.trace.some((s) => s.kind === 'dnat')) return 'vip';
  if (verdict.matchedPolicyId === 0) return 'implicitDeny';

  const matchIndex = verdict.trace.findIndex((s) => s.kind === 'policy-match');
  if (matchIndex > 0) {
    // rückwärts vom Treffer den letzten Beinah-Treffer suchen
    for (let i = matchIndex - 1; i >= 0; i--) {
      const step = verdict.trace[i];
      if (step?.kind === 'policy-no-match') return FIELD_CONCEPT[step.failedField];
    }
  }
  if (verdict.natApplied) return 'snat';
  return 'firstMatch';
}

// ---------------------------------------------------------------------------
// Mastery-Stand
// ---------------------------------------------------------------------------

export interface ConceptStat {
  correct: number;
  wrong: number;
}

export type MasteryMap = Partial<Record<Concept, ConceptStat>>;

export interface ConceptMastery {
  concept: Concept;
  correct: number;
  wrong: number;
  attempts: number;
  /** 0..1; ohne Versuche 0 */
  accuracy: number;
  /** true, solange zu wenige Versuche für eine Aussage vorliegen */
  unproven: boolean;
}

/** Ab so vielen Versuchen traut sich die Anzeige eine Aussage zu. */
export const MIN_ATTEMPTS = 4;

/**
 * Zähler aus dem Save robust lesen. Saves wandern über das Backend und über
 * Versionsgrenzen; ein fehlendes oder kaputtes Feld darf keine „9 von NaN
 * richtig" ins GUI schreiben. Lieber ein ehrliches 0 als eine Zahl, die es
 * nicht gibt.
 */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function conceptMastery(mastery: MasteryMap, concept: Concept): ConceptMastery {
  const stat = mastery[concept];
  const correct = count(stat?.correct);
  const wrong = count(stat?.wrong);
  const attempts = correct + wrong;
  return {
    concept,
    correct,
    wrong,
    attempts,
    accuracy: attempts > 0 ? correct / attempts : 0,
    unproven: attempts < MIN_ATTEMPTS,
  };
}

export function allMastery(mastery: MasteryMap): ConceptMastery[] {
  return CONCEPTS.map((c) => conceptMastery(mastery, c));
}

/**
 * Die schwächsten Konzepte MIT ausreichender Datenbasis. Ein Konzept mit
 * einem einzigen Fehlversuch ist keine Schwäche, sondern ein Ausrutscher —
 * es hier zu melden wäre bloß Rauschen.
 */
export function weakestConcepts(mastery: MasteryMap, limit = 3): ConceptMastery[] {
  return allMastery(mastery)
    .filter((m) => !m.unproven && m.accuracy < 1)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, limit);
}

/** Konzepte, die noch gar nicht genug vorkamen — Stoff, den man noch nicht kennt. */
export function untestedConcepts(mastery: MasteryMap): ConceptMastery[] {
  return allMastery(mastery).filter((m) => m.unproven);
}

// ---------------------------------------------------------------------------
// Bewegung
// ---------------------------------------------------------------------------

export interface MasteryDelta {
  concept: Concept;
  before: number;
  after: number;
  /** after - before; kann negativ sein, das wird ehrlich angezeigt */
  change: number;
  attemptsAdded: number;
  /** vorher noch ohne Datenbasis, jetzt belegt — der erste echte Messwert */
  newlyProven: boolean;
}

/**
 * Was sich zwischen zwei Ständen bewegt hat.
 *
 * Der eigentliche Lohn einer Übungssitzung ist nicht „4 von 5 richtig",
 * sondern „Adressobjekte 33 % → 50 %". Punkte verpuffen, eine Zahl, die sich
 * bewegt, bleibt. Konzepte ohne neue Versuche kommen nicht vor — eine Zeile
 * mit ±0 wäre nur Füllmaterial.
 *
 * Ein Rückschritt wird NICHT unterdrückt: wer vorher zufällig richtig geraten
 * hat, soll sehen, dass die Zahl wieder sinkt. Sonst wäre die Messung eine
 * Schmeichelei.
 */
export function masteryDeltas(before: MasteryMap, after: MasteryMap): MasteryDelta[] {
  const deltas: MasteryDelta[] = [];
  for (const concept of CONCEPTS) {
    const a = conceptMastery(before, concept);
    const b = conceptMastery(after, concept);
    const attemptsAdded = b.attempts - a.attempts;
    if (attemptsAdded <= 0) continue;
    deltas.push({
      concept,
      before: a.accuracy,
      after: b.accuracy,
      change: b.accuracy - a.accuracy,
      attemptsAdded,
      newlyProven: a.unproven && !b.unproven,
    });
  }
  // Größte Bewegung zuerst — das ist die Zeile, die man lesen soll. Bei
  // gleichem Betrag steht der Fortschritt vor dem Rückschritt: der Abschnitt
  // ist die Belohnung der Sitzung, nicht ihr Zeugnis.
  return deltas.sort(
    (x, y) => Math.abs(y.change) - Math.abs(x.change) || Math.sign(y.change) - Math.sign(x.change),
  );
}

/** Gesamt-Mastery über alle belegten Konzepte, 0..1. */
export function overallMastery(mastery: MasteryMap): number {
  const proven = allMastery(mastery).filter((m) => !m.unproven);
  if (proven.length === 0) return 0;
  return proven.reduce((sum, m) => sum + m.accuracy, 0) / proven.length;
}
