import { useTranslation } from 'react-i18next';
import { campaignProgress } from '../../game/campaign';
import { todayString } from '../../game/daily';
import { rankFor } from '../../game/progression';
import { useGame } from '../../game/store';
import type { Screen } from '../../game/store';
import { Mascot } from '../components/Mascot';

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
      { screen: { name: 'doctor' }, key: 'doctor', icon: '🩺', accent: 'deny' },
      { screen: { name: 'design' }, key: 'design', icon: '📋', accent: 'warn' },
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

  const campaign = campaignProgress(stars);
  const dailyDone = dailyHistory[todayString()] !== undefined;
  const nextChapter = campaign.next?.chapter;
  const campaignPct =
    campaign.total > 0 ? Math.round((campaign.completed / campaign.total) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-7 px-4 pb-16 pt-10 lg:max-w-5xl lg:gap-8 lg:pt-14">
      {/* Hero */}
      <div className="hero-aura relative flex flex-col items-center gap-2 text-center">
        <div className="animate-float motion-reduce:animate-none">
          <Mascot pose="idle" size={92} />
        </div>
        <h1 className="text-aurora font-display text-4xl font-bold tracking-tight lg:text-5xl">
          {t('app.title')}
        </h1>
        <p className="max-w-md text-sm text-dim">{t('app.tagline')}</p>
      </div>

      {/* Spieler-Statusleiste: Rang + XP-Fortschritt + Bestwerte */}
      <button
        onClick={() => navigate({ name: 'profile' })}
        className="glass card-mode group flex w-full items-center gap-4 rounded-panel px-4 py-3 text-left hover:border-aura/50 hover:shadow-glow-aura lg:px-6"
        aria-label={t('nav.profile')}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-aura/15 text-lg">
          🏅
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display text-sm font-bold text-ink">{rank.name}</span>
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

      <nav className="flex w-full flex-col gap-6" aria-label={t('nav.mainMenu')}>
        {/* Primäre Zeile: „Was mache ich jetzt?" — Kampagne fortsetzen + Daily */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <button
              onClick={() =>
                campaign.next
                  ? navigate({ name: 'level', levelId: campaign.next.id })
                  : navigate({ name: 'chapter', chapter: 1 })
              }
              className="card-mode glass group relative flex items-center gap-4 rounded-panel border border-claw/40 px-5 py-5 text-left hover:-translate-y-0.5 hover:border-claw/70 hover:shadow-glow-claw lg:col-span-2 lg:gap-5 lg:px-6"
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
              className={`card-mode glass group flex items-center gap-3 rounded-panel border px-4 py-4 text-left hover:-translate-y-0.5 ${
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
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.modes.map((m) => {
                const a = ACCENT[m.accent];
                return (
                  <button
                    key={m.key}
                    onClick={() => navigate(m.screen)}
                    className={`card-mode glass group flex items-center gap-3 rounded-panel border border-line px-3.5 py-3 text-left hover:-translate-y-0.5 ${a.ring}`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-panel text-lg ${a.chip}`}
                    >
                      {m.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[15px] font-bold text-ink">
                        {t(`nav.${m.key}`)}
                      </div>
                      {/* zwei Zeilen statt Abschneiden — die Untertitel erklären den Modus */}
                      <div className="line-clamp-2 font-mono text-[11px] leading-snug text-dim">
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
  );
}
