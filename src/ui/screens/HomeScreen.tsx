import { useTranslation } from 'react-i18next';
import { rankFor } from '../../game/progression';
import { useGame } from '../../game/store';
import type { Screen } from '../../game/store';
import { Mascot } from '../components/Mascot';

type Accent = 'claw' | 'warn' | 'deny' | 'trace' | 'aura';

const ACCENT: Record<Accent, { chip: string; ring: string; arrow: string; bar: string }> = {
  claw: {
    chip: 'bg-claw/15 text-claw',
    ring: 'hover:border-claw/70 hover:shadow-glow-claw',
    arrow: 'text-claw',
    bar: 'from-claw to-warn',
  },
  warn: {
    chip: 'bg-warn/15 text-warn',
    ring: 'hover:border-warn/70 hover:shadow-glow-warn',
    arrow: 'text-warn',
    bar: 'from-warn to-claw',
  },
  deny: {
    chip: 'bg-deny/15 text-deny',
    ring: 'hover:border-deny/70 hover:shadow-glow-deny',
    arrow: 'text-deny',
    bar: 'from-deny to-warn',
  },
  trace: {
    chip: 'bg-trace/15 text-trace',
    ring: 'hover:border-trace/70 hover:shadow-glow-trace',
    arrow: 'text-trace',
    bar: 'from-trace to-aura',
  },
  aura: {
    chip: 'bg-aura/15 text-aura',
    ring: 'hover:border-aura/70 hover:shadow-glow-aura',
    arrow: 'text-aura',
    bar: 'from-aura to-trace',
  },
};

interface Mode {
  screen: Screen;
  key: string;
  icon: string;
  accent: Accent;
}

const MODES: Mode[] = [
  { screen: { name: 'daily' }, key: 'daily', icon: '📅', accent: 'warn' },
  { screen: { name: 'blitz' }, key: 'blitz', icon: '⚡', accent: 'aura' },
  { screen: { name: 'matchcheck' }, key: 'matchcheck', icon: '🎯', accent: 'trace' },
  { screen: { name: 'endless' }, key: 'endless', icon: '♾️', accent: 'deny' },
  { screen: { name: 'challenge' }, key: 'challenge', icon: '🧩', accent: 'warn' },
  { screen: { name: 'sandbox' }, key: 'sandbox', icon: '🧪', accent: 'trace' },
];

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useGame((s) => s.navigate);
  const xp = useGame((s) => s.xp);
  const streak = useGame((s) => s.streak);
  const blitzBest = useGame((s) => s.blitzBest);
  const endlessBest = useGame((s) => s.endlessBest);
  const { rank, next, progress } = rankFor(xp);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 pb-16 pt-10 lg:max-w-5xl lg:gap-10 lg:pt-16">
      {/* Hero */}
      <div className="hero-aura relative flex flex-col items-center gap-3 text-center">
        <div className="animate-float motion-reduce:animate-none">
          <Mascot pose="idle" size={112} />
        </div>
        <h1 className="text-aurora font-display text-5xl font-bold tracking-tight lg:text-6xl">
          {t('app.title')}
        </h1>
        <p className="max-w-md text-sm text-dim lg:text-base">{t('app.tagline')}</p>
      </div>

      {/* Spieler-Statusleiste: Rang + XP-Fortschritt + Bestwerte */}
      <button
        onClick={() => navigate({ name: 'profile' })}
        className="glass card-mode group flex w-full items-center gap-4 rounded-panel px-4 py-3 text-left hover:border-aura/50 hover:shadow-glow-aura lg:px-6 lg:py-4"
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

      {/* Featured: Kampagne */}
      <nav className="flex w-full flex-col gap-4" aria-label={t('nav.mainMenu')}>
        <button
          onClick={() => navigate({ name: 'chapter', chapter: 1 })}
          className="card-mode glass group relative flex items-center gap-4 rounded-panel border border-claw/40 px-5 py-5 text-left hover:-translate-y-0.5 hover:border-claw/70 hover:shadow-glow-claw lg:gap-6 lg:px-7 lg:py-6"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-panel bg-claw/15 text-3xl shadow-inner lg:h-16 lg:w-16 lg:text-4xl">
            🛡️
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold text-ink lg:text-2xl">
                {t('nav.campaign')}
              </span>
              <span className="rounded-full bg-claw/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-claw">
                {t('nav.startHere')}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-xs text-dim lg:text-sm">
              {t('nav.campaignSub')}
            </div>
          </div>
          <span className="text-2xl text-claw transition-transform group-hover:translate-x-1">
            →
          </span>
        </button>

        {/* Modi-Raster */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => {
            const a = ACCENT[m.accent];
            return (
              <button
                key={m.key}
                onClick={() => navigate(m.screen)}
                className={`card-mode glass group flex items-center gap-3 rounded-panel border border-line px-4 py-4 text-left hover:-translate-y-0.5 ${a.ring}`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-panel text-xl ${a.chip}`}
                >
                  {m.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-bold text-ink">
                    {t(`nav.${m.key}`)}
                  </div>
                  <div className="truncate font-mono text-[11px] text-dim">
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
      </nav>
    </div>
  );
}
