/**
 * Einmaliger Partikel-Burst (QuestHall-Stil): Konfetti/Funken fliegen radial
 * aus der Mitte, trudeln leicht nach unten und verblassen. Rein dekorativ
 * (aria-hidden, pointer-events-none); bei Reduced Motion wird nichts
 * gerendert. DOM-basiert über framer-motion — kein Canvas nötig, die Bursts
 * sind kurz und einmalig.
 */
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

type Variant = 'celebration' | 'sparks';

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  rotate: number;
  delay: number;
  duration: number;
  round: boolean;
}

const PALETTES: Record<Variant, string[]> = {
  celebration: ['#FF5A3C', '#3DDC97', '#FFC53D', '#7AA2FF', '#E8ECF6'],
  sparks: ['#3DDC97', '#7CF3C1', '#E8ECF6'],
};

function makeParticles(variant: Variant): Particle[] {
  const count = variant === 'celebration' ? 34 : 14;
  const spread = variant === 'celebration' ? 150 : 70;
  const palette = PALETTES[variant];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = spread * (0.45 + Math.random() * 0.55);
    return {
      x: Math.cos(angle) * dist,
      // nach dem Flug leicht "fallen" lassen (Schwerkraft-Anmutung)
      y: Math.sin(angle) * dist * 0.75 + (variant === 'celebration' ? 40 : 12),
      size: variant === 'celebration' ? 4 + Math.random() * 5 : 2.5 + Math.random() * 3,
      color: palette[i % palette.length] ?? '#E8ECF6',
      rotate: (Math.random() - 0.5) * 540,
      delay: Math.random() * 0.12,
      duration: variant === 'celebration' ? 1 + Math.random() * 0.5 : 0.65 + Math.random() * 0.3,
      round: Math.random() < 0.4,
    };
  });
}

/**
 * In einen `relative` positionierten Container legen; der Burst spielt beim
 * Mounten genau einmal ab (Re-Trigger über React-`key`).
 */
export function ParticleBurst({ variant = 'celebration' }: { variant?: Variant }) {
  const reducedMotion = useReducedMotionPref();
  // Partikel einmalig beim Mount würfeln (Visuals dürfen echten Zufall nutzen)
  const [particles] = useState(() => makeParticles(variant));
  if (reducedMotion) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2">
        {particles.map((p, i) => (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate, scale: 0.55 }}
            transition={{ duration: p.duration, delay: p.delay, ease: [0.15, 0.65, 0.35, 1] }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * (p.round ? 1 : 0.55),
              backgroundColor: p.color,
              borderRadius: p.round ? '9999px' : '1px',
            }}
          />
        ))}
      </div>
    </div>
  );
}
