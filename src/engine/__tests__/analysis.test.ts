import { describe, expect, it } from 'vitest';
import { findOverbroadPolicies, findRedundantPolicies, findShadowedPolicies } from '../analysis';
import { makePolicy } from '../config';
import type { Packet, TestPacket } from '../types';
import { baseConfig, lanToWanHttps } from './fixtures';

describe('findShadowedPolicies', () => {
  it('breite frühere Accept-Policy shadowt spätere spezifische', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1 }), // any/all/ALL
        makePolicy({ id: 2, srcaddr: ['LAN_NET'], service: ['HTTPS'], action: 'deny' }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('kein Shadowing, wenn die Services disjunkt sind', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, service: ['HTTP'] }),
        makePolicy({ id: 2, service: ['HTTPS'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([]);
  });

  it('Teilüberlappung reicht nicht: engere frühere Policy shadowt nicht', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcaddr: ['MGMT_RANGE'] }),
        makePolicy({ id: 2, srcaddr: ['LAN_NET'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([]);
  });

  it('Zone shadowt Policies auf ihre Member-Interfaces', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcintf: ['inside'] }),
        makePolicy({ id: 2, srcintf: ['vlan20'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('disabled Policies shadowen nicht und werden nicht gemeldet', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, enabled: false }),
        makePolicy({ id: 2, srcaddr: ['LAN_NET'] }),
        makePolicy({ id: 3, enabled: false, srcaddr: ['LAN_NET'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([]);
  });

  it('always shadowt work-hours, aber nicht umgekehrt', () => {
    const workHoursLater = baseConfig({
      policies: [
        makePolicy({ id: 1, schedule: 'always' }),
        makePolicy({ id: 2, schedule: 'work-hours' }),
      ],
    });
    expect(findShadowedPolicies(workHoursLater)).toEqual([{ policyId: 2, shadowedBy: 1 }]);

    const workHoursFirst = baseConfig({
      policies: [
        makePolicy({ id: 1, schedule: 'work-hours' }),
        makePolicy({ id: 2, schedule: 'always' }),
      ],
    });
    expect(findShadowedPolicies(workHoursFirst)).toEqual([]);
  });

  it('dstaddr "all" shadowt VIP-Policies NICHT (DNAT-Semantik)', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, dstaddr: ['all'] }),
        makePolicy({ id: 2, dstaddr: ['VIP_WEB'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([]);
  });

  it('gleiche VIP-Destination shadowt', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, dstaddr: ['VIP_WEB'] }),
        makePolicy({ id: 2, dstaddr: ['VIP_WEB'], service: ['HTTPS'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('Adressgruppen decken ihre Member ab (rekursiv)', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcaddr: ['ALL_PRIVATE'] }),
        makePolicy({ id: 2, srcaddr: ['GUEST_NET'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('benachbarte Portranges verschmelzen: [1..100]+[101..65535] deckt tcp voll ab', () => {
    const config = baseConfig({
      services: [
        ...baseConfig().services,
        {
          id: 'x-1',
          name: 'TCP_SPLIT',
          protocol: 'tcp',
          dstPorts: [
            { from: 1, to: 100 },
            { from: 101, to: 65535 },
          ],
        },
        { id: 'x-2', name: 'TCP_ANYPORT', protocol: 'tcp', dstPorts: [{ from: 1, to: 65535 }] },
      ],
      policies: [
        makePolicy({ id: 1, service: ['TCP_SPLIT'] }),
        makePolicy({ id: 2, service: ['TCP_ANYPORT'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('icmp ohne Typ deckt konkrete Typen ab, nicht umgekehrt', () => {
    const anyFirst = baseConfig({
      policies: [
        makePolicy({ id: 1, service: ['ICMP_ANY'] }),
        makePolicy({ id: 2, service: ['PING'] }),
      ],
    });
    expect(findShadowedPolicies(anyFirst)).toEqual([{ policyId: 2, shadowedBy: 1 }]);

    const pingFirst = baseConfig({
      policies: [
        makePolicy({ id: 1, service: ['PING'] }),
        makePolicy({ id: 2, service: ['ICMP_ANY'] }),
      ],
    });
    expect(findShadowedPolicies(pingFirst)).toEqual([]);
  });

  it('"ALL" wird von tcp-voll + udp-voll + icmp-any abgedeckt (Protokolluniversum)', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, service: ['TCP_FULL', 'UDP_FULL', 'ICMP_ANY'] }),
        makePolicy({ id: 2, service: ['ALL'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('icmp: konkreter Typ deckt nur denselben Typ ab', () => {
    const config = baseConfig({
      services: [
        ...baseConfig().services,
        { id: 'x-3', name: 'ICMP_REPLY', protocol: 'icmp', icmpType: 0 },
      ],
      policies: [
        makePolicy({ id: 1, service: ['PING'] }), // Typ 8
        makePolicy({ id: 2, service: ['ICMP_REPLY'] }), // Typ 0 — nicht abgedeckt
        makePolicy({ id: 3, service: ['PING'] }), // Typ 8 — abgedeckt
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 3, shadowedBy: 1 }]);
  });

  it('Service mit protocol "any" als Objekt wirkt wie ALL', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, service: ['ANY_SVC'] }),
        makePolicy({ id: 2, service: ['HTTPS'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('tcp/udp-Service ohne dstPorts deckt alle Ports des Protokolls ab', () => {
    const config = baseConfig({
      services: [...baseConfig().services, { id: 'x-4', name: 'TCP_PORTLESS', protocol: 'tcp' }],
      policies: [
        makePolicy({ id: 1, service: ['TCP_PORTLESS'] }),
        makePolicy({ id: 2, service: ['RDP'] }),
      ],
    });
    expect(findShadowedPolicies(config)).toEqual([{ policyId: 2, shadowedBy: 1 }]);
  });

  it('kaputte Adressobjekte (fehlende Felder) tragen keine Intervalle bei', () => {
    const config = baseConfig({
      addresses: [
        ...baseConfig().addresses,
        { id: 'b-1', name: 'BROKEN_SUBNET', type: 'subnet' },
        { id: 'b-2', name: 'BROKEN_RANGE', type: 'range' },
        { id: 'b-3', name: 'BROKEN_HOST', type: 'host' },
      ],
      policies: [
        makePolicy({ id: 1, srcaddr: ['BROKEN_SUBNET', 'BROKEN_RANGE', 'BROKEN_HOST'] }),
        makePolicy({ id: 2, srcaddr: ['LAN_NET'] }),
      ],
    });
    // Policy 1 hat eine leere Match-Menge → kann nichts shadowen
    expect(findShadowedPolicies(config)).toEqual([]);
  });

  it('Policies mit leerer Match-Menge (kaputte Referenz) werden nicht gemeldet', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1 }), makePolicy({ id: 2, srcaddr: ['GIBTS_NICHT'] })],
    });
    expect(findShadowedPolicies(config)).toEqual([]);
  });
});

describe('findRedundantPolicies', () => {
  const suite: Packet[] = [
    lanToWanHttps(),
    lanToWanHttps({ srcIp: '10.0.1.15', dstPort: 80 }),
    { srcintf: 'vlan20', srcIp: '10.0.20.5', dstIp: '8.8.8.8', protocol: 'udp', dstPort: 53 },
    { srcintf: 'wan1', srcIp: '198.51.100.1', dstIp: '10.0.1.5', protocol: 'tcp', dstPort: 3389 },
  ];

  it('doppelte Policy ist redundant', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcintf: ['inside'], nat: true }),
        makePolicy({ id: 2, srcintf: ['inside'], nat: true }),
      ],
    });
    expect(findRedundantPolicies(config, suite)).toEqual([1, 2]);
  });

  it('Policy, die kein Suite-Paket trifft, ist gegen die Suite redundant', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcaddr: ['P2P_NET'] }),
        makePolicy({ id: 2, srcintf: ['inside'] }),
      ],
    });
    expect(findRedundantPolicies(config, suite)).toContain(1);
    expect(findRedundantPolicies(config, suite)).not.toContain(2);
  });

  it('Policy mit anderem NAT-Verhalten ist nicht redundant', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcintf: ['inside'], nat: true }),
        makePolicy({ id: 2, srcintf: ['inside'], nat: false }),
      ],
    });
    // Ohne Policy 1 würde Policy 2 matchen — aber ohne NAT → Verhalten ändert sich
    expect(findRedundantPolicies(config, suite)).not.toContain(1);
  });

  it('Deny-Policy vor Accept ist nicht redundant, wenn die Suite sie braucht', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, action: 'deny', srcintf: ['wan1'] }), makePolicy({ id: 2 })],
    });
    expect(findRedundantPolicies(config, suite)).not.toContain(1);
  });

  it('disabled Policies werden nicht geprüft', () => {
    // Policy 1 (disabled) wäre "redundant", wird aber gar nicht erst bewertet;
    // Policy 2 trägt das Verhalten und ist damit nicht redundant.
    const config = baseConfig({
      policies: [makePolicy({ id: 1, enabled: false }), makePolicy({ id: 2 })],
    });
    expect(findRedundantPolicies(config, suite)).toEqual([]);
  });
});

