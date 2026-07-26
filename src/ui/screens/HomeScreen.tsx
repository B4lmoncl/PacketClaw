import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { campaignProgress } from '../../game/campaign';
import { todayString } from '../../game/daily';
import { nearestAchievements, rankFor } from '../../game/progression';
import { CHEST_EVERY, chestsEarned, dailyGoal } from '../../game/rewards';
import {
  ALL_DONE_BONUS_XP,
  allQuestsDone,
  QUEST_POOL,
  questProgress,
  weekMilestone,
} from '../../game/dailyQuests';
import { freshUnlocks, isUnlocked, nextUnlock, unlockStateFor, UNLOCKS } from '../../game/unlocks';
import { readQuestCounters, useGame } from '../../game/store';
import { overallMastery, untestedConcepts, weakestConcepts } from '../../game/mastery';
import type { Screen } from '../../game/store';
import { DailyGoalRing } from '../components/DailyGoalRing';
import { DailyQuests } from '../components/DailyQuests';
import { Mascot } from '../components/Mascot';
import { MasteryPanel } from '../components/MasteryPanel';
import { NextBadges } from '../components/NextBadges';
import { RewardOverlay } from '../components/RewardOverlay';
import type { RewardPayload } from '../components/RewardOverlay';

type Accent = 'claw' | 'warn' | 'deny' | 'trace' | 'aura';

const ACCENT: Record<Accent, { chip: string; ring: string; arrow: string }> = {
  claw: {
    chip: 'bg-claw/15 text-claw',
    ring: 'hover:border-claw/70 hover:shadow-glow-claw',
    arrow: 'text-claw',
  },
  warn: {
    chip: 'bg-warn/15 text-warn',
    ring: 'hover:border-warn/70 hover:shadow-glow-warn',
    arrow: 'text-warn',
  },
  deny: {
    chip: 'bg-deny/15 text-deny',
    ring: 'hover:border-deny/70 hover:shadow-glow-deny',
    arrow: 'text-deny',
  },
  trace: {
    chip: 'bg-trace/15 text-trace',
    ring: 'hover:border-trace/70 hover:shadow-glow-trace',
    arrow: 'text-trace',
  },
  aura: {
    chip: 'bg-aura/15 text-aura',
    ring: 'hover:border-aura/70 hover:shadow-glow-aura',
    arrow: 'text-aura',
  },
};

interface Mode {
  screen: Screen;
  key: string;
  icon: string;
  accent: Accent;
}

/**
 * Modi in benannte Gruppen statt in ein flaches Raster: das Hauptmenü war mit
 * acht gleichwertigen Kacheln überladen. Reihenfolge = Einstiegshürde
 * (kurze Runden → Werkstatt/Übung → Ausdauer).
 */
