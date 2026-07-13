import type { Config } from 'tailwindcss';
import { colors, fonts, radii } from './src/theme/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        panel: colors.panel,
        panelHi: colors.panelHi,
        claw: colors.claw,
        trace: colors.trace,
        warn: colors.warn,
        deny: colors.deny,
        aura: colors.aura,
        ink: colors.text,
        dim: colors.textDim,
        line: colors.line,
      },
      fontFamily: {
        display: fonts.display,
        body: fonts.body,
        mono: fonts.mono,
      },
      borderRadius: {
        panel: radii.panel,
        row: radii.row,
      },
      boxShadow: {
        'glow-claw': '0 0 0 1px rgba(255,90,60,0.35), 0 8px 30px -6px rgba(255,90,60,0.35)',
        'glow-trace': '0 0 0 1px rgba(61,220,151,0.35), 0 8px 30px -6px rgba(61,220,151,0.35)',
        'glow-warn': '0 0 0 1px rgba(255,176,32,0.35), 0 8px 30px -6px rgba(255,176,32,0.35)',
        'glow-deny': '0 0 0 1px rgba(255,59,92,0.35), 0 8px 30px -6px rgba(255,59,92,0.35)',
        'glow-aura': '0 0 0 1px rgba(139,123,255,0.35), 0 8px 30px -6px rgba(139,123,255,0.4)',
        elevated: '0 12px 40px -12px rgba(0,0,0,0.7)',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
