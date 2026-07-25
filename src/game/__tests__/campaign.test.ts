import { describe, expect, it } from 'vitest';
import type { Level } from '../levels';
import { campaignProgress, nextLevel } from '../campaign';

// Synthetische Level-Liste (bereits sortiert wie allLevels: Kapitel, dann Index)
const lv = (chapter: number, index: number): Level =>
  ({
    id: `ch${chapter}-l${String(index).padStart(2, '0')}`,
    chapter,
    index,
    mode: 'verdict',
    title: { de: 'T', en: 'T' },
  }) as Level;

const LEVELS: Level[] = [lv(1, 1), lv(1, 2), lv(1, 3), lv(2, 1), lv(2, 2)];

describe('Kampagnen-Fortschritt', () => {
  it('leerer Save: naechstes Level ist das allererste', () => {
    expect(nextLevel({}, LEVELS)?.id).toBe('ch1-l01');
  });

  it('springt hinter die geschafften Level (auch ueber Kapitelgrenzen)', () => {
    const stars = { 'ch1-l01': 3, 'ch1-l02': 1, 'ch1-l03': 2 };
    expect(nextLevel(stars, LEVELS)?.id).toBe('ch2-l01');
  });

  it('Luecke im Fortschritt: das offene Level davor gewinnt', () => {
    // l02 uebersprungen (0 Sterne), l03 geschafft → Grenze ist l02
    const stars = { 'ch1-l01': 3, 'ch1-l03': 3 };
    expect(nextLevel(stars, LEVELS)?.id).toBe('ch1-l02');
  });

  it('0 Sterne zaehlt NICHT als geschafft (angefangen ist nicht geschafft)', () => {
    expect(nextLevel({ 'ch1-l01': 0 }, LEVELS)?.id).toBe('ch1-l01');
  });

  it('alles geschafft: kein naechstes Level', () => {
    const stars = Object.fromEntries(LEVELS.map((l) => [l.id, 3]));
    expect(nextLevel(stars, LEVELS)).toBeUndefined();
  });

  it('Fortschritt zaehlt Level und Sterne', () => {
    const stars = { 'ch1-l01': 3, 'ch1-l02': 1 };
    const p = campaignProgress(stars, LEVELS);
    expect(p).toMatchObject({ completed: 2, total: 5, starsEarned: 4, maxStars: 15 });
    expect(p.next?.id).toBe('ch1-l03');
  });

  it('verwaiste IDs im Save und Ausreisser-Werte verfaelschen die Sterne nicht', () => {
    const stars = { 'ch1-l01': 99, 'ch9-l01': 3, 'ch1-l02': -5 };
    const p = campaignProgress(stars, LEVELS);
    expect(p.starsEarned).toBe(3); // 99 auf 3 geklemmt, fremde ID ignoriert, -5 auf 0
    expect(p.completed).toBe(1);
  });

  it('nutzt standardmaessig die echte Level-Liste (Content vorhanden)', () => {
    const p = campaignProgress({});
    expect(p.total).toBeGreaterThan(0);
    expect(p.next?.chapter).toBe(1);
  });
});
