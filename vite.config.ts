import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      // Barrel-Datei und reine Typdeklarationen enthalten keine Logik
      exclude: ['src/engine/index.ts', 'src/engine/types.ts', 'src/engine/__tests__/**'],
      reporter: ['text', 'html'],
      thresholds: {
        branches: 95,
        lines: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
});
