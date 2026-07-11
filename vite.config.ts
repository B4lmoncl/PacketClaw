import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'AetherGate',
        short_name: 'AetherGate',
        description:
          'Firewall-Policy-Puzzle-Game — unabhängiges Lernprojekt, nicht mit Fortinet affiliiert.',
        lang: 'de',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // komplette Offline-Fähigkeit: alle Assets inkl. Fonts precachen
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
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
