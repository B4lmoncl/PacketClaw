import { useTranslation } from 'react-i18next';
import { useGame } from '../../game/store';
import { Mascot } from './Mascot';

export function Header({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const xp = useGame((s) => s.xp);
  const combo = useGame((s) => s.combo);

  return (
    <header className="flex items-center gap-3 px-4 py-2 border-b border-line bg-panel/70 backdrop-blur-sm sticky top-0 z-20">
      {onBack ? (
        <button
          onClick={onBack}
          className="text-dim hover:text-ink px-2 py-1 -ml-2 rounded-row focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw"
          aria-label={t('nav.back')}
        >
          ←
        </button>
      ) : (
        <Mascot size={28} />
      )}
      <span className="font-display font-bold tracking-tight text-claw">{t('app.title')}</span>
      <div className="ml-auto flex items-center gap-3 font-mono text-xs">
        {combo > 1 && (
          <span className="text-warn" aria-label={t('score.combo')}>
            ×{combo.toFixed(1)}
          </span>
        )}
        <span className="text-dim">
          {t('score.xp')} <span className="text-trace">{xp}</span>
        </span>
      </div>
    </header>
  );
}
