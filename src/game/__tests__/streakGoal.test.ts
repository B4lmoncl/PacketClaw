import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_GOAL } from '../rewards';
import { todayString } from '../daily';
import { useGame } from '../store';

/**
 * Die Streak-Regel ist eine Retention-Entscheidung, nicht Kosmetik: die Serie
 * zaehlt, sobald das TAGESZIEL erreicht ist — in JEDEM Modus. Vorher hing sie
 * allein am Daily Run, wer also nur Doctor-Faelle loeste, verlor die Serie.
 */
describe('Streak haengt am Tagesziel', () => {
  beforeEach(() => {
    useGame.setState({
      xp: 0,
      dailyXp: { date: '', xp: 0 },
      tasksSolved: 0,
      streak: { current: 0, best: 0, lastDate: null, freezeTokens: 0 },
      stats: { ...useGame.getState().stats },
      achievements: [],
    });
  });

  it('unter dem Tagesziel bleibt die Serie bei 0', () => {
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL - 50);
    expect(useGame.getState().streak.current).toBe(0);
    expect(useGame.getState().dailyXp.xp).toBe(DEFAULT_DAILY_GOAL - 50);
  });

  it('Tagesziel im Config Doctor erreicht ⇒ Serie zaehlt (ohne Daily Run)', () => {
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL);
    const streak = useGame.getState().streak;
    expect(streak.current).toBe(1);
    expect(streak.lastDate).toBe(todayString());
  });

  it('mehrere Aufgaben summieren sich bis zum Ziel', () => {
    const third = Math.ceil(DEFAULT_DAILY_GOAL / 3);
    useGame.getState().recordRouting(third);
    expect(useGame.getState().streak.current).toBe(0);
    useGame.getState().recordRouting(third);
    expect(useGame.getState().streak.current).toBe(0);
    useGame.getState().recordRouting(third);
    expect(useGame.getState().streak.current).toBe(1);
  });

  it('weiterspielen am selben Tag zaehlt die Serie NICHT doppelt', () => {
    useGame.getState().recordDnat(DEFAULT_DAILY_GOAL);
    expect(useGame.getState().streak.current).toBe(1);
    useGame.getState().recordDnat(DEFAULT_DAILY_GOAL);
    useGame.getState().recordDesign(DEFAULT_DAILY_GOAL);
    expect(useGame.getState().streak.current).toBe(1);
  });

  it('jede Aufgabe zaehlt fuer Truhen und Tages-XP mit', () => {
    useGame.getState().recordBlitz(50);
    useGame.getState().recordMatchCheck(50);
    expect(useGame.getState().tasksSolved).toBe(2);
    expect(useGame.getState().dailyXp.xp).toBe(100);
  });
});
