import { describe, expect, it } from 'vitest';
import { makePolicy } from '../../engine';
import type { NetworkConfig, Policy, Vip } from '../../engine';
import { generateDnatChallenge, verifyDnat } from '../dnat';

const ch = generateDnatChallenge('test-seed');

/** Korrekte VIP: extern → interner Server, exakt der geforderte Port. */
const correctVip: Vip = {
  id: 'VIP_WEB',
  name: 'VIP_WEB',
  extIp: ch.extIp,
  extPort: ch.extPort,
  mappedIp: ch.server.ip,
  mappedPort: ch.server.port,
  protocol: 'tcp',
};

/** Eingangs-Policy, die die VIP als ZIEL referenziert (nicht die interne IP). */
const inboundPolicy: Policy = makePolicy({
  id: 1,
  name: 'inbound-web',
  srcintf: ['wan1'],
  dstintf: ['port2'],
  srcaddr: ['all'],
  dstaddr: ['VIP_WEB'],
  service: ['HTTPS'],
  action: 'accept',
});

const withSetup = (vips: Vip[], policies: Policy[]): NetworkConfig => ({
  ...ch.baseNetwork,
  vips,
  policies,
});

describe('DNAT/VIP Workshop', () => {
  it('Startnetz ist ungeloest (weder VIP noch Policy vorhanden)', () => {
    expect(verifyDnat(ch.baseNetwork, ch)).toBeGreaterThan(0);
  });

  it('korrekte VIP + Eingangs-Policy loesen den Fall (0 Fehler)', () => {
    expect(verifyDnat(withSetup([correctVip], [inboundPolicy]), ch)).toBe(0);
  });

  it('VIP fehlt: Policy allein reicht nicht — der Server bleibt unerreichbar', () => {
    expect(verifyDnat(withSetup([], [inboundPolicy]), ch)).toBeGreaterThan(0);
  });

  it('Policy fehlt: VIP allein oeffnet nichts (Implicit Deny)', () => {
    expect(verifyDnat(withSetup([correctVip], []), ch)).toBeGreaterThan(0);
  });

  it('falsches Mapping-Ziel: DNAT trifft nicht den Server → bleibt rot', () => {
    const wrongVip: Vip = { ...correctVip, mappedIp: '172.16.0.99' };
    expect(verifyDnat(withSetup([wrongVip], [inboundPolicy]), ch)).toBeGreaterThan(0);
  });

  it('Klassiker-Fehler: interne IP statt VIP-Name im dstaddr → matcht nie', () => {
    const badPolicy: Policy = makePolicy({ ...inboundPolicy, dstaddr: ['SRV_WEB01'] });
    expect(verifyDnat(withSetup([correctVip], [badPolicy]), ch)).toBeGreaterThan(0);
  });

  it('zu weit geoeffnet: dstaddr all matcht kein DNAT → Server bleibt unerreichbar', () => {
    const broad: Policy = makePolicy({ ...inboundPolicy, dstaddr: ['all'] });
    expect(verifyDnat(withSetup([correctVip], [broad]), ch)).toBeGreaterThan(0);
  });
});
