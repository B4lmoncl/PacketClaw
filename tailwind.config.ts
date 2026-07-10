import type { Config } from 'tailwindcss';
import { colors, fonts, radii } from './src/theme/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        panel: colors.panel,
        claw: colors.claw,
        trace: colors.trace,
        warn: colors.warn,
        deny: colors.deny,
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
    },
  },
  plugins: [],
} satisfies Config;
