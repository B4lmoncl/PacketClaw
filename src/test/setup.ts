import '@testing-library/jest-dom/vitest';

/**
 * jsdom kennt kein matchMedia. Ohne diesen Stub stirbt jede Komponente, die
 * useReducedMotionPref benutzt — also praktisch jede animierte. Default:
 * „keine Reduced-Motion-Präferenz", damit Tests den Normalfall sehen.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
