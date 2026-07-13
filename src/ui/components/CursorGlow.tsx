/**
 * Lichtschein, der dem Mauszeiger folgt — die ganze Oberfläche reagiert auf
 * Bewegung (leuchtet hinter dem transluzenten Inhalt durch). Nur auf feinen
 * Zeigern (Maus/Trackpad), aus bei Reduced Motion.
 */
import { useEffect, useRef } from 'react';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    const apply = () => {
      raf = 0;
      if (ref.current) ref.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  if (reduced) return null;
  return <div ref={ref} aria-hidden className="cursor-glow" />;
}
