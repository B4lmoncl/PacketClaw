import { useTranslation } from 'react-i18next';
import { rankFor } from '../../game/progression';
import { comboMultiplier } from '../../game/scoring';
import { useGame } from '../../game/store';
import { Mascot } from './Mascot';

export function Header({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const xp = useGame((s) => s.xp);
  const combo = useGame((s) => s.combo);
  const navigate = useGame((s) => s.navigate);
  const { rank, progress } = rankFor(xp);

  return (
    <header className="glass sticky top-0 z-20 border-b border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 lg:px-6">
        {onBack ? (
          <button
            onClick={onBack}
            className="-ml-2 rounded-row px-2 py-1 text-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw"
            aria-label={t('nav.back')}
          >
            ←
          </button>
        ) : (
          <button
            onClick={() => navigate({ name: 'home' })}
            className="rounded-full ring-1 ring-white/10 transition-shadow hover:shadow-glow-claw"
            aria-label={t('app.title')}
          >
            <Mascot size={30} />
          </button>
        )}
        <button
          onClick={() => navigate({ name: 'home' })}
          className="font-display font-bold tracking-tight text-claw hover:brightness-110"
        >
          {t('app.title')}
        </button>
        <div className="ml-auto flex items-center gap-2 font-mono text-xs sm:gap-3">
          {combo > 1 && (
            <span
              className="animate-pulse-glow rounded-full bg-warn/15 px-2 py-0.5 font-bold text-warn"
              aria-label={t('score.combo')}
            >
              ×{comboMultiplier(combo).toFixed(1)}
            </span>
          )}
          {/* Rang-Pille mit XP-Fortschritt */}
          <button
            onClick={() => navigate({ name: 'profile' })}
            className="group flex items-center gap-2 rounded-full border border-line bg-bg/40 px-2.5 py-1 transition-colors hover:border-aura/50"
            aria-label={t('nav.profile')}
          >
            <span className="hidden text-dim group-hover:text-ink sm:inline">{rank.name}</span>
            <span className="relative hidden h-1.5 w-14 overflow-hidden rounded-full bg-line sm:block">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-claw via-aura to-trace"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            <span className="text-dim group-hover:text-ink">
              {t('score.xp')} <span className="font-bold text-trace">{xp}</span>
            </span>
          </button>
          <button
            onClick={() => navigate({ name: 'settings' })}
            aria-label={t('nav.settings')}
            className="rounded-full px-1.5 py-0.5 text-dim transition-colors hover:rotate-90 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw motion-reduce:hover:rotate-0"
          >
            ⚙
          </button>
        </div>
      </div>
    </header>
  );
}
