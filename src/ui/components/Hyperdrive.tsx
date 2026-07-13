/**
 * Verstecktes Easter-Egg: Konami-Code (↑↑↓↓←→←→ B A) zündet für ein paar
 * Sekunden den „Hyperdrive" — die Aurora dreht auf, ein Toast blitzt kurz.
 * Rein kosmetisch, keine Spielauswirkung.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

export function Hyperdrive() {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);

  useEffect(() => {
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === SEQUENCE[pos] ? pos + 1 : key === SEQUENCE[0] ? 1 : 0;
      if (pos === SEQUENCE.length) {
        pos = 0;
        setActive(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('hyperdrive');
    const off = window.setTimeout(() => setActive(false), 6000);
    return () => {
      window.clearTimeout(off);
      document.documentElement.classList.remove('hyperdrive');
    };
  }, [active]);

  if (!active) return null;
  return (
    <div className="hyperdrive-toast rounded-full bg-aura/20 px-4 py-1.5 font-display text-sm font-bold text-aura shadow-glow-aura">
      ⚡ {t('boot.hyperdrive')}
    </div>
  );
}
