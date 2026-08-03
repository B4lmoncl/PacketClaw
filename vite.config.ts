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
          'Firewall policy puzzle game — independent learning project, not affiliated with Fortinet.',
        lang: 'en',
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
  build: {
    /**
     * Schriften NIEMALS als data:-URI einbetten.
     *
     * Der Server liefert `font-src 'self'` (server/app.mjs) — eine eingebettete
     * Schrift ist damit blockiert. Vite hat genau das getan: die kleinen
     * Subsets von JetBrains Mono (cyrillic-ext, vietnamese) lagen unter dem
     * Inline-Limit, landeten als data:-URI im CSS und wurden vom Browser
     * abgewiesen. Sichtbar war das kaum (de/en brauchen diese Zeichen nicht),
     * hörbar dafür umso mehr: sechs CSP-Verstöße pro Seitenaufruf in der
     * Konsole, in denen echte Fehler untergehen.
     *
     * Als Datei statt als data: passen sie zur CSP und werden nebenbei vom
     * Service Worker mit precacht (globPatterns oben).
     */
    assetsInlineLimit: (filePath: string) =>
      /\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined,
  },
  // Dev-Komfort: API-Aufrufe an den lokal laufenden Server durchreichen
  // (node server/index.mjs — Produktion serviert beides aus einem Prozess)
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
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
