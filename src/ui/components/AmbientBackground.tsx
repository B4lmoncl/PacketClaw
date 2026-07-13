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

const PALETTE = [colors.trace, colors.claw, colors.aura, colors.warn];

function makeMote(w: number, h: number, randomY = false): Mote {
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? colors.textDim;
  return {
    x: Math.random() * w,
    y: randomY ? Math.random() * h : h + 8,
    size: 2 + Math.random() * 3.5,
    speed: 7 + Math.random() * 16,
    drift: 10 + Math.random() * 22,
    phase: Math.random() * Math.PI * 2,
    color,
    // Deutlich sichtbarer als vorher — leuchtende Datenpartikel
    alpha: 0.18 + Math.random() * 0.28,
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
      // Additives Leuchten: Partikel glimmen auf dunklem Grund
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i] as Mote;
        m.y -= m.speed * dt;
        if (m.y < -10) motes[i] = makeMote(w, h);
        const x = m.x + Math.sin(t * 0.5 + m.phase) * m.drift;
        // sanftes Flimmern der Helligkeit
        ctx.globalAlpha = m.alpha * (0.7 + 0.3 * Math.sin(t * 1.6 + m.phase));
        ctx.fillStyle = m.color;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = m.size * 3;
        ctx.beginPath();
        ctx.arc(x, m.y, m.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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

  return (
    <>
      {/* Aurora-Glows liegen immer (auch bei Reduced Motion, dann statisch) */}
      <div className="aurora-layer" aria-hidden>
        <div className="aurora-blob b1" />
        <div className="aurora-blob b2" />
        <div className="aurora-blob b3" />
      </div>
      {/* Leuchtende Datenpartikel nur, wenn Bewegung erlaubt ist */}
      {!reducedMotion && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          data-testid="ambient-bg"
        />
      )}
    </>
  );
}
