/** Produktions-Einstieg: node server/index.mjs */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? path.join(here, '..', 'data');
const distDir = process.env.DIST_DIR ?? path.join(here, '..', 'dist');
const port = Number(process.env.PORT ?? 8080);

const { app } = await createApp({ dataDir, distDir });

const server = app.listen(port, () => {
  console.log(`[aethergate] listening on :${port} — data: ${dataDir}`);
});

// Sauberer Shutdown, damit docker stop nicht in den SIGKILL-Timeout läuft
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
