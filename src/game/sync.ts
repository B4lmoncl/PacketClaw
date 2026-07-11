/**
 * Server-Sync (QuestHall-Stil): Wer angemeldet ist, bekommt seinen Spielstand
 * vom Server (Pull bei Login/App-Start) und jede Änderung wird debounced
 * zurückgeschrieben (Push). Ohne Konto läuft alles wie bisher rein lokal —
 * der Server ist optional, nie Voraussetzung.
 *
 * Das Auth-Token liegt bewusst in einem EIGENEN localStorage-Key und ist
 * nicht Teil des Savegames (Export/Import bleibt frei von Credentials).
 */
import { create } from 'zustand';
import { useGame } from './store';

const AUTH_KEY = 'packetclaw-auth';
const PUSH_DEBOUNCE_MS = 2500;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthInfo {
  token: string;
  name: string;
}

interface AuthState {
  name: string | null;
  status: SyncStatus;
  /** i18n-Key unter settings.account.errors.* (oder null) */
  error: string | null;
}

export const useAuth = create<AuthState>(() => ({
  name: readAuth()?.name ?? null,
  status: 'idle',
  error: null,
}));

function readAuth(): AuthInfo | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as AuthInfo).token === 'string' &&
      typeof (parsed as AuthInfo).name === 'string'
    ) {
      return parsed as AuthInfo;
    }
  } catch {
    // defekter Eintrag → wie ausgeloggt behandeln
  }
  return null;
}

function writeAuth(auth: AuthInfo | null) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
}

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown; keepalive?: boolean } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    keepalive: options.keepalive,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // 204 u. ä. haben keinen Body
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Push: jede Save-Änderung debounced zum Server
// ---------------------------------------------------------------------------

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastPushed = '';
let unsubscribe: (() => void) | undefined;

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void pushNow(), PUSH_DEBOUNCE_MS);
}

async function pushNow(keepalive = false): Promise<void> {
  const auth = readAuth();
  if (!auth) return;
  const json = useGame.getState().exportSave();
  if (json === lastPushed) return;
  useAuth.setState({ status: 'syncing' });
  try {
    const res = await api('/api/save', {
      method: 'PUT',
      token: auth.token,
      body: { save: JSON.parse(json) as unknown },
      keepalive,
    });
    if (res.status === 401) return handleInvalidToken();
    if (res.status !== 204) throw new Error(`status ${res.status}`);
    lastPushed = json;
    useAuth.setState({ status: 'synced', error: null });
  } catch {
    useAuth.setState({ status: 'error', error: 'network' });
  }
}

function startPushLoop() {
  stopPushLoop();
  unsubscribe = useGame.subscribe(() => schedulePush());
}

function stopPushLoop() {
  unsubscribe?.();
  unsubscribe = undefined;
  clearTimeout(pushTimer);
}

function handleInvalidToken() {
  // Token serverseitig widerrufen/unbekannt → lokal ausloggen, Spiel läuft weiter
  stopPushLoop();
  writeAuth(null);
  useAuth.setState({ name: null, status: 'idle', error: 'session-expired' });
}

// ---------------------------------------------------------------------------
// Pull + öffentliche Flows
// ---------------------------------------------------------------------------

async function pullSave(token: string): Promise<'applied' | 'empty'> {
  const res = await api('/api/save', { token });
  if (res.status === 401) {
    handleInvalidToken();
    throw new Error('unauthorized');
  }
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const save = res.json.save;
  if (save !== null && typeof save === 'object') {
    useGame.getState().importSave(JSON.stringify(save));
    lastPushed = useGame.getState().exportSave();
    return 'applied';
  }
  return 'empty';
}

async function afterAuth(token: string, name: string): Promise<void> {
  writeAuth({ token, name });
  useAuth.setState({ name, status: 'syncing', error: null });
  const result = await pullSave(token);
  if (result === 'empty') {
    // frisches Konto: lokalen Stand sofort hochladen
    lastPushed = '';
    await pushNow();
  }
  useAuth.setState({ status: 'synced', error: null });
  startPushLoop();
}

export async function login(name: string, password: string): Promise<boolean> {
  useAuth.setState({ status: 'syncing', error: null });
  try {
    const res = await api('/api/auth/login', { method: 'POST', body: { name, password } });
    if (res.status !== 200) {
      useAuth.setState({ status: 'idle', error: String(res.json.error ?? 'network') });
      return false;
    }
    await afterAuth(String(res.json.token), String(res.json.name));
    return true;
  } catch {
    useAuth.setState({ status: 'idle', error: 'network' });
    return false;
  }
}

export async function register(name: string, password: string): Promise<boolean> {
  useAuth.setState({ status: 'syncing', error: null });
  try {
    const res = await api('/api/auth/register', { method: 'POST', body: { name, password } });
    if (res.status !== 201) {
      useAuth.setState({ status: 'idle', error: String(res.json.error ?? 'network') });
      return false;
    }
    await afterAuth(String(res.json.token), String(res.json.name));
    return true;
  } catch {
    useAuth.setState({ status: 'idle', error: 'network' });
    return false;
  }
}

export async function logout(): Promise<void> {
  const auth = readAuth();
  stopPushLoop();
  writeAuth(null);
  useAuth.setState({ name: null, status: 'idle', error: null });
  if (auth) {
    // letzten Stand noch mitnehmen, dann Token widerrufen — best effort
    try {
      await api('/api/auth/logout', { method: 'POST', token: auth.token });
    } catch {
      // Server nicht erreichbar → Token verfällt einfach lokal
    }
  }
}

/** Beim App-Start aufrufen: zieht den Server-Stand, startet den Push-Loop. */
export function initSync(): void {
  // Beim Verlassen der Seite ausstehende Änderungen noch rausschreiben
  // (auch relevant, wenn der Login erst später in dieser Sitzung passiert)
  window.addEventListener('pagehide', () => {
    clearTimeout(pushTimer);
    void pushNow(true);
  });
  const auth = readAuth();
  if (!auth) return;
  useAuth.setState({ name: auth.name, status: 'syncing' });
  void pullSave(auth.token)
    .then(() => {
      useAuth.setState({ status: 'synced', error: null });
      startPushLoop();
    })
    .catch(() => {
      // offline/Fehler: lokal weiterspielen, Push-Loop trotzdem starten
      if (readAuth()) {
        useAuth.setState({ status: 'error', error: 'network' });
        startPushLoop();
      }
    });
}
