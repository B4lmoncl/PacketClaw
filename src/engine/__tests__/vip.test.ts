import { describe, expect, it } from 'vitest';
import { makePolicy } from '../config';
import { evaluate, matchVip } from '../evaluate';
import type { Packet } from '../types';
import { baseConfig } from './fixtures';

/** WAN-Paket auf die externe VIP-Adresse */
function wanToVip(overrides: Partial<Packet> = {}): Packet {
  return {
    srcintf: 'wan1',
    srcIp: '198.51.100.77',
    dstIp: '203.0.113.10',
    protocol: 'tcp',
    dstPort: 443,
    ...overrides,
  };
}

describe('VIP-Matching (matchVip)', () => {
  const vips = baseConfig().vips;

  it('matcht bei extIp + protocol + extPort', () => {
    expect(matchVip(wanToVip(), vips)?.name).toBe('VIP_WEB');
  });

  it('extPort-Mismatch → kein VIP', () => {
    expect(matchVip(wanToVip({ dstPort: 8080 }), vips)).toBeUndefined();
  });

  it('Protokoll-Mismatch → kein VIP', () => {
    expect(matchVip(wanToVip({ protocol: 'udp' }), vips)).toBeUndefined();
  });

  it('andere Ziel-IP → kein VIP', () => {
    expect(matchVip(wanToVip({ dstIp: '203.0.113.11' }), vips)).toBeUndefined();
  });

  it('VIP ohne extPort/protocol matcht jedes Protokoll und jeden Port', () => {
    const openVip = [{ id: 'v', name: 'VIP_OPEN', extIp: '203.0.113.10', mappedIp: '172.16.0.10' }];
    expect(matchVip(wanToVip({ protocol: 'udp', dstPort: 9999 }), openVip)?.name).toBe('VIP_OPEN');
  });
});

describe('DNAT in der Evaluation', () => {
  it('Policy auf das VIP-Objekt matcht; Verdict enthält DNAT-Ziel', () => {
    const config = baseConfig({
      policies: [
        makePolicy({
          id: 5,
          srcintf: ['wan1'],
          dstintf: ['port2'],
          dstaddr: ['VIP_WEB'],
          service: ['HTTPS'],
        }),
      ],
    });
    const verdict = evaluate(wanToVip(), config);
    expect(verdict.action).toBe('accept');
    expect(verdict.matchedPolicyId).toBe(5);
    // Routing lief auf die mappedIp → DMZ-Interface
    expect(verdict.dstintf).toBe('port2');
    expect(verdict.dnat).toEqual({ toIp: '172.16.0.10', toPort: 8443 });
    expect(verdict.trace).toContainEqual({
      kind: 'dnat',
      vipName: 'VIP_WEB',
      toIp: '172.16.0.10',
      toPort: 8443,
    });
  });

  it('dstaddr "all" matcht DNAT-Traffic NICHT (klassische Falle)', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['wan1'], dstaddr: ['all'] })],
    });
    const verdict = evaluate(wanToVip(), config);
    expect(verdict.action).toBe('deny');
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'dstaddr',
    });
  });

  it('Policy auf die interne IP statt des VIP matcht NICHT (klassischer Fehler)', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcintf: ['wan1'], dstaddr: ['SRV_WEB01'], service: ['HTTPS'] }),
      ],
    });
    const verdict = evaluate(wanToVip(), config);
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'dstaddr',
    });
  });

  it('extPort-Mismatch: kein DNAT, Routing auf die externe IP, VIP-Policy greift nicht', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 5, dstaddr: ['VIP_WEB'] })],
    });
    const verdict = evaluate(wanToVip({ dstPort: 8080 }), config);
    expect(verdict.matchedPolicyId).toBe(0);
    // externe IP hat nur die Default-Route
    expect(verdict.dstintf).toBe('wan1');
    expect(verdict.trace.some((s) => s.kind === 'dnat')).toBe(false);
  });

  it('Deny-Policy auf VIP: action deny, kein dnat im Verdict', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 3, action: 'deny', dstaddr: ['VIP_WEB'] })],
    });
    const verdict = evaluate(wanToVip(), config);
    expect(verdict.action).toBe('deny');
    expect(verdict.matchedPolicyId).toBe(3);
    expect(verdict.dnat).toBeUndefined();
  });

  it('keine Route zur mappedIp → no-route-Deny', () => {
    const config = baseConfig({
      routes: [{ dst: '0.0.0.0/0', iface: 'wan1' }],
      vips: [
        {
          id: 'v',
          name: 'VIP_BROKEN',
          extIp: '203.0.113.10',
          mappedIp: '172.16.0.10',
          protocol: 'tcp',
          extPort: 443,
        },
      ],
      policies: [makePolicy({ id: 1, dstaddr: ['VIP_BROKEN'] })],
    });
    // 0.0.0.0/0 routet auch 172.16.0.10 → wan1; nimm eine Route-Tabelle ohne Default:
    const noDefault = { ...config, routes: [{ dst: '10.0.1.0/24', iface: 'port1' }] };
    const verdict = evaluate(wanToVip(), noDefault);
    expect(verdict.action).toBe('deny');
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.dstintf).toBe('');
    expect(verdict.trace).toContainEqual({ kind: 'no-route' });
    // DNAT-Schritt ist trotzdem im Trace dokumentiert
    expect(verdict.trace.some((s) => s.kind === 'dnat')).toBe(true);
  });

  it('VIP-Traffic mit falschem Service scheitert am service-Feld, nicht am dstaddr', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 5, dstaddr: ['VIP_WEB'], service: ['DNS'] })],
    });
    const verdict = evaluate(wanToVip(), config);
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 5,
      failedField: 'service',
    });
  });
});
