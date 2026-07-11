// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../app.mjs';

let dataDir;
let app;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'aethergate-test-'));
  ({ app } = await createApp({ dataDir }));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const SAVE = { saveVersion: 1, xp: 120, stars: { 'ch1-l01': 3 } };

async function registered(name = 'snipp', password = 'geheim1') {
  const res = await request(app).post('/api/auth/register').send({ name, password });
  expect(res.status).toBe(201);
  return res.body.token;
}

describe('auth', () => {
  it('registriert und liefert ein Token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'snipp', password: 'geheim1' });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.name).toBe('snipp');
  });

  it('lehnt doppelte Namen ab (case-insensitiv)', async () => {
    await registered('Snipp');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'sNiPp', password: 'geheim1' });
    expect(res.status).toBe(409);
  });

  it('validiert Name und Passwort', async () => {
    for (const body of [
      { name: 'ab', password: 'geheim1' }, // zu kurz
      { name: 'sn ipp', password: 'geheim1' }, // Leerzeichen
      { name: '../etc', password: 'geheim1' }, // Pfadzeichen
      { name: 'snipp', password: 'kurz' }, // Passwort zu kurz
      { name: 'snipp' }, // Passwort fehlt
    ]) {
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('login mit richtigem Passwort, 401 bei falschem/unbekanntem', async () => {
    await registered('snipp', 'geheim1');
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ name: 'SNIPP', password: 'geheim1' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('snipp');
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ name: 'snipp', password: 'falsch1' });
    expect(wrong.status).toBe(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ name: 'niemand', password: 'geheim1' });
    expect(unknown.status).toBe(401);
  });

  it('logout widerruft das Token', async () => {
    const token = await registered();
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    const res = await request(app).get('/api/save').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('save', () => {
  it('rundreise: PUT dann GET', async () => {
    const token = await registered();
    const put = await request(app)
      .put('/api/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ save: SAVE });
    expect(put.status).toBe(204);
    const get = await request(app).get('/api/save').set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.save).toEqual(SAVE);
  });

  it('leerer Account liefert save: null', async () => {
    const token = await registered();
    const res = await request(app).get('/api/save').set('Authorization', `Bearer ${token}`);
    expect(res.body.save).toBeNull();
  });

  it('ohne/mit ungültigem Token: 401', async () => {
    expect((await request(app).get('/api/save')).status).toBe(401);
    expect(
      (await request(app).get('/api/save').set('Authorization', 'Bearer deadbeef')).status,
    ).toBe(401);
  });

  it('lehnt kaputte Saves ab', async () => {
    const token = await registered();
    for (const save of [null, 'string', { xp: 1 }]) {
      const res = await request(app)
        .put('/api/save')
        .set('Authorization', `Bearer ${token}`)
        .send({ save });
      expect(res.status).toBe(400);
    }
  });

  it('Saves sind pro Account getrennt', async () => {
    const a = await registered('alice');
    const b = await registered('bobby');
    await request(app).put('/api/save').set('Authorization', `Bearer ${a}`).send({ save: SAVE });
    const res = await request(app).get('/api/save').set('Authorization', `Bearer ${b}`);
    expect(res.body.save).toBeNull();
  });
});

describe('persistenz', () => {
  it('überlebt einen Server-Neustart (neue App, gleiches dataDir)', async () => {
    const token = await registered();
    await request(app)
      .put('/api/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ save: SAVE });

    const { app: restarted } = await createApp({ dataDir });
    // Token bleibt gültig, Save bleibt da
    const res = await request(restarted).get('/api/save').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.save).toEqual(SAVE);
    // Login funktioniert weiterhin
    const login = await request(restarted)
      .post('/api/auth/login')
      .send({ name: 'snipp', password: 'geheim1' });
    expect(login.status).toBe(200);
  });
});

describe('health & api-404', () => {
  it('health antwortet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ ok: true });
  });

  it('unbekannte API-Pfade sind 404 (kein SPA-Fallback)', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});
