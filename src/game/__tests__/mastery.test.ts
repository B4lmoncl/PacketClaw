import { describe, expect, it } from 'vitest';
import { evaluate, makeConfig, makePolicy } from '../../engine';
import type { Verdict } from '../../engine';
import {
  CONCEPTS,
  conceptMastery,
  conceptOfVerdict,
  MIN_ATTEMPTS,
  overallMastery,
  untestedConcepts,
  weakestConcepts,
} from '../mastery';
import type { MasteryMap } from '../mastery';

const net = (over: Parameters<typeof makeConfig>[0]) =>
  makeConfig({
    interfaces: [
      { id: 'p1', name: 'port1' },
      { id: 'p2', name: 'port2' },
      { id: 'w1', name: 'wan1' },
    ],
    addresses: [
      { id: 'LAN', name: 'LAN', type: 'subnet', subnet: '10.0.1.0/24' },
      { id: 'SRV', name: 'SRV', type: 'host', host: '172.16.0.10' },
    ],
    services: [
      { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
      { id: 'SSH', name: 'SSH', protocol: 'tcp', dstPorts: [{ from: 22, to: 22 }] },
    ],
    routes: [
      { dst: '172.16.0.0/24', iface: 'port2' },
      { dst: '0.0.0.0/0', iface: 'wan1' },
    ],
    ...over,
  });

const probe = { srcintf: 'port1', srcIp: '10.0.1.5', dstIp: '172.16.0.10' } as const;

describe('conceptOfVerdict — aus dem Engine-Trace abgeleitet', () => {
  it('kein Treffer ⇒ implicitDeny', () => {
    const v = evaluate({ ...probe, protocol: 'tcp', dstPort: 443 }, net({ policies: [] }));
    expect(conceptOfVerdict(v)).toBe('implicitDeny');
  });

  it('keine Route ⇒ routing, unabhaengig von den Policies', () => {
    const config = net({ routes: [{ dst: '10.0.1.0/24', iface: 'port1' }], policies: [] });
    const v = evaluate({ ...probe, protocol: 'tcp', dstPort: 443 }, config);
    expect(conceptOfVerdict(v)).toBe('routing');
  });

  it('DNAT im Spiel ⇒ vip, das schlaegt alles andere', () => {
    const config = net({
      vips: [
        {
          id: 'V',
          name: 'VIP_WEB',
          extIp: '203.0.113.10',
          extPort: 443,
          mappedIp: '172.16.0.10',
          mappedPort: 443,
          protocol: 'tcp',
        },
      ],
      policies: [
        makePolicy({
          id: 1,
          srcintf: ['wan1'],
          dstintf: ['port2'],
          dstaddr: ['VIP_WEB'],
          service: ['HTTPS'],
          action: 'accept',
        }),
      ],
    });
    const v = evaluate(
      {
        srcintf: 'wan1',
        srcIp: '198.51.100.9',
        dstIp: '203.0.113.10',
        protocol: 'tcp',
        dstPort: 443,
      },
      config,
    );
    expect(conceptOfVerdict(v)).toBe('vip');
  });

  it('naher Treffer am SERVICE ⇒ service', () => {
    const config = net({
      policies: [
        // scheitert am Service (SSH statt HTTPS)
        makePolicy({
          id: 1,
          srcintf: ['port1'],
          dstintf: ['port2'],
          srcaddr: ['LAN'],
          dstaddr: ['SRV'],
          service: ['SSH'],
          action: 'deny',
        }),
        makePolicy({
          id: 2,
          srcintf: ['port1'],
          dstintf: ['port2'],
          srcaddr: ['LAN'],
          dstaddr: ['SRV'],
          service: ['HTTPS'],
          action: 'accept',
        }),
      ],
    });
    const v = evaluate({ ...probe, protocol: 'tcp', dstPort: 443 }, config);
    expect(v.matchedPolicyId).toBe(2);
    expect(conceptOfVerdict(v)).toBe('service');
  });

  it('naher Treffer am INTERFACE ⇒ interface', () => {
    const config = net({
      policies: [
        makePolicy({
          id: 1,
          srcintf: ['wan1'],
          dstintf: ['port2'],
          srcaddr: ['LAN'],
          dstaddr: ['SRV'],
          service: ['HTTPS'],
          action: 'deny',
        }),
        makePolicy({
          id: 2,
          srcintf: ['port1'],
          dstintf: ['port2'],
          srcaddr: ['LAN'],
          dstaddr: ['SRV'],
          service: ['HTTPS'],
          action: 'accept',
        }),
      ],
    });
    const v = evaluate({ ...probe, protocol: 'tcp', dstPort: 443 }, config);
    expect(conceptOfVerdict(v)).toBe('interface');
  });

  it('die erste Regel trifft sofort ⇒ firstMatch (kein Beinah-Treffer davor)', () => {
    const config = net({
      policies: [
        makePolicy({
          id: 1,
          srcintf: ['port1'],
          dstintf: ['port2'],
          srcaddr: ['LAN'],
          dstaddr: ['SRV'],
          service: ['HTTPS'],
          action: 'accept',
        }),
      ],
    });
    const v = evaluate({ ...probe, protocol: 'tcp', dstPort: 443 }, config);
    expect(conceptOfVerdict(v)).toBe('firstMatch');
  });

  it('liefert fuer JEDEN Verdict ein bekanntes Konzept, nie undefined', () => {
    const configs = [
      net({ policies: [] }),
      net({ policies: [makePolicy({ id: 1, action: 'accept', nat: true })] }),
      net({ routes: [], policies: [] }),
    ];
    for (const config of configs) {
      const v: Verdict = evaluate({ ...probe, protocol: 'tcp', dstPort: 443 }, config);
      expect(CONCEPTS).toContain(conceptOfVerdict(v));
    }
  });
});

describe('Mastery-Stand', () => {
  it('ohne Versuche: 0 Genauigkeit und unbelegt', () => {
    const m = conceptMastery({}, 'service');
    expect(m).toMatchObject({ attempts: 0, accuracy: 0, unproven: true });
  });

  it('rechnet Genauigkeit und markiert erst ab MIN_ATTEMPTS als belegt', () => {
    const few: MasteryMap = { service: { correct: 1, wrong: 1 } };
    expect(conceptMastery(few, 'service').unproven).toBe(true);
    const enough: MasteryMap = { service: { correct: 3, wrong: 1 } };
    const m = conceptMastery(enough, 'service');
    expect(m.attempts).toBe(MIN_ATTEMPTS);
    expect(m.accuracy).toBeCloseTo(0.75);
    expect(m.unproven).toBe(false);
  });

  it('weakestConcepts ignoriert Ausrutscher ohne Datenbasis', () => {
    const mastery: MasteryMap = {
      // ein einziger Fehler — noch keine Schwaeche, nur Rauschen
      vip: { correct: 0, wrong: 1 },
      // belegt und schwach
      service: { correct: 1, wrong: 5 },
      address: { correct: 4, wrong: 2 },
    };
    const weak = weakestConcepts(mastery, 3).map((m) => m.concept);
    expect(weak).toEqual(['service', 'address']);
    expect(weak).not.toContain('vip');
  });

  it('perfekt beherrschte Konzepte sind keine Schwaeche', () => {
    const mastery: MasteryMap = { routing: { correct: 8, wrong: 0 } };
    expect(weakestConcepts(mastery)).toEqual([]);
  });

  it('untestedConcepts nennt den noch unbekannten Stoff', () => {
    const mastery: MasteryMap = { service: { correct: 5, wrong: 1 } };
    const untested = untestedConcepts(mastery).map((m) => m.concept);
    expect(untested).not.toContain('service');
    expect(untested.length).toBe(CONCEPTS.length - 1);
  });

  it('overallMastery mittelt nur ueber belegte Konzepte', () => {
    expect(overallMastery({})).toBe(0);
    const mastery: MasteryMap = {
      service: { correct: 4, wrong: 0 },
      address: { correct: 2, wrong: 2 },
      vip: { correct: 0, wrong: 1 }, // unbelegt, zaehlt nicht mit
    };
    expect(overallMastery(mastery)).toBeCloseTo(0.75);
  });
});
