import { describe, expect, it } from 'vitest';
import {
  cidrContains,
  intToIp,
  ipToInt,
  isValidIPv4,
  longestPrefixMatch,
  parseCidr,
  rangeContains,
} from '../ip';

describe('ipToInt / intToIp', () => {
  it('konvertiert hin und zurück', () => {
    for (const ip of ['0.0.0.0', '10.0.1.5', '172.16.254.1', '255.255.255.255']) {
      expect(intToIp(ipToInt(ip))).toBe(ip);
    }
  });

  it('rechnet korrekt', () => {
    expect(ipToInt('0.0.0.1')).toBe(1);
    expect(ipToInt('0.0.1.0')).toBe(256);
    expect(ipToInt('255.255.255.255')).toBe(0xffffffff);
  });

  it('wirft bei ungültigen Adressen', () => {
    for (const bad of ['10.0.0', '1.2.3.4.5', '256.1.1.1', 'a.b.c.d', '', '10.0.0.1/24']) {
      expect(() => ipToInt(bad)).toThrow(/Ungültige IPv4/);
    }
  });
});

describe('isValidIPv4', () => {
  it('akzeptiert gültige Adressen', () => {
    expect(isValidIPv4('192.168.0.1')).toBe(true);
    expect(isValidIPv4('0.0.0.0')).toBe(true);
    expect(isValidIPv4('255.255.255.255')).toBe(true);
  });
  it('lehnt ungültige ab', () => {
    expect(isValidIPv4('256.0.0.1')).toBe(false);
    expect(isValidIPv4('1.2.3')).toBe(false);
    expect(isValidIPv4('kein-ip')).toBe(false);
  });
});

describe('parseCidr', () => {
  it('/24: erste und letzte Adresse gehören zum Netz', () => {
    const { from, to } = parseCidr('10.0.1.0/24');
    expect(intToIp(from)).toBe('10.0.1.0');
    expect(intToIp(to)).toBe('10.0.1.255');
  });

  it('/30: exakt 4 Adressen', () => {
    const { from, to } = parseCidr('192.168.100.0/30');
    expect(intToIp(from)).toBe('192.168.100.0');
    expect(intToIp(to)).toBe('192.168.100.3');
    expect(to - from).toBe(3);
  });

  it('/32 ist eine einzelne Adresse, /0 ist alles', () => {
    const host = parseCidr('10.1.2.3/32');
    expect(host.from).toBe(host.to);
    const all = parseCidr('0.0.0.0/0');
    expect(all.from).toBe(0);
    expect(all.to).toBe(0xffffffff);
  });

  it('normalisiert gesetzte Host-Bits auf die Netzadresse', () => {
    const { from, to } = parseCidr('10.0.1.77/24');
    expect(intToIp(from)).toBe('10.0.1.0');
    expect(intToIp(to)).toBe('10.0.1.255');
  });

  it('wirft bei ungültigem CIDR', () => {
    expect(() => parseCidr('10.0.1.0')).toThrow(/Ungültiges CIDR/);
    expect(() => parseCidr('10.0.1.0/33')).toThrow(/Präfix/);
    expect(() => parseCidr('999.0.1.0/24')).toThrow(/Ungültige IPv4/);
  });
});

describe('cidrContains', () => {
  it('Netz- und Broadcast-Adresse zählen zum Match (/24)', () => {
    expect(cidrContains('10.0.1.0/24', '10.0.1.0')).toBe(true);
    expect(cidrContains('10.0.1.0/24', '10.0.1.255')).toBe(true);
    expect(cidrContains('10.0.1.0/24', '10.0.2.0')).toBe(false);
    expect(cidrContains('10.0.1.0/24', '10.0.0.255')).toBe(false);
  });

  it('Grenzen bei /30', () => {
    expect(cidrContains('192.168.100.0/30', '192.168.100.0')).toBe(true);
    expect(cidrContains('192.168.100.0/30', '192.168.100.3')).toBe(true);
    expect(cidrContains('192.168.100.0/30', '192.168.100.4')).toBe(false);
  });
});

describe('rangeContains', () => {
  it('Ränder inklusiv', () => {
    expect(rangeContains('10.0.1.10', '10.0.1.19', '10.0.1.10')).toBe(true);
    expect(rangeContains('10.0.1.10', '10.0.1.19', '10.0.1.19')).toBe(true);
    expect(rangeContains('10.0.1.10', '10.0.1.19', '10.0.1.9')).toBe(false);
    expect(rangeContains('10.0.1.10', '10.0.1.19', '10.0.1.20')).toBe(false);
  });

  it('from > to matcht nichts', () => {
    expect(rangeContains('10.0.1.19', '10.0.1.10', '10.0.1.15')).toBe(false);
  });
});

describe('longestPrefixMatch', () => {
  const routes = [
    { dst: '0.0.0.0/0', iface: 'wan1' },
    { dst: '10.0.0.0/16', iface: 'port9' },
    { dst: '10.0.1.0/24', iface: 'port1' },
  ];

  it('/24 schlägt /16 schlägt Default', () => {
    expect(longestPrefixMatch(routes, '10.0.1.5')?.iface).toBe('port1');
    expect(longestPrefixMatch(routes, '10.0.2.5')?.iface).toBe('port9');
    expect(longestPrefixMatch(routes, '8.8.8.8')?.iface).toBe('wan1');
  });

  it('Reihenfolge egal — Präfixlänge entscheidet', () => {
    const reversed = [...routes].reverse();
    expect(longestPrefixMatch(reversed, '10.0.1.5')?.iface).toBe('port1');
  });

  it('kein Match ohne Default-Route → undefined', () => {
    expect(longestPrefixMatch([{ dst: '10.0.1.0/24', iface: 'port1' }], '8.8.8.8')).toBeUndefined();
  });

  it('bei gleichem Präfix gewinnt der erste Eintrag', () => {
    const dup = [
      { dst: '10.0.1.0/24', iface: 'first' },
      { dst: '10.0.1.0/24', iface: 'second' },
    ];
    expect(longestPrefixMatch(dup, '10.0.1.1')?.iface).toBe('first');
  });
});
