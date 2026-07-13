/**
 * Ambient-Hintergrund (QuestHall-Stil): kleine "Paket"-Partikel driften
 * langsam schraeg nach oben durchs Bild, dazu vereinzelt kurze Trace-Linien.
 * Canvas mit requestAnimationFrame, sehr niedrige Alpha-Werte — Stimmung,
 * keine Ablenkung. Bei Reduced Motion wird gar nichts gerendert; bei
 * verstecktem Tab pausiert die Animation.
 */
import { useEffect, useRef } from 'react';
import { colors } from '../../theme/tokens';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

interface Mote {
  x: number;
  y: number;
  size: number;
  speed: number; // px/s nach oben
  drift: number; // horizontale Wobble-Amplitude
  phase: number;
  color: string;
  alpha: number;
}

const PALETTE = [colors.trace, colors.claw, colors.textDim, colors.warn];

function makeMote(w: number, h: number, randomY = false): Mote {
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? colors.textDim;
  return {
    x: Math.random() * w,
    y: randomY ? Math.random() * h : h + 8,
    size: 1.5 + Math.random() * 2.5,
    speed: 6 + Math.random() * 14,
    drift: 8 + Math.random() * 18,
    phase: Math.random() * Math.PI * 2,
    color,
    alpha: 0.05 + Math.random() * 0.1,
  };
}

export function AmbientBackground() {
  const reducedMotion = useReducedMotionPref();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let motes: Mote[] = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Dichte an die Flaeche koppeln, aber deckeln (Performance)
      const target = Math.min(48, Math.floor((w * h) / 34000));
      motes = Array.from({ length: target }, () => makeMote(w, h, true));
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i] as Mote;
        m.y -= m.speed * dt;
        if (m.y < -10) motes[i] = makeMote(w, h);
        const x = m.x + Math.sin(t * 0.5 + m.phase) * m.drift;
        ctx.globalAlpha = m.alpha;
        ctx.fillStyle = m.color;
        ctx.fillRect(x, m.y, m.size, m.size);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Versteckter Tab: anhalten, sonst brennt die Animation unnoetig CPU
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      data-testid="ambient-bg"
    />
  );
}
