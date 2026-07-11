/**
 * AetherGate-Server (QuestHall-Stil): EIN Express-Prozess serviert das
 * gebaute Spiel (dist/) UND die Account-/Save-API. Ersetzt die frühere
 * nginx-Stage — Security-Header und Caching sind hierher portiert.
 *
 * API (alles JSON):
 *   POST /api/auth/register  { name, password }  → 201 { token, name }
 *   POST /api/auth/login     { name, password }  → 200 { token, name }
 *   POST /api/auth/logout    Bearer              → 204
 *   GET  /api/save           Bearer              → 200 { save } (save: null wenn leer)
 *   PUT  /api/save           Bearer { save }     → 204
 *   GET  /api/health                             → 200 { ok: true }
 */
import express from 'express';
import path from 'node:path';
import { openStore } from './store.mjs';

/** Fixed-Window-Limiter nur für Auth-Endpunkte (Brute-Force-Bremse). */
function createAuthLimiter({ windowMs = 15 * 60 * 1000, max = 40 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || now - entry.start > windowMs) {
      hits.set(req.ip, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      return res.status(429).json({ error: 'too-many-requests' });
    }
    next();
  };
}

function bearerToken(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export async function createApp({ dataDir, distDir }) {
  const store = await openStore(dataDir);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '512kb' }));

  // Security-Header (aus der früheren nginx.conf portiert)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; " +
        "worker-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    next();
  });

  const authLimiter = createAuthLimiter();

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { name, password } = req.body ?? {};
    const result = await store.register(name, password);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ token: result.token, name });
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { name, password } = req.body ?? {};
    const result = await store.login(name, password);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ token: result.token, name: result.name });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = bearerToken(req);
    if (token) await store.revokeToken(token);
    res.status(204).end();
  });

  // Bearer-Middleware für die Save-Endpunkte
  const requireAuth = (req, res, next) => {
    const userKey = store.resolveToken(bearerToken(req));
    if (!userKey) return res.status(401).json({ error: 'unauthorized' });
    req.userKey = userKey;
    next();
  };

  app.get('/api/save', requireAuth, async (req, res) => {
    res.json({ save: await store.readSave(req.userKey) });
  });

  app.put('/api/save', requireAuth, async (req, res) => {
    const { save } = req.body ?? {};
    // Minimale Plausibilität — Inhalt validiert der Client beim Import erneut
    if (typeof save !== 'object' || save === null || typeof save.saveVersion !== 'number') {
      return res.status(400).json({ error: 'invalid-save' });
    }
    await store.writeSave(req.userKey, save);
    res.status(204).end();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.all('/api/{*splat}', (_req, res) => res.status(404).json({ error: 'not-found' }));

  if (distDir) {
    // Gehashte Assets unveränderlich cachen; SW + index.html immer frisch
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(express.static(distDir, { setHeaders: setNoCacheForEntrypoints }));
    // SPA-Fallback für alle GET-Nicht-API-Pfade
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return { app, store };
}

function setNoCacheForEntrypoints(res, filePath) {
  const base = path.basename(filePath);
  if (base === 'index.html' || base === 'sw.js' || base.startsWith('workbox-')) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}
