import { useSyncExternalStore } from 'react';
import { useGame } from '../../game/store';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** true ⇒ statische Trace-Ansicht statt Packet-Descent-Animation */
export function useReducedMotionPref(): boolean {
  const system = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const setting = useGame((s) => s.settings.motion);
  return setting === 'reduced' || system;
}
