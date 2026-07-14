import { describe, expect, it } from 'vitest';
import { MATCH_FIELDS, matchClauses } from '../matchLogic';

describe('matchClauses', () => {
  it('liefert die fuenf Match-Felder in Reihenfolge, nur das erste ist "first"', () => {
    const c = matchClauses({
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET', 'MGMT_RANGE'],
      dstaddr: ['all'],
      service: ['WEB'],
    });
    expect(c.map((x) => x.field)).toEqual([...MATCH_FIELDS]);
    expect(c[0]?.first).toBe(true);
    expect(c.slice(1).every((x) => !x.first)).toBe(true);
    // ODER-Gruppe innerhalb eines Feldes bleibt erhalten
    expect(c[2]?.entries).toEqual(['LAN_NET', 'MGMT_RANGE']);
  });

  it('leere Felder ergeben leere OR-Gruppen', () => {
    const c = matchClauses({ srcintf: [], dstintf: [], srcaddr: [], dstaddr: [], service: [] });
    expect(c.every((x) => x.entries.length === 0)).toBe(true);
  });
});