describe('findOverbroadPolicies', () => {
  const mustPass: TestPacket[] = [
    { packet: lanToWanHttps(), expect: 'accept' },
    { packet: lanToWanHttps({ srcIp: '10.0.1.20', dstPort: 443 }), expect: 'accept' },
  ];
  const mustBlock: TestPacket[] = [
    {
      packet: {
        srcintf: 'port1',
        srcIp: '10.0.1.5',
        dstIp: '8.8.8.8',
        protocol: 'tcp',
        dstPort: 3389,
      },
      expect: 'deny',
    },
  ];

  it('service ALL lässt sich auf HTTPS härten', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['port1'], srcaddr: ['LAN_NET'], service: ['ALL'] })],
    });
    // must-block (RDP) schlägt aktuell fehl — genau deshalb ist die Policy zu breit
    const results = findOverbroadPolicies(config, [...mustPass, ...mustBlock]);
    expect(results).toContainEqual({
      policyId: 1,
      field: 'service',
      narrowerCandidates: ['HTTPS'],
    });
  });

  it('srcaddr all lässt sich auf das konkrete Objekt härten', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['port1'], srcaddr: ['all'], service: ['HTTPS'] })],
    });
    const results = findOverbroadPolicies(config, mustPass);
    const srcaddrFinding = results.find((r) => r.field === 'srcaddr');
    // MGMT_RANGE (10 IPs) ist für 10.0.1.5 kleiner… 10.0.1.5 liegt NICHT in der Range → LAN_NET
    expect(srcaddrFinding?.narrowerCandidates).toEqual(['LAN_NET']);
  });

  it('ohne must-pass-Treffer keine Empfehlung (konservativ)', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['port2'] })], // kein Suite-Paket kommt aus port2
    });
    expect(findOverbroadPolicies(config, mustPass)).toEqual([]);
  });

  it('keine Empfehlung, wenn die Bibliothek nichts Engeres hergibt', () => {
    const config = baseConfig({
      addresses: [], // keine Adressobjekte → srcaddr kann nicht gehärtet werden
      addressGroups: [],
      policies: [makePolicy({ id: 1, srcaddr: ['all'], service: ['HTTPS'] })],
    });
    const results = findOverbroadPolicies(config, mustPass);
    expect(results.filter((r) => r.field === 'srcaddr')).toEqual([]);
  });

  it('keine Empfehlung, wenn die Härtung must-pass-Traffic bricht', () => {
    // Suite braucht HTTPS UND DNS über dieselbe Any-Service-Policy;
    // Kandidaten {HTTPS, DNS} halten die Suite grün → Empfehlung MIT beiden.
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['inside'], service: ['ALL'] })],
    });
    const suite: TestPacket[] = [
      { packet: lanToWanHttps(), expect: 'accept' },
      {
        packet: {
          srcintf: 'vlan20',
          srcIp: '10.0.20.5',
          dstIp: '8.8.8.8',
          protocol: 'udp',
          dstPort: 53,
        },
        expect: 'accept',
      },
    ];
    const results = findOverbroadPolicies(config, suite);
    expect(results).toContainEqual({
      policyId: 1,
      field: 'service',
      narrowerCandidates: ['DNS', 'HTTPS'],
    });
  });

  it('Deny-Policies und disabled Policies werden ignoriert', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, action: 'deny' }),
        makePolicy({ id: 2, enabled: false }),
        makePolicy({ id: 3, srcintf: ['port1'], srcaddr: ['LAN_NET'], service: ['HTTPS'] }),
      ],
    });
    // Policy 3 hat kein breites Feld → keinerlei Findings
    expect(findOverbroadPolicies(config, mustPass)).toEqual([]);
  });

  it('icmp: PING (Typ 8) wird gegenüber ICMP_ANY bevorzugt (kleinerer Span)', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['port1'], srcaddr: ['LAN_NET'], service: ['ALL'] })],
    });
    const suite: TestPacket[] = [
      {
        packet: {
          srcintf: 'port1',
          srcIp: '10.0.1.5',
          dstIp: '8.8.8.8',
          protocol: 'icmp',
          icmpType: 8,
        },
        expect: 'accept',
      },
    ];
    const results = findOverbroadPolicies(config, suite);
    expect(results).toContainEqual({ policyId: 1, field: 'service', narrowerCandidates: ['PING'] });
  });

  it('bei gleichem Span entscheidet der Name; kaputte Objekte werden übersprungen', () => {
    const config = baseConfig({
      addresses: [
        ...baseConfig().addresses,
        { id: 'd-1', name: 'LAN_COPY', type: 'subnet', subnet: '10.0.1.0/24' },
        { id: 'd-2', name: 'BROKEN', type: 'host' },
      ],
      policies: [makePolicy({ id: 1, srcintf: ['port1'], srcaddr: ['all'], service: ['HTTPS'] })],
    });
    const results = findOverbroadPolicies(config, mustPass);
    const finding = results.find((r) => r.field === 'srcaddr');
    expect(finding?.narrowerCandidates).toEqual(['LAN_COPY']); // alphabetisch vor LAN_NET
  });

  it('keine Empfehlung, wenn die Suite unabhängig von der Härtung rot bleibt', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcintf: ['port1'], srcaddr: ['LAN_NET'], service: ['ALL'] }),
        makePolicy({ id: 2, srcintf: ['vlan20'] }), // akzeptiert fälschlich must-block-Traffic
      ],
    });
    const suite: TestPacket[] = [
      { packet: lanToWanHttps(), expect: 'accept' },
      {
        packet: {
          srcintf: 'vlan20',
          srcIp: '10.0.20.5',
          dstIp: '8.8.8.8',
          protocol: 'tcp',
          dstPort: 3389,
        },
        expect: 'deny',
      },
    ];
    const results = findOverbroadPolicies(config, suite);
    expect(results.filter((r) => r.policyId === 1)).toEqual([]);
  });

  it('srcintf any lässt sich auf das konkrete Interface härten', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['any'], srcaddr: ['LAN_NET'], service: ['HTTPS'] })],
    });
    const results = findOverbroadPolicies(config, mustPass);
    expect(results).toContainEqual({
      policyId: 1,
      field: 'srcintf',
      narrowerCandidates: ['port1'],
    });
  });
});
