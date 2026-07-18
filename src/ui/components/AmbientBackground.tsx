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
    // Leuchtende Datenpartikel — Knoten des Netz-Geflechts
    alpha: 0.18 + Math.random() * 0.28,
  };
}

// Einmalig pro Farbe einen weichen Glow-Sprite vorrendern — im Frame wird nur
// noch drawImage aufgerufen (viel billiger als per-Partikel-shadowBlur).
// Reichweite, in der zwei Knoten mit einer Linie verbunden werden
const LINK_DIST = 150;
const LINK_DIST2 = LINK_DIST * LINK_DIST;

const SPRITE_R = 32;
const spriteCache = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string): HTMLCanvasElement {
  const cached = spriteCache.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE_R * 2;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(SPRITE_R, SPRITE_R, 0, SPRITE_R, SPRITE_R, SPRITE_R);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_R * 2, SPRITE_R * 2);
  }
  spriteCache.set(color, c);
  return c;
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
    let posX: number[] = [];
    let posY: number[] = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Dichte wie zuvor (Qualität) — die Sprite-Zeichnung ist billig genug
      const target = Math.min(48, Math.floor((w * h) / 34000));
      motes = Array.from({ length: target }, () => makeMote(w, h, true));
      posX = new Array<number>(target).fill(0);
      posY = new Array<number>(target).fill(0);
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
      ctx.globalCompositeOperation = 'lighter';

      // 1) Positionen berechnen (mit Wobble) + fortbewegen
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i] as Mote;
        m.y -= m.speed * dt;
        if (m.y < -10) motes[i] = makeMote(w, h);
        posX[i] = m.x + Math.sin(t * 0.5 + m.phase) * m.drift;
        posY[i] = m.y;
      }

      // 2) Netz-Geflecht: nahe Knoten mit dezenten Linien verbinden — das
      //    macht aus reinen Farben eine „lebendige Netzwerk"-Textur
      ctx.lineWidth = 1;
      for (let i = 0; i < motes.length; i++) {
        const xi = posX[i] as number;
        const yi = posY[i] as number;
        for (let j = i + 1; j < motes.length; j++) {
          const dx = xi - (posX[j] as number);
          const dy = yi - (posY[j] as number);
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST2) continue;
          const a = (1 - Math.sqrt(d2) / LINK_DIST) * 0.12;
          ctx.strokeStyle = `rgba(139,123,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(xi, yi);
          ctx.lineTo(posX[j] as number, posY[j] as number);
          ctx.stroke();
        }
      }

      // 3) Leuchtende Knoten (vorgerendertes Glow-Sprite)
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i] as Mote;
        ctx.globalAlpha = m.alpha * (0.7 + 0.3 * Math.sin(t * 1.6 + m.phase));
        const d = m.size * 7;
        ctx.drawImage(
          glowSprite(m.color),
          (posX[i] as number) - d / 2,
          (posY[i] as number) - d / 2,
          d,
          d,
        );
      }

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
