import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_GOAL } from '../rewards';
import { WEEK_REWARDS } from '../dailyQuests';
import { todayString } from '../daily';
import { EMPTY_STATS } from '../progression';
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

/**
 * Der Wochenmeilenstein stand in der Anzeige („Tag 5 von sieben +240") und kam
 * nie an — ein Versprechen, das das Spiel jeden Tag gemacht und jeden Tag
 * gebrochen hat. Diese Tests halten die Auszahlung fest.
 */
describe('Wochenmeilenstein wird ausgezahlt', () => {
  beforeEach(() => {
    useGame.setState({
      xp: 0,
      dailyXp: { date: '', xp: 0 },
      tasksSolved: 0,
      streak: { current: 0, best: 0, lastDate: null, freezeTokens: 0 },
      achievements: [],
    });
  });

  it('erster Tag: Aufgaben-XP PLUS die Belohnung von Tag 1', () => {
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL);
    expect(useGame.getState().streak.current).toBe(1);
    expect(useGame.getState().xp).toBe(DEFAULT_DAILY_GOAL + WEEK_REWARDS[0]);
  });

  it('die Belohnung steigt mit dem Tag im Zyklus', () => {
    // Serie steht auf 4, gestern zuletzt gezaehlt ⇒ heute wird Tag 5
    useGame.setState({
      streak: { current: 4, best: 4, lastDate: yesterday(), freezeTokens: 0 },
      xp: 0,
      dailyXp: { date: '', xp: 0 },
    });
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL);
    expect(useGame.getState().streak.current).toBe(5);
    expect(useGame.getState().xp).toBe(DEFAULT_DAILY_GOAL + WEEK_REWARDS[4]);
  });

  it('derselbe Tag kassiert NICHT doppelt, egal wie viel noch gespielt wird', () => {
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL);
    const afterFirst = useGame.getState().xp;
    useGame.getState().recordDnat(100);
    useGame.getState().recordRouting(100);
    // nur die reinen Aufgaben-XP kommen dazu, kein weiterer Wochenbonus
    expect(useGame.getState().xp).toBe(afterFirst + 200);
  });

  it('ohne erreichtes Tagesziel gibt es keinen Wochenbonus', () => {
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL - 1);
    expect(useGame.getState().xp).toBe(DEFAULT_DAILY_GOAL - 1);
  });

  /**
   * Der Bonus zaehlt bewusst NICHT ins Tagesziel: der Ring soll 300/300 zeigen
   * und nicht 540/300 — er misst, was man erspielt hat, nicht, was daraus folgt.
   */
  it('der Bonus laeuft nicht in die Tages-XP des Ziels', () => {
    useGame.getState().recordDoctor(DEFAULT_DAILY_GOAL);
    expect(useGame.getState().dailyXp.xp).toBe(DEFAULT_DAILY_GOAL);
  });
});

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Drei Modi hatten ihre eigene Kopie der Belohnungslogik, und alle drei waren
 * falsch. Diese Tests halten fest, dass es jetzt genau einen Zahlweg gibt.
 */
describe('jeder Modus fuettert denselben Belohnungs-Loop', () => {
  beforeEach(() => {
    useGame.setState({
      xp: 0,
      dailyXp: { date: '', xp: 0 },
      tasksSolved: 0,
      stars: {},
      bestScores: {},
      dailyHistory: {},
      endlessBest: { rounds: 0, score: 0 },
      streak: { current: 0, best: 0, lastDate: null, freezeTokens: 0 },
      // stats MUSS mit zurueck: dailiesPlayed/-Perfect wandern sonst von Test
      // zu Test weiter und die Zusicherungen messen die Vorgeschichte
      stats: { ...EMPTY_STATS },
      achievements: [],
    });
  });

  it('ENDLOS zaehlte fuer nichts: kein Tagesziel, keine Truhe, keine Serie', () => {
    useGame.getState().recordEndless(12, DEFAULT_DAILY_GOAL);
    const s = useGame.getState();
    expect(s.dailyXp.xp).toBe(DEFAULT_DAILY_GOAL);
    expect(s.tasksSolved).toBe(1);
    expect(s.streak.current).toBe(1);
    expect(s.xp).toBe(DEFAULT_DAILY_GOAL + WEEK_REWARDS[0]);
    expect(s.endlessBest).toEqual({ rounds: 12, score: DEFAULT_DAILY_GOAL });
  });

  it('KAMPAGNE zahlte keinen Wochenbonus', () => {
    useGame.getState().recordLevelResult('ch1-l1', 3, DEFAULT_DAILY_GOAL);
    const s = useGame.getState();
    expect(s.xp).toBe(DEFAULT_DAILY_GOAL + WEEK_REWARDS[0]);
    expect(s.streak.current).toBe(1);
    // Sterne und Bestwert bleiben trotz Umbau erhalten
    expect(s.stars['ch1-l1']).toBe(3);
    expect(s.bestScores['ch1-l1']).toBe(DEFAULT_DAILY_GOAL);
  });

  it('Sterne gehen nie zurueck, auch bei schwaecherem Durchlauf', () => {
    useGame.getState().recordLevelResult('ch1-l1', 3, 500);
    useGame.getState().recordLevelResult('ch1-l1', 1, 100);
    expect(useGame.getState().stars['ch1-l1']).toBe(3);
    expect(useGame.getState().bestScores['ch1-l1']).toBe(500);
  });

  /**
   * Der Daily Run ist der EINE Fall, der den Tag unabhaengig vom XP-Stand
   * sichert — das Ding heisst „Daily". Vorher lief er an der Regel vorbei UND
   * bekam keinen Wochenbonus.
   */
  it('DAILY RUN sichert den Tag auch unter dem Tagesziel — mit Wochenbonus', () => {
    const today = todayString();
    useGame.getState().recordDaily(today, [true, true, false], 50);
    const s = useGame.getState();
    expect(s.streak.current).toBe(1);
    expect(s.xp).toBe(50 + WEEK_REWARDS[0]);
    expect(s.stats.dailiesPlayed).toBe(1);
    expect(s.dailyHistory[today]).toEqual([true, true, false]);
  });

  it('der Daily zaehlt pro Tag nur einmal — kein zweiter Wochenbonus', () => {
    const today = todayString();
    useGame.getState().recordDaily(today, [true], 50);
    const after = useGame.getState().xp;
    useGame.getState().recordDaily(today, [true], 50);
    expect(useGame.getState().xp).toBe(after);
    expect(useGame.getState().stats.dailiesPlayed).toBe(1);
  });

  it('perfekter Daily wird als perfekt gezaehlt', () => {
    useGame.getState().recordDaily(todayString(), [true, true, true], 400);
    expect(useGame.getState().stats.dailiesPerfect).toBe(1);
  });
});
