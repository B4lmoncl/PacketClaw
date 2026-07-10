import { describe, expect, it } from 'vitest';
import { makeConfig, makePolicy } from '../config';
import { evaluate } from '../evaluate';
import type { TraceStep } from '../types';
import { baseConfig, lanToWanHttps } from './fixtures';

function lastStep(trace: TraceStep[]): TraceStep {
  return trace[trace.length - 1] as TraceStep;
}

describe('Implicit Deny', () => {
  it('leeres Regelwerk → deny mit Policy 0', () => {
    const verdict = evaluate(lanToWanHttps(), baseConfig());
    expect(verdict.action).toBe('deny');
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.natApplied).toBe(false);
    expect(lastStep(verdict.trace)).toEqual({ kind: 'implicit-deny' });
  });

  it('keine passende Policy → deny 0, Trace listet jedes gescheiterte Feld', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcaddr: ['GUEST_NET'] }), // srcIp ist LAN
        makePolicy({ id: 2, service: ['DNS'] }), // Paket ist HTTPS
      ],
    });
    const verdict = evaluate(lanToWanHttps(), config);
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'srcaddr',
    });
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 2,
      failedField: 'service',
    });
  });
});

describe('Top-down, First Match', () => {
  it('die erste passende Policy gewinnt — Reihenfolge schlägt Spezifität', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 10, action: 'accept' }), // any/any accept
        makePolicy({ id: 20, action: 'deny', srcaddr: ['LAN_NET'], service: ['HTTPS'] }),
      ],
    });
    const verdict = evaluate(lanToWanHttps(), config);
    expect(verdict.action).toBe('accept');
    expect(verdict.matchedPolicyId).toBe(10);
    // nach dem Match wird abgebrochen: Policy 20 taucht nicht im Trace auf
    expect(verdict.trace.some((s) => 'policyId' in s && s.policyId === 20)).toBe(false);
  });

  it('Deny vor Accept blockt', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, action: 'deny', srcaddr: ['MGMT_RANGE'] }),
        makePolicy({ id: 2, action: 'accept' }),
      ],
    });
    const fromMgmt = evaluate(lanToWanHttps({ srcIp: '10.0.1.15' }), config);
    expect(fromMgmt.action).toBe('deny');
    expect(fromMgmt.matchedPolicyId).toBe(1);

    const fromOther = evaluate(lanToWanHttps({ srcIp: '10.0.1.99' }), config);
    expect(fromOther.action).toBe('accept');
    expect(fromOther.matchedPolicyId).toBe(2);
  });

  it('disabled Policies werden übersprungen und im Trace markiert', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, enabled: false, action: 'deny' }),
        makePolicy({ id: 2, action: 'accept' }),
      ],
    });
    const verdict = evaluate(lanToWanHttps(), config);
    expect(verdict.action).toBe('accept');
    expect(verdict.matchedPolicyId).toBe(2);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-skipped',
      policyId: 1,
      reason: 'disabled',
    });
  });
});

describe('Routing', () => {
  it('keine Route → deny 0 mit no-route-Trace, dstintf leer', () => {
    const config = baseConfig({
      routes: [{ dst: '10.0.1.0/24', iface: 'port1' }],
      policies: [makePolicy({ id: 1 })],
    });
    const verdict = evaluate(lanToWanHttps({ dstIp: '8.8.8.8' }), config);
    expect(verdict.action).toBe('deny');
    expect(verdict.matchedPolicyId).toBe(0);
    expect(verdict.dstintf).toBe('');
    expect(verdict.trace).toContainEqual({ kind: 'no-route' });
    // Policies werden gar nicht erst geprüft
    expect(verdict.trace.some((s) => s.kind.startsWith('policy'))).toBe(false);
  });

  it('Longest-Prefix-Match bestimmt dstintf (/24 schlägt /16)', () => {
    const config = baseConfig({
      routes: [
        { dst: '172.16.0.0/16', iface: 'wan1' },
        { dst: '172.16.0.0/24', iface: 'port2' },
        { dst: '0.0.0.0/0', iface: 'wan1' },
      ],
      policies: [makePolicy({ id: 1, dstintf: ['port2'] })],
    });
    const toDmz = evaluate(lanToWanHttps({ dstIp: '172.16.0.10' }), config);
    expect(toDmz.dstintf).toBe('port2');
    expect(toDmz.matchedPolicyId).toBe(1);

    const toOther = evaluate(lanToWanHttps({ dstIp: '172.16.1.10' }), config);
    expect(toOther.dstintf).toBe('wan1');
    expect(toOther.matchedPolicyId).toBe(0);
    expect(toOther.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'dstintf',
    });
  });
});

describe('Interface- und Zonen-Matching', () => {
  it('Zone im srcintf matcht Member-Interfaces', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['inside'] })],
    });
    expect(evaluate(lanToWanHttps({ srcintf: 'port1' }), config).matchedPolicyId).toBe(1);
    expect(
      evaluate(lanToWanHttps({ srcintf: 'vlan20', srcIp: '10.0.20.5' }), config).matchedPolicyId,
    ).toBe(1);
    const fromDmz = evaluate(lanToWanHttps({ srcintf: 'port2', srcIp: '172.16.0.10' }), config);
    expect(fromDmz.matchedPolicyId).toBe(0);
    expect(fromDmz.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'srcintf',
    });
  });

  it('"any" im Interface-Feld matcht alle Interfaces', () => {
    const config = baseConfig({ policies: [makePolicy({ id: 1, srcintf: ['any'] })] });
    expect(evaluate(lanToWanHttps({ srcintf: 'wan1' }), config).matchedPolicyId).toBe(1);
  });
});