const GROUPS: { key: string; modes: Mode[] }[] = [
  {
    key: 'quick',
    modes: [
      { screen: { name: 'blitz' }, key: 'blitz', icon: '⚡', accent: 'aura' },
      { screen: { name: 'matchcheck' }, key: 'matchcheck', icon: '🎯', accent: 'trace' },
    ],
  },
  {
    key: 'labs',
    modes: [
      { screen: { name: 'review' }, key: 'review', icon: '🧠', accent: 'aura' },
      { screen: { name: 'doctor' }, key: 'doctor', icon: '🩺', accent: 'deny' },
      { screen: { name: 'design' }, key: 'design', icon: '📋', accent: 'warn' },
      { screen: { name: 'routing' }, key: 'routing', icon: '🧭', accent: 'trace' },
      { screen: { name: 'dnat' }, key: 'dnat', icon: '🌐', accent: 'aura' },
      { screen: { name: 'sandbox' }, key: 'sandbox', icon: '🧪', accent: 'trace' },
    ],
  },
  {
    key: 'endurance',
    modes: [
      { screen: { name: 'endless' }, key: 'endless', icon: '♾️', accent: 'deny' },
      { screen: { name: 'challenge' }, key: 'challenge', icon: '🧩', accent: 'warn' },
    ],
  },
];

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useGame((s) => s.navigate);
  const xp = useGame((s) => s.xp);
  const streak = useGame((s) => s.streak);
  const stars = useGame((s) => s.stars);
  const locale = useGame((s) => s.settings.locale);
  const dailyHistory = useGame((s) => s.dailyHistory);
  const blitzBest = useGame((s) => s.blitzBest);
  const endlessBest = useGame((s) => s.endlessBest);
  const { rank, next, progress } = rankFor(xp);

  const dailyXp = useGame((s) => s.dailyXp);
  const tasksSolved = useGame((s) => s.tasksSolved);
  const chestsOpened = useGame((s) => s.chestsOpened);
  const seenUnlocks = useGame((s) => s.seenUnlocks);
  const stats = useGame((s) => s.stats);
  const achievements = useGame((s) => s.achievements);
  const questDay = useGame((s) => s.questDay);
  const mastery = useGame((s) => s.mastery);
  const ensureQuestDay = useGame((s) => s.ensureQuestDay);
  const claimQuest = useGame((s) => s.claimQuest);
  const doctorSolved = useGame((s) => s.doctorSolved);
  const routingSolved = useGame((s) => s.routingSolved);
  const designSolved = useGame((s) => s.designSolved);
  const dnatSolved = useGame((s) => s.dnatSolved);
  const openNextChest = useGame((s) => s.openNextChest);
  const markUnlocksSeen = useGame((s) => s.markUnlocksSeen);

  const [reward, setReward] = useState<RewardPayload | null>(null);

  const campaign = campaignProgress(stars);
  const dailyDone = dailyHistory[todayString()] !== undefined;
  const nextChapter = campaign.next?.chapter;
  const campaignPct =
    campaign.total > 0 ? Math.round((campaign.completed / campaign.total) * 100) : 0;

  const today = todayString();
  const goal = dailyGoal(dailyXp.date === today ? dailyXp.xp : 0);
  const chestsReady = chestsEarned(tasksSolved) - chestsOpened;
  const upcoming = nextUnlock(campaign.completed, xp);
  const nearBadges = nearestAchievements({ stats, xp, stars, streak }, achievements, 3);

  // Tagesauftraege: nur aus offenen Modi ziehen, sonst waere der Tag unschaffbar
  const unlockedModes = UNLOCKS.filter((u) => isUnlocked(u.key, campaign.completed, xp)).map(
    (u) => u.key,
  );
  useEffect(() => {
    ensureQuestDay(today, unlockedModes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, unlockedModes.join(',')]);

  const questTemplates = questDay.ids
    .map((id) => QUEST_POOL.find((q) => q.id === id))
    .filter((q): q is (typeof QUEST_POOL)[number] => q !== undefined);
  const quests =
    questDay.date === today
      ? questProgress(
          questTemplates,
          questDay.snapshot,
          readQuestCounters({
            tasksSolved,
            stars,
            stats,
            doctorSolved,
            routingSolved,
            designSolved,
            dnatSolved,
          }),
          questDay.claimed,
        )
      : [];
  const week = weekMilestone(streak.current);

  // Mastery: die Schwaechen zuerst — das ist der ehrlichste Grund weiterzuspielen
  const weakConcepts = weakestConcepts(mastery, 3);
  const untestedCount = untestedConcepts(mastery).length;
  const masteryOverall = overallMastery(mastery);
  // Frisch freigeschaltete Modi feiern, sobald der Spieler wieder hier landet
  const fresh = freshUnlocks(campaign.completed, xp, seenUnlocks);

  function claimChest() {
    const got = openNextChest();
    if (got) setReward({ kind: 'chest', xp: got.xp, rarity: got.rarity as 'common' });
  }

  function claimQuestReward(p: (typeof quests)[number]) {
    const got = claimQuest(p.quest.id, p.quest.xp);
    if (got === null) return;
    // Waren das die letzten offenen? Dann gibt es den Tagesbonus obendrauf
    const after = quests.map((q) => (q.quest.id === p.quest.id ? { ...q, claimed: true } : q));
    if (allQuestsDone(after) && after.every((q) => q.claimed)) {
      claimQuest('__all__', ALL_DONE_BONUS_XP);
      setReward({ kind: 'chest', xp: got + ALL_DONE_BONUS_XP, rarity: 'epic' });
    } else {
      setReward({ kind: 'chest', xp: got, rarity: 'common' });
    }
  }

  function celebrateUnlock() {
    const key = fresh[0];
    if (!key) return;
    markUnlocksSeen([key]);
    setReward({ kind: 'unlock', modeKey: key });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-16 pt-8 lg:max-w-7xl lg:gap-5 lg:px-8 lg:pt-8">
      {/* Hero — mobil gestapelt, auf Desktop eine flache Zeile: dort ist
          senkrechter Platz kostbar, das Menue soll in einen Blick passen */}
      <div className="hero-aura relative flex flex-col items-center gap-2 self-center text-center lg:w-full lg:flex-row lg:items-center lg:gap-4 lg:text-left">
        <div className="animate-float shrink-0 motion-reduce:animate-none">
          <Mascot pose="idle" size={72} />
        </div>
        <div className="min-w-0">
          <h1 className="text-aurora font-display text-4xl font-bold tracking-tight lg:text-4xl">
            {t('app.title')}
          </h1>
          <p className="max-w-md text-sm text-dim lg:max-w-xl">{t('app.tagline')}</p>
        </div>
      </div>

      {/* Desktop: zwei Spalten — links das Handeln, rechts der Status.
          Mobil bleibt alles gestapelt, Status zuerst (order). */}
      <div className="lg:grid lg:grid-cols-[1fr_21rem] lg:items-start lg:gap-5">
        <aside className="mb-6 flex flex-col gap-3 lg:order-2 lg:mb-0">
          {/* Spieler-Statusleiste: Rang + XP-Fortschritt + Bestwerte */}
          <button
            onClick={() => navigate({ name: 'profile' })}
            className="panel-action card-mode group flex w-full items-center gap-4 rounded-panel px-4 py-3 text-left hover:border-aura/50 hover:shadow-glow-aura lg:px-6"
            aria-label={t('nav.profile')}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-aura/15 text-lg">
              🏅
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-sm font-bold text-ink">
                  {rank.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-dim">
                  {t('score.xp')} <span className="font-bold text-trace">{xp}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-claw via-aura to-trace transition-[width] duration-500"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-dim/80">
                <span>
                  {streak.current > 0 && <span className="text-warn">🔥 {streak.current}d · </span>}
                  {blitzBest > 0 && <span>⚡ {blitzBest} · </span>}
                  {endlessBest.rounds > 0 && <span>♾️ {endlessBest.rounds}</span>}
                </span>
                {next ? (
                  <span>→ {next.name}</span>
                ) : (
                  <span className="text-warn">{t('profile.maxRank')}</span>
                )}
              </div>
            </div>
          </button>

          {/* Belohnungs-Leiste: Tagesziel, wartende Truhe, naechste Freischaltung.
          Das ist die Vorfreude-Ebene — sie beantwortet „warum noch eine Runde?" */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="panel-inset flex items-center rounded-panel px-4 py-3">
              <DailyGoalRing
                goal={goal}
                streak={streak.current}
                freezeTokens={streak.freezeTokens}
              />
            </div>

            {chestsReady > 0 ? (
              <button
                onClick={claimChest}
                className="card-mode panel-reward rarity-legendary group flex items-center gap-3 rounded-panel px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
              >
                <span className="text-2xl">🎁</span>
                <div className="min-w-0">
                  <div className="font-display text-sm font-bold text-warn">
                    {t('reward.ready')}
                  </div>
                  <div className="font-mono text-[11px] text-dim">
                    {t('reward.readySub', { count: chestsReady })}
                  </div>
                </div>
              </button>
            ) : (
              <div className="panel-inset flex items-center gap-3 rounded-panel px-4 py-3">
                <span className="text-2xl opacity-40">🎁</span>
                <div className="min-w-0">
                  <div className="font-display text-sm font-bold text-dim">{t('reward.next')}</div>
                  <div className="font-mono text-[11px] text-dim/80">
                    {t('reward.nextSub', { count: CHEST_EVERY - (tasksSolved % CHEST_EVERY) })}
                  </div>
                </div>
              </div>
            )}

            {fresh.length > 0 ? (
              <button
                onClick={celebrateUnlock}
                className="card-mode panel-reward rarity-epic group flex items-center gap-3 rounded-panel px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
              >
                <span className="text-2xl">🔓</span>
                <div className="min-w-0">
                  <div className="font-display text-sm font-bold text-trace">
                    {t('unlock.freshTitle')}
                  </div>
                  <div className="truncate font-mono text-[11px] text-dim">
                    {t(`nav.${fresh[0]}`)}
                  </div>
                </div>
              </button>
            ) : upcoming ? (
              <div className="panel-inset flex items-center gap-3 rounded-panel px-4 py-3">
                <span className="text-2xl opacity-60">🔒</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-sm font-bold text-dim">
                    {t('unlock.nextTitle')}
                  </div>
                  <div className="truncate font-mono text-[11px] text-dim/80">
                    {t(`nav.${upcoming.key}`)} ·{' '}
                    <span className="text-warn">
                      {t('unlock.inLevels', { count: upcoming.levelsToGo })}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel-inset flex items-center gap-3 rounded-panel px-4 py-3">
                <span className="text-2xl">🏅</span>
                <div className="min-w-0">
                  <div className="font-display text-sm font-bold text-trace">
                    {t('unlock.allOpen')}
                  </div>
                  <div className="font-mono text-[11px] text-dim">{t('unlock.allOpenSub')}</div>
                </div>
              </div>
            )}
          </div>

          <DailyQuests
            progress={quests}
            week={week}
            streak={streak.current}
            onClaim={claimQuestReward}
          />
          <MasteryPanel weak={weakConcepts} untested={untestedCount} overall={masteryOverall} />
          <NextBadges items={nearBadges} />
        </aside>

        <nav
          className="flex w-full flex-col gap-6 lg:order-1 lg:gap-4"
          aria-label={t('nav.mainMenu')}
        >
          {/* Primäre Zeile: „Was mache ich jetzt?" — Kampagne fortsetzen + Daily */}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <button
                onClick={() =>
                  campaign.next
                    ? navigate({ name: 'level', levelId: campaign.next.id })
                    : navigate({ name: 'chapter', chapter: 1 })
                }
                className="card-mode panel-hero group relative flex items-center gap-4 rounded-panel px-5 py-5 text-left hover:-translate-y-0.5 lg:col-span-2 lg:gap-5 lg:px-6"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-panel bg-claw/15 text-3xl shadow-inner lg:h-16 lg:w-16">
                  🛡️
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xl font-bold text-ink lg:text-2xl">
                      {campaign.completed === 0
                        ? t('home.startCampaign')
                        : campaign.next
                          ? t('home.continue')
                          : t('home.campaignDone')}
                    </span>
                    {campaign.completed === 0 && (
                      <span className="rounded-full bg-claw/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-claw">
                        {t('nav.startHere')}
                      </span>
                    )}
                  </div>
                  {/* Kapitel + Level-Titel; das Kapitel-Thema stand hier auch schon,
                    fraß aber die Zeile auf und schnitt den Level-Titel ab */}
                  <div className="mt-0.5 line-clamp-2 font-mono text-xs leading-snug text-dim lg:text-sm">
                    {campaign.next
                      ? `${t('nav.chapter', { number: campaign.next.chapter })} · ${campaign.next.title[locale]}`
                      : t('nav.campaignSub')}
                  </div>
                  {/* Kampagnen-Fortschrittsbalken */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg/70">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-claw to-warn transition-[width] duration-500"
                        style={{ width: `${campaignPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-dim">
                      {campaign.completed}/{campaign.total}
                    </span>
                  </div>
                </div>
                <span className="self-center text-2xl text-claw transition-transform group-hover:translate-x-1">
                  →
                </span>
              </button>

              {/* Daily mit Heute-Status: beantwortet „habe ich das heute schon?" */}
              <button
                onClick={() => navigate({ name: 'daily' })}
                className={`card-mode panel-action group flex items-center gap-3 rounded-panel px-4 py-4 text-left hover:-translate-y-0.5 ${
                  dailyDone
                    ? 'border-line hover:border-trace/60 hover:shadow-glow-trace'
                    : 'border-warn/40 hover:border-warn/70 hover:shadow-glow-warn'
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-panel text-xl ${
                    dailyDone ? 'bg-trace/15 text-trace' : 'bg-warn/15 text-warn'
                  }`}
                >
                  {dailyDone ? '✓' : '📅'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-bold text-ink">{t('nav.daily')}</div>
                  <div className="truncate font-mono text-[11px] text-dim">
                    <span className={dailyDone ? 'text-trace' : 'text-warn'}>
                      {dailyDone ? t('home.dailyDone') : t('home.dailyOpen')}
                    </span>
                    {streak.current > 0 && <span> · 🔥 {streak.current}d</span>}
                  </div>
                </div>
                <span
                  className={`shrink-0 transition-transform group-hover:translate-x-1 ${
                    dailyDone ? 'text-trace' : 'text-warn'
                  }`}
                >
                  →
                </span>
              </button>
            </div>

            {/* Alle Kapitel — sekundär, fuer gezieltes Wiederholen */}
            <button
              onClick={() => navigate({ name: 'chapter', chapter: nextChapter ?? 1 })}
              className="self-start font-mono text-[11px] text-dim underline-offset-4 hover:text-ink hover:underline"
            >
              {t('home.allChapters')} · {campaign.starsEarned}/{campaign.maxStars} ★
            </button>
          </div>

          {/* Gruppierte Modi */}
          {GROUPS.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
                  {t(`home.group.${group.key}`)}
                </h2>
                <div className="h-px flex-1 bg-line/60" aria-hidden />
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
                {group.modes.map((m) => {
                  const a = ACCENT[m.accent];
                  const open = isUnlocked(m.key, campaign.completed, xp);
                  if (!open) {
                    // Gesperrt, aber SICHTBAR mit Bedingung: das erzeugt Vorfreude.
                    // Verstecken wuerde nur die Auswahl verkleinern, nicht motivieren.
                    const state = unlockStateFor(m.key, campaign.completed, xp);
                    return (
                      <div
                        key={m.key}
                        className="panel-inset flex items-center gap-3 rounded-panel px-3.5 py-3 text-left opacity-70"
                        aria-label={`${t(`nav.${m.key}`)} — ${t('unlock.locked')}`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-bg/60 text-lg grayscale">
                          🔒
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-[15px] font-bold text-dim">
                            {t(`nav.${m.key}`)}
                          </div>
                          <div className="font-mono text-[11px] leading-snug text-dim/80">
                            {state && state.levelsToGo > 0
                              ? t('unlock.inLevels', { count: state.levelsToGo })
                              : t('unlock.locked')}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={m.key}
                      onClick={() => navigate(m.screen)}
                      className={`card-mode panel-action group flex items-center gap-3 rounded-panel px-3.5 py-3 text-left hover:-translate-y-0.5 ${a.ring}`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-panel text-lg ${a.chip}`}
                      >
                        {m.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-[15px] font-bold text-ink lg:text-base">
                          {t(`nav.${m.key}`)}
                        </div>
                        {/* zwei Zeilen statt Abschneiden — die Untertitel erklären den Modus */}
                        <div className="line-clamp-2 font-mono text-[11px] leading-snug text-dim lg:line-clamp-3 lg:text-xs">
                          {t(`nav.${m.key}Sub`)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 transition-transform group-hover:translate-x-1 ${a.arrow}`}
                      >
                        →
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>

      <RewardOverlay reward={reward} onClose={() => setReward(null)} />
    </div>
  );
}
