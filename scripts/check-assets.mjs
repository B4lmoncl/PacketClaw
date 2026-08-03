/**
 * Prüft das gebaute `dist/` gegen die Content-Security-Policy, die der Server
 * ausliefert (server/app.mjs).
 *
 * Warum das ein eigener Schritt ist: der Build war grün, die Tests waren grün,
 * und trotzdem hat der Browser bei jedem Seitenaufruf sechs Schriften
 * abgewiesen — Vite hatte kleine Font-Subsets als data:-URI eingebettet,
 * `font-src 'self'` verbietet genau das. Nichts davon schlägt fehl, es wird nur
 * leise nicht geladen. Solche Fehler findet man nur, wenn man danach sucht.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';

/** Was die CSP des Servers in welcher Direktive verbietet. */
const FORBIDDEN = [
  {
    pattern: /url\(\s*["']?data:font\//gi,
    what: 'eingebettete Schrift (data:font/…)',
    directive: "font-src 'self'",
    fix: 'vite.config.ts → build.assetsInlineLimit schließt Schriften aus',
  },
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

const files = (await walk(DIST)).filter((f) => /\.(css|js|html)$/i.test(f));
if (files.length === 0) {
  console.error(`✖ ${DIST}/ enthält keine Assets — erst "npm run build" laufen lassen.`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const rule of FORBIDDEN) {
    const hits = content.match(rule.pattern);
    if (!hits) continue;
    failed += hits.length;
    console.error(
      `✖ ${file}: ${hits.length}× ${rule.what}\n` +
        `  Die CSP des Servers erlaubt nur ${rule.directive} — das wird im Browser blockiert.\n` +
        `  Fix: ${rule.fix}`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} Verstoß/Verstöße gegen die ausgelieferte CSP.`);
  process.exit(1);
}
console.log(`✓ ${files.length} Assets geprüft, keine CSP-Verstöße.`);
