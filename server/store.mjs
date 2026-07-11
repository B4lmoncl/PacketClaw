/**
 * Account- und Savegame-Persistenz (QuestHall-Stil: JSON-Dateien in einem
 * Daten-Verzeichnis, das im Container als Volume gemountet wird).
 *
 * Layout:
 *   <dataDir>/users.json          — { [nameLower]: { name, salt, hash, createdAt } }
 *   <dataDir>/tokens.json         — { [token]: { user, createdAt } }
 *   <dataDir>/saves/<name>.json   — das Savegame (gleiche Struktur wie exportSave())
 *
 * Passwörter: scrypt (node:crypto) mit per-User-Salt — kein Klartext, keine
 * externe Abhängigkeit. Tokens sind zufällige 256-Bit-Hex-Strings und bleiben
 * über Container-Neustarts gültig (persistiert), bis Logout sie widerruft.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SCRYPT_KEYLEN = 64;

export const NAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 200;

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Atomar schreiben: tmp-Datei + rename, damit nie eine halbe JSON auf Platte liegt. */
async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.usersFile = path.join(dataDir, 'users.json');
    this.tokensFile = path.join(dataDir, 'tokens.json');
    this.savesDir = path.join(dataDir, 'saves');
    this.users = {};
    this.tokens = {};
    // Serialisiert alle Schreibzugriffe — zwei parallele Registrierungen
    // desselben Namens können sich so nicht gegenseitig überschreiben.
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.savesDir, { recursive: true });
    this.users = await readJson(this.usersFile, {});
    this.tokens = await readJson(this.tokensFile, {});
    return this;
  }

  enqueue(task) {
    const run = this.writeQueue.then(task);
    // Fehler nicht in der Queue hängen lassen — der Aufrufer bekommt sie trotzdem
    this.writeQueue = run.catch(() => {});
    return run;
  }

  async hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const key = await scryptAsync(password, salt);
    return { salt, hash: key.toString('hex') };
  }

  async verifyPassword(password, salt, hash) {
    const key = await scryptAsync(password, salt);
    const expected = Buffer.from(hash, 'hex');
    return key.length === expected.length && timingSafeEqual(key, expected);
  }

  /** @returns {Promise<{ok: true, token: string} | {ok: false, error: string, status: number}>} */
  async register(name, password) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return { ok: false, status: 400, error: 'invalid-name' };
    }
    if (
      typeof password !== 'string' ||
      password.length < PASSWORD_MIN ||
      password.length > PASSWORD_MAX
    ) {
      return { ok: false, status: 400, error: 'invalid-password' };
    }
    const key = name.toLowerCase();
    if (this.users[key]) return { ok: false, status: 409, error: 'name-taken' };
    const { salt, hash } = await this.hashPassword(password);
    return this.enqueue(async () => {
      // Re-Check nach dem async hash — eine parallele Registrierung könnte
      // den Namen inzwischen belegt haben.
      if (this.users[key]) return { ok: false, status: 409, error: 'name-taken' };
      this.users[key] = { name, salt, hash, createdAt: new Date().toISOString() };
      await writeJsonAtomic(this.usersFile, this.users);
      const token = await this.issueTokenUnqueued(key);
      return { ok: true, token };
    });
  }

  /** @returns {Promise<{ok: true, token: string, name: string} | {ok: false, error: string, status: number}>} */
  async login(name, password) {
    const key = typeof name === 'string' ? name.toLowerCase() : '';
    const user = this.users[key];
    // Auch bei unbekanntem Namen einen scrypt-Lauf machen, damit die
    // Antwortzeit keine gültigen Namen verrät (QuestHall-Idiom).
    const salt = user?.salt ?? 'timing-dummy-salt';
    const hash = user?.hash ?? '00'.repeat(SCRYPT_KEYLEN);
    const match = await this.verifyPassword(String(password ?? ''), salt, hash);
    if (!user || !match) return { ok: false, status: 401, error: 'invalid-credentials' };
    const token = await this.issueToken(key);
    return { ok: true, token, name: user.name };
  }

  /** Nur aus bereits gequeueten Tasks aufrufen — sonst issueToken() nutzen. */
  async issueTokenUnqueued(userKey) {
    const token = randomBytes(32).toString('hex');
    this.tokens[token] = { user: userKey, createdAt: new Date().toISOString() };
    await writeJsonAtomic(this.tokensFile, this.tokens);
    return token;
  }

  async issueToken(userKey) {
    return this.enqueue(() => this.issueTokenUnqueued(userKey));
  }

  /** @returns {string | null} userKey */
  resolveToken(token) {
    return (typeof token === 'string' && this.tokens[token]?.user) || null;
  }

  async revokeToken(token) {
    return this.enqueue(async () => {
      if (!this.tokens[token]) return;
      delete this.tokens[token];
      await writeJsonAtomic(this.tokensFile, this.tokens);
    });
  }

  saveFile(userKey) {
    // userKey ist durch NAME_RE begrenzt (keine Pfadzeichen) — trotzdem basename()
    return path.join(this.savesDir, `${path.basename(userKey)}.json`);
  }

  async readSave(userKey) {
    return readJson(this.saveFile(userKey), null);
  }

  async writeSave(userKey, save) {
    return this.enqueue(() => writeJsonAtomic(this.saveFile(userKey), save));
  }
}

export async function openStore(dataDir) {
  return new Store(dataDir).init();
}
