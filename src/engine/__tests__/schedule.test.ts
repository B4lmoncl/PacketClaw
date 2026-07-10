import { describe, expect, it } from 'vitest';
import { matchesWorkHours, scheduleMatches } from '../schedule';

// 2026-07-10 ist ein Freitag, 2026-07-11 Samstag, 2026-07-13 Montag.
describe('matchesWorkHours', () => {
  it('Grenze 07:59 vs. 08:00', () => {
    expect(matchesWorkHours('2026-07-10T07:59:00')).toBe(false);
    expect(matchesWorkHours('2026-07-10T08:00:00')).toBe(true);
  });

  it('Grenze 17:59 vs. 18:00', () => {
    expect(matchesWorkHours('2026-07-10T17:59:59')).toBe(true);
    expect(matchesWorkHours('2026-07-10T18:00:00')).toBe(false);
  });

  it('Freitag ja, Samstag/Sonntag nein, Montag ja', () => {
    expect(matchesWorkHours('2026-07-10T10:00:00')).toBe(true);
    expect(matchesWorkHours('2026-07-11T10:00:00')).toBe(false);
    expect(matchesWorkHours('2026-07-12T10:00:00')).toBe(false);
    expect(matchesWorkHours('2026-07-13T10:00:00')).toBe(true);
  });

  it('akzeptiert auch Leerzeichen als Datums-/Zeit-Trenner', () => {
    expect(matchesWorkHours('2026-07-10 09:30')).toBe(true);
  });

  it('Zeitzonen-Suffix wird ignoriert (Wanduhrzeit zählt)', () => {
    expect(matchesWorkHours('2026-07-10T08:00:00+09:00')).toBe(true);
    expect(matchesWorkHours('2026-07-10T07:00:00Z')).toBe(false);
  });

  it('fehlender oder unlesbarer Timestamp matcht nicht', () => {
    expect(matchesWorkHours(undefined)).toBe(false);
    expect(matchesWorkHours('')).toBe(false);
    expect(matchesWorkHours('gestern mittag')).toBe(false);
  });
});

describe('scheduleMatches', () => {
  it('always matcht immer — auch ohne Timestamp', () => {
    expect(scheduleMatches('always', undefined)).toBe(true);
    expect(scheduleMatches('always', '2026-07-11T03:00:00')).toBe(true);
  });

  it('work-hours delegiert an matchesWorkHours', () => {
    expect(scheduleMatches('work-hours', '2026-07-10T09:00:00')).toBe(true);
    expect(scheduleMatches('work-hours', undefined)).toBe(false);
  });
});