describe('Feld-Reihenfolge im Trace', () => {
  it('meldet das ERSTE gescheiterte Feld (srcintf vor service)', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcintf: ['port2'], service: ['DNS'] })],
    });
    // Sowohl srcintf als auch service würden scheitern — srcintf wird gemeldet
    const verdict = evaluate(lanToWanHttps(), config);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'srcintf',
    });
  });

  it('meldet dstaddr, wenn srcaddr passt', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcaddr: ['LAN_NET'], dstaddr: ['DMZ_NET'] })],
    });
    const verdict = evaluate(lanToWanHttps(), config); // dst ist Internet
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'dstaddr',
    });
  });
});

describe('Adress- und Service-Matching in Policies', () => {
  it('Gruppen matchen rekursiv', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcaddr: ['ALL_PRIVATE'], service: ['OFFICE'] })],
    });
    // GUEST_NET via INTERNAL via ALL_PRIVATE; HTTP via WEB via STANDARD via OFFICE
    const verdict = evaluate(
      lanToWanHttps({ srcintf: 'vlan20', srcIp: '10.0.20.7', dstPort: 80 }),
      config,
    );
    expect(verdict.matchedPolicyId).toBe(1);
  });

  it('ICMP-Pakete matchen ohne Port', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, service: ['PING'] })],
    });
    const ping = evaluate(
      { srcintf: 'port1', srcIp: '10.0.1.5', dstIp: '8.8.8.8', protocol: 'icmp', icmpType: 8 },
      config,
    );
    expect(ping.matchedPolicyId).toBe(1);

    const unreachable = evaluate(
      { srcintf: 'port1', srcIp: '10.0.1.5', dstIp: '8.8.8.8', protocol: 'icmp', icmpType: 3 },
      config,
    );
    expect(unreachable.matchedPolicyId).toBe(0);
  });

  it('"all"/"ALL" matchen jede IP / jeden Service', () => {
    const config = baseConfig({
      policies: [makePolicy({ id: 1, srcaddr: ['all'], dstaddr: ['all'], service: ['ALL'] })],
    });
    const verdict = evaluate(
      { srcintf: 'wan1', srcIp: '203.0.113.99', dstIp: '10.0.1.1', protocol: 'udp', dstPort: 1 },
      config,
    );
    expect(verdict.matchedPolicyId).toBe(1);
  });
});

describe('Schedule in der Evaluation', () => {
  const config = baseConfig({
    policies: [
      makePolicy({ id: 1, schedule: 'work-hours', action: 'accept' }),
      makePolicy({ id: 2, schedule: 'always', action: 'deny' }),
    ],
  });

  it('work-hours matcht innerhalb der Arbeitszeit', () => {
    const verdict = evaluate(lanToWanHttps({ timestamp: '2026-07-10T09:00:00' }), config);
    expect(verdict.matchedPolicyId).toBe(1);
  });

  it('außerhalb: fällt auf die nächste Policy durch, failedField=schedule', () => {
    const verdict = evaluate(lanToWanHttps({ timestamp: '2026-07-11T09:00:00' }), config);
    expect(verdict.matchedPolicyId).toBe(2);
    expect(verdict.trace).toContainEqual({
      kind: 'policy-no-match',
      policyId: 1,
      failedField: 'schedule',
    });
  });

  it('ohne Timestamp matchen nur always-Policies', () => {
    const verdict = evaluate(lanToWanHttps(), config);
    expect(verdict.matchedPolicyId).toBe(2);
  });
});

describe('SNAT-Flag', () => {
  it('accept + nat → natApplied', () => {
    const config = baseConfig({ policies: [makePolicy({ id: 1, nat: true })] });
    expect(evaluate(lanToWanHttps(), config).natApplied).toBe(true);
  });

  it('accept ohne nat → kein natApplied', () => {
    const config = baseConfig({ policies: [makePolicy({ id: 1, nat: false })] });
    expect(evaluate(lanToWanHttps(), config).natApplied).toBe(false);
  });

  it('deny + nat → natApplied bleibt false', () => {
    const config = baseConfig({ policies: [makePolicy({ id: 1, action: 'deny', nat: true })] });
    expect(evaluate(lanToWanHttps(), config).natApplied).toBe(false);
  });
});

describe('Determinismus', () => {
  it('zweifache Evaluation liefert identische Verdicts', () => {
    const config = baseConfig({
      policies: [
        makePolicy({ id: 1, srcaddr: ['GUEST_NET'] }),
        makePolicy({ id: 2, enabled: false }),
        makePolicy({ id: 3, action: 'deny', service: ['WEB'] }),
      ],
    });
    const packet = lanToWanHttps();
    expect(evaluate(packet, config)).toEqual(evaluate(packet, config));
  });
});

describe('makeConfig/makePolicy Defaults', () => {
  it('makeConfig füllt leere Collections', () => {
    const config = makeConfig({});
    expect(config.policies).toEqual([]);
    expect(config.vips).toEqual([]);
  });

  it('makePolicy setzt any/all/ALL-Defaults', () => {
    const policy = makePolicy({ id: 7 });
    expect(policy.srcintf).toEqual(['any']);
    expect(policy.srcaddr).toEqual(['all']);
    expect(policy.service).toEqual(['ALL']);
    expect(policy.enabled).toBe(true);
    expect(policy.name).toBe('policy-7');
  });
});
