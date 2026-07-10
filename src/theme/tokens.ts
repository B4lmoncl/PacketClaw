/**
 * PacketClaw Design-Tokens — einzige Quelle für Farben, Typografie und Radien.
 * Alles im UI (Tailwind-Theme, Animationen, SVGs) leitet sich hieraus ab.
 */

export const colors = {
  /** Tiefes Nachtblau — Grundfläche, kein reines Schwarz */
  bg: '#0B1220',
  /** Panels, Karten, Tabellen */
  panel: '#111A2E',
  /** Claw-Koralle — Maskottchen, ACCEPT-Flash, CTAs */
  claw: '#FF5A3C',
  /** Trace-Grün — Matches, Erfolg, Partikelspur */
  trace: '#3DDC97',
  /** Warnungen, Timer knapp */
  warn: '#FFB020',
  /** DENY, Fehler, Implicit-Deny-Puls */
  deny: '#FF3B5C',
  /** Primärtext */
  text: '#E6EDF7',
  /** Gedimmter Text, Meta-Infos */
  textDim: '#8A97AD',
  /** 1-px-Linien (statt Schatten) */
  line: '#22304A',
  /** QuestHall-Anleihe: violett getönter Gradient-Mittelton für den Seitenhintergrund */
  bgTint: '#151228',
  /** Rarity-Glows für Achievements (QuestHall-Anleihe) */
  rarity: {
    common: '#8A97AD',
    rare: '#4FA8FF',
    epic: '#A78BFA',
    legendary: '#F59E0B',
  },
} as const;

export const fonts = {
  /** Display/Headlines — charaktervoll, technisch */
  display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
  /** UI/Body */
  body: ['Inter', 'system-ui', 'sans-serif'],
  /** Daten, Policy-Tabelle, Logs — tabular-nums via CSS */
  mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
} as const;

export const radii = {
  panel: '6px',
  row: '2px',
} as const;

/** Maximale Screen-Shake-Amplitude beim DENY-Snip (Design-Brief: ≤ 4 px) */
export const maxShakePx = 4;
