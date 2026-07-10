/**
 * IPv4-/CIDR-Arithmetik. IPv4 only (v1) — IPv6 wäre hier nachzurüsten,
 * der Rest der Engine rechnet nur mit Intervallen.
 */
import type { Cidr, IPv4, RouteEntry } from './types';

const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4 → uint32. Wirft bei ungültiger Adresse. */
export function ipToInt(ip: IPv4): number {
  const m = IP_RE.exec(ip);
  if (!m) throw new Error(`Ungültige IPv4-Adresse: "${ip}"`);
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const oct = Number(m[i]);
    if (oct > 255) throw new Error(`Ungültige IPv4-Adresse: "${ip}"`);
    n = n * 256 + oct;
  }
  return n;
}

export function intToIp(n: number): IPv4 {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function isValidIPv4(ip: string): boolean {
  const m = IP_RE.exec(ip);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    if (Number(m[i]) > 255) return false;
  }
  return true;
}

export interface CidrRange {
  /** Netzadresse (uint32) — gehört zum Match */
  from: number;
  /** Broadcast-Adresse (uint32) — gehört zum Match */
  to: number;
  prefix: number;
}

const CIDR_RE = /^(.+)\/(\d{1,2})$/;

/** CIDR → inklusives Intervall. Host-Bits im Basiswert werden auf die Netzadresse normalisiert. */
export function parseCidr(cidr: Cidr): CidrRange {
  const m = CIDR_RE.exec(cidr);
  if (!m) throw new Error(`Ungültiges CIDR: "${cidr}"`);
  const prefix = Number(m[2]);
  if (prefix > 32) throw new Error(`Ungültiges CIDR-Präfix: "${cidr}"`);
  const base = ipToInt(m[1] as string);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const from = (base & mask) >>> 0;
  const to = (from | (~mask >>> 0)) >>> 0;
  return { from, to, prefix };
}

/** Netz- und Broadcast-Adresse zählen zum Subnetz-Match (bewusste Entscheidung, s. ENGINE.md). */
export function cidrContains(cidr: Cidr, ip: IPv4): boolean {
  const { from, to } = parseCidr(cidr);
  const n = ipToInt(ip);
  return n >= from && n <= to;
}

/** Inklusiver Range-Match. from > to matcht nichts (Validator verhindert solche Ranges). */
export function rangeContains(from: IPv4, to: IPv4, ip: IPv4): boolean {
  const n = ipToInt(ip);
  return n >= ipToInt(from) && n <= ipToInt(to);
}

/** Longest-Prefix-Match. Bei gleichem Präfix gewinnt der erste Eintrag. Kein Match → undefined. */
export function longestPrefixMatch(routes: RouteEntry[], ip: IPv4): RouteEntry | undefined {
  const n = ipToInt(ip);
  let best: RouteEntry | undefined;
  let bestPrefix = -1;
  for (const route of routes) {
    const { from, to, prefix } = parseCidr(route.dst);
    if (n >= from && n <= to && prefix > bestPrefix) {
      best = route;
      bestPrefix = prefix;
    }
  }
  return best;
}
