/**
 * Schedule-Matching. "work-hours" = Mo–Fr 08:00–17:59.
 * Deterministisch: Es zählt die Wanduhrzeit aus dem ISO-String; ein etwaiger
 * Zeitzonen-Suffix wird bewusst ignoriert (Level definieren lokale Zeiten).
 */
import type { ScheduleName } from './types';

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

/** Mo–Fr 08:00:00–17:59:59. Fehlender/unlesbarer Timestamp matcht nicht. */
export function matchesWorkHours(timestamp: string | undefined): boolean {
  if (!timestamp) return false;
  const m = TS_RE.exec(timestamp);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  // Wochentag über UTC-Konstruktion des reinen Datums — unabhängig von der System-TZ.
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = So, 6 = Sa
  if (dow === 0 || dow === 6) return false;
  return hour >= 8 && hour < 18;
}

export function scheduleMatches(schedule: ScheduleName, timestamp: string | undefined): boolean {
  return schedule === 'always' ? true : matchesWorkHours(timestamp);
}
