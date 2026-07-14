/**
 * Match-Logik einer Policy als AND/OR-Struktur — wie FortiOS 7.6 sie im GUI
 * anzeigt ("displays logic between firewall policy objects"): ZWISCHEN den
 * Feldern gilt UND (alle müssen passen), INNERHALB eines Feldes ODER (irgend-
 * ein Eintrag reicht). Pure Funktion → die UI rendert nur.
 */
export const MATCH_FIELDS = ['srcintf', 'dstintf', 'srcaddr', 'dstaddr', 'service'] as const;
export type MatchFieldKey = (typeof MATCH_FIELDS)[number];

export interface MatchClause {
  field: MatchFieldKey;
  /** OR-Gruppe: irgendeiner dieser Einträge muss passen */
  entries: string[];
  /** true = erste Klausel ("Any of"); sonst UND-verknüpft ("And any of") */
  first: boolean;
}

export function matchClauses(fields: Record<MatchFieldKey, string[]>): MatchClause[] {
  return MATCH_FIELDS.map((field, i) => ({
    field,
    entries: fields[field] ?? [],
    first: i === 0,
  }));
}
