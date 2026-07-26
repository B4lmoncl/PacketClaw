import { describe, expect, it } from 'vitest';
import { evaluate, makeConfig, makePolicy } from '../../engine';
import type { Verdict } from '../../engine';
import {
  CONCEPTS,
  conceptMastery,
  conceptOfVerdict,
  masteryDeltas,
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

  /**
   * Local-In-Verdicts tragen matchedPolicyId 0, weil keine Forward-Policy
   * beteiligt war. Ohne Guard wuerde daraus die Lektion „die Regel, die nicht
   * dasteht" — und die Mastery-Messung wuerde Management-Verkehr auf das
   * falsche Konzept buchen.
   */
  it('Verkehr AN die Firewall ist NICHT implicitDeny', () => {
    const config = net({
      interfaces: [
        { id: 'p1', name: 'port1', ip: '10.0.1.1', allowaccess: ['https'] },
        { id: 'p2', name: 'port2' },
        { id: 'w1', name: 'wan1' },
      ],
      policies: [],
    });
    const v = evaluate({ ...probe, dstIp: '10.0.1.1', protocol: 'tcp', dstPort: 443 }, config);
    expect(v.localIn).toBeDefined();
    expect(conceptOfVerdict(v)).not.toBe('implicitDeny');
    expect(CONCEPTS).toContain(conceptOfVerdict(v));
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

  /**
   * Saves wandern ueber das Backend und ueber Versionsgrenzen. Ein kaputtes
   * Feld darf nie als „9 von NaN richtig" im GUI landen — genau das ist beim
   * Smoke-Test mit einem falsch geformten Save passiert.
   */
  it('kaputte Save-Zaehler ergeben 0, niemals NaN', () => {
    const broken = {
      service: { correct: 9 },
      address: { correct: 'viele', wrong: null },
      vip: { correct: NaN, wrong: 3 },
      snat: { correct: -5, wrong: 2 },
    } as unknown as MasteryMap;
    for (const concept of CONCEPTS) {
      const m = conceptMastery(broken, concept);
      expect(Number.isFinite(m.attempts), concept).toBe(true);
      expect(Number.isFinite(m.accuracy), concept).toBe(true);
      expect(m.attempts).toBeGreaterThanOrEqual(0);
    }
    // die intakte Haelfte bleibt erhalten, statt alles zu verwerfen
    expect(conceptMastery(broken, 'service')).toMatchObject({ correct: 9, wrong: 0, attempts: 9 });
    expect(conceptMastery(broken, 'vip')).toMatchObject({ correct: 0, wrong: 3, accuracy: 0 });
    expect(Number.isFinite(overallMastery(broken))).toBe(true);
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

describe('masteryDeltas — die Bewegung ist der Lohn', () => {
  it('nennt nur Konzepte, an denen tatsaechlich geuebt wurde', () => {
    const before: MasteryMap = { service: { correct: 1, wrong: 3 }, vip: { correct: 4, wrong: 0 } };
    const after: MasteryMap = { service: { correct: 3, wrong: 3 }, vip: { correct: 4, wrong: 0 } };
    const deltas = masteryDeltas(before, after);
    // vip stand still, also keine Zeile — eine +-0-Zeile waere nur Fuellmaterial
    expect(deltas.map((d) => d.concept)).toEqual(['service']);
    expect(deltas[0]).toMatchObject({ attemptsAdded: 2 });
    expect(deltas[0]?.before).toBeCloseTo(0.25);
    expect(deltas[0]?.after).toBeCloseTo(0.5);
    expect(deltas[0]?.change).toBeCloseTo(0.25);
  });

  /**
   * Wichtig fuers Vertrauen: eine Messung, die nur gute Nachrichten zeigt,
   * ist keine Messung. Wer vorher geraten hat, soll die Zahl fallen sehen.
   */
  it('verschweigt Rueckschritte nicht', () => {
    const before: MasteryMap = { address: { correct: 4, wrong: 0 } };
    const after: MasteryMap = { address: { correct: 4, wrong: 4 } };
    const [d] = masteryDeltas(before, after);
    expect(d?.change).toBeCloseTo(-0.5);
    expect(d?.after).toBeCloseTo(0.5);
  });

  it('markiert den ersten belastbaren Messwert als neu belegt', () => {
    const before: MasteryMap = { routing: { correct: 1, wrong: 0 } };
    const after: MasteryMap = { routing: { correct: 4, wrong: 0 } };
    const [d] = masteryDeltas(before, after);
    expect(d?.newlyProven).toBe(true);
    // war es vorher schon belegt, ist daran nichts neu
    const [d2] = masteryDeltas(
      { routing: { correct: 4, wrong: 0 } },
      { routing: { correct: 5, wrong: 0 } },
    );
    expect(d2?.newlyProven).toBe(false);
  });

  it('groesste Bewegung zuerst — das ist die Zeile, die man lesen soll', () => {
    const before: MasteryMap = {
      address: { correct: 2, wrong: 2 }, // 50 %
      service: { correct: 2, wrong: 2 }, // 50 %
      vip: { correct: 2, wrong: 2 }, // 50 %
    };
    const after: MasteryMap = {
      address: { correct: 2, wrong: 3 }, // 40 % → −10
      service: { correct: 4, wrong: 2 }, // 67 % → +17
      vip: { correct: 6, wrong: 2 }, // 75 % → +25
    };
    expect(masteryDeltas(before, after).map((d) => d.concept)).toEqual([
      'vip',
      'service',
      'address',
    ]);
  });

  /**
   * Gleicher Betrag, verschiedene Richtung: der Abschnitt ist die Belohnung
   * der Sitzung, nicht ihr Zeugnis — also steht der Fortschritt oben. Ohne
   * diese Regel entschiede die Reihenfolge von CONCEPTS, also der Zufall.
   */
  it('bei gleichem Betrag steht der Fortschritt vor dem Rueckschritt', () => {
    const before: MasteryMap = {
      address: { correct: 2, wrong: 2 },
      service: { correct: 2, wrong: 2 },
    };
    const after: MasteryMap = {
      address: { correct: 2, wrong: 3 }, // −10
      service: { correct: 3, wrong: 2 }, // +10
    };
    expect(masteryDeltas(before, after).map((d) => d.concept)).toEqual(['service', 'address']);
  });

  it('erste Sitzung ueberhaupt: leerer Vorstand ergibt trotzdem Zeilen', () => {
    const deltas = masteryDeltas({}, { service: { correct: 3, wrong: 2 } });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ before: 0, attemptsAdded: 5, newlyProven: true });
  });

  it('nichts passiert ⇒ keine Zeilen, der Abschnitt bleibt weg', () => {
    const same: MasteryMap = { service: { correct: 2, wrong: 1 } };
    expect(masteryDeltas(same, same)).toEqual([]);
    expect(masteryDeltas({}, {})).toEqual([]);
  });
});
