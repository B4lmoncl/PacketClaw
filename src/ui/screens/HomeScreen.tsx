import { useTranslation } from 'react-i18next';
import { useGame } from '../../game/store';
import { Mascot } from '../components/Mascot';

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useGame((s) => s.navigate);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 pt-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Mascot pose="idle" size={110} />
        <h1 className="font-display text-4xl font-bold tracking-tight text-claw">
          {t('app.title')}
        </h1>
        <p className="text-sm text-dim">{t('app.tagline')}</p>
      </div>

      <nav className="flex w-full flex-col gap-3" aria-label="Hauptmenü">
        <button
          onClick={() => navigate({ name: 'chapter', chapter: 1 })}
          className="group flex items-center justify-between rounded-panel border border-claw/50 bg-panel px-5 py-4 text-left transition-colors hover:bg-claw/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw"
        >
          <div>
            <div className="font-display text-lg font-bold text-ink">{t('nav.campaign')}</div>
            <div className="font-mono text-xs text-dim">8 Kapitel · First Match bis Hardening</div>
          </div>
          <span className="text-claw transition-transform group-hover:translate-x-1">→</span>
        </button>

        <div className="flex items-center justify-between rounded-panel border border-line bg-panel/50 px-5 py-4 opacity-60">
          <div>
            <div className="font-display text-lg font-bold text-dim">{t('nav.daily')}</div>
            <div className="font-mono text-xs text-dim">10 Pakete · seeded · für alle gleich</div>
          </div>
          <span className="rounded-row border border-line px-2 py-0.5 font-mono text-[10px] uppercase text-dim">
            {t('nav.comingSoon')}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-panel border border-line bg-panel/50 px-5 py-4 opacity-60">
          <div>
            <div className="font-display text-lg font-bold text-dim">{t('nav.sandbox')}</div>
            <div className="font-mono text-xs text-dim">
              Eigenes Netz, eigene Regeln, freies Feuern
            </div>
          </div>
          <span className="rounded-row border border-line px-2 py-0.5 font-mono text-[10px] uppercase text-dim">
            {t('nav.comingSoon')}
          </span>
        </div>
      </nav>
    </div>
  );
}
