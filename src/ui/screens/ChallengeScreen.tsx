/**
 * Challenge: großes, gewachsenes Regelwerk auswerten. Erst Größe wählen,
 * dann läuft der normale Verdict-Flow (Spaltentabelle, Spaltenkopf-Filter,
 * Objekt-Browser, Packet Descent) über einem generierten VerdictLevel.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateChallenge, type ChallengeSize } from '../../game/challenge';
import { VerdictScreen } from './VerdictScreen';

const SIZES: ChallengeSize[] = ['small', 'medium', 'large'];

export function ChallengeScreen() {
  const { t } = useTranslation();
  const [size, setSize] = useState<ChallengeSize | null>(null);
  const [seed] = useState(() => `${Date.now()}`);
  const level = useMemo(() => (size ? generateChallenge(seed, size) : null), [size, seed]);

  if (level) return <VerdictScreen key={level.id} level={level} />;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
      <h1 className="font-display text-2xl font-bold text-claw">{t('challenge.title')}</h1>
      <p className="text-sm leading-relaxed text-dim">{t('challenge.intro')}</p>
      <div className="flex flex-col gap-3">
        {SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            className="group flex items-center justify-between rounded-panel border border-line bg-panel px-5 py-4 text-left transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-claw/10 motion-reduce:hover:translate-y-0"
          >
            <div>
              <div className="font-display text-lg font-bold text-ink">
                {t(`challenge.size.${s}.name`)}
              </div>
              <div className="font-mono text-xs text-dim">{t(`challenge.size.${s}.sub`)}</div>
            </div>
            <span className="text-claw transition-transform group-hover:translate-x-1">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
