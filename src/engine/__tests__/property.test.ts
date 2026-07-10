import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeConfig, makePolicy } from '../config';
import { evaluate } from '../evaluate';
import type { NetworkConfig, Packet, Policy, TraceStep } from '../types';

// ---------------------------------------------------------------------------
// Feste Objektbibliothek — die Policies/Pakete werden zufällig kombiniert
// ---------------------------------------------------------------------------

const IFACE_NAMES = ['port1', 'port2', 'wan1', 'vlan20'] as const;

const LIBRARY = makeConfig({
  interfaces: IFACE_NAMES.map((name, i) => ({ id: `if-${i}`, name })),
  zones: [{ id: 'z-1', name: 'inside', members: ['if-0', 'if-3'] }],
  addresses: [
    { id: 'a-1', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
    { id: 'a-2', name: 'DMZ_NET', type: 'subnet', subnet: '172.16.0.0/24' },
    { id: 'a-3', name: 'SRV_WEB01', type: 'host', host: '172.16.0.10' },
    { id: 'a-4', name: 'MGMT_RANGE', type: 'range', range: { from: '10.0.1.10', to: '10.0.1.19' } },
  ],
  addressGroups: [{ id: 'g-1', name: 'PRIVATE', members: ['LAN_NET', 'DMZ_NET'] }],
  services: [
    { id: 's-1', name: 'HTTP', protocol: 'tcp', dstPorts: [{ from: 80, to: 80 }] },
    { id: 's-2', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
    { id: 's-3', name: 'DNS', protocol: 'udp', dstPorts: [{ from: 53, to: 53 }] },
    { id: 's-4', name: 'PING', protocol: 'icmp', icmpType: 8 },
  ],
  serviceGroups: [{ id: 'sg-1', name: 'WEB', members: ['HTTP', 'HTTPS'] }],
  vips: [
    {
      id: 'v-1',
      name: 'VIP_WEB',
      extIp: '203.0.113.10',
      extPort: 443,
      mappedIp: '172.16.0.10',
      mappedPort: 8443,
      protocol: 'tcp',
    },
  ],
});

const ADDR_ENTRIES = ['LAN_NET', 'DMZ_NET', 'SRV_WEB01', 'MGMT_RANGE', 'PRIVATE', 'all'];
const DST_ENTRIES = [...ADDR_ENTRIES, 'VIP_WEB'];
const SVC_ENTRIES = ['HTTP', 'HTTPS', 'DNS', 'PING', 'WEB', 'ALL'];
const INTF_ENTRIES = [...IFACE_NAMES, 'inside', 'any'];

const IP_POOL = [
  '10.0.1.5',
  '10.0.1.15',
  '10.0.1.255',
  '172.16.0.10',
  '172.16.0.53',
  '203.0.113.10',
  '8.8.8.8',
  '198.51.100.77',
];

function nonEmptySubarray(items: readonly string[]): fc.Arbitrary<string[]> {
  return fc.subarray([...items], { minLength: 1 });
}

const arbPolicyPartial = fc.record({
  srcintf: nonEmptySubarray(INTF_ENTRIES),
  dstintf: nonEmptySubarray(INTF_ENTRIES),
  srcaddr: nonEmptySubarray(ADDR_ENTRIES),
  dstaddr: nonEmptySubarray(DST_ENTRIES),
  service: nonEmptySubarray(SVC_ENTRIES),
  action: fc.constantFrom<'accept' | 'deny'>('accept', 'deny'),
  enabled: fc.boolean(),
  nat: fc.boolean(),
  schedule: fc.constantFrom<'always' | 'work-hours'>('always', 'work-hours'),
});

const arbConfig: fc.Arbitrary<NetworkConfig> = fc
  .tuple(fc.array(arbPolicyPartial, { minLength: 0, maxLength: 8 }), fc.boolean())
  .map(([partials, includeDefaultRoute]) => ({
    ...LIBRARY,
    routes: [
      { dst: '10.0.1.0/24', iface: 'port1' },
      { dst: '172.16.0.0/24', iface: 'port2' },
      ...(includeDefaultRoute ? [{ dst: '0.0.0.0/0', iface: 'wan1' }] : []),
    ],
    policies: partials.map((partial, index) => makePolicy({ ...partial, id: index + 1 })),
  }));

const arbPacket: fc.Arbitrary<Packet> = fc
  .record({
    srcintf: fc.constantFrom(...IFACE_NAMES),
    srcIp: fc.constantFrom(...IP_POOL),
    dstIp: fc.constantFrom(...IP_POOL),
    protocol: fc.constantFrom<'tcp' | 'udp' | 'icmp'>('tcp', 'udp', 'icmp'),
    dstPort: fc.constantFrom(80, 443, 53, 3389, 1, 65535),
    icmpType: fc.constantFrom(0, 8),
    withTimestamp: fc.boolean(),
    timestamp: fc.constantFrom('2026-07-10T09:00:00', '2026-07-11T22:00:00'),
  })
  .map(({ withTimestamp, timestamp, icmpType, dstPort, ...rest }): Packet => {
    const packet: Packet = { ...rest };
    if (rest.protocol === 'icmp') packet.icmpType = icmpType;
    else packet.dstPort = dstPort;
    if (withTimestamp) packet.timestamp = timestamp;
    return packet;
  });

// ---------------------------------------------------------------------------

function isTerminal(step: TraceStep): boolean {
  return step.kind === 'policy-match' || step.kind === 'implicit-deny' || step.kind === 'no-route';
}

describe('Engine-Invarianten (Property-Tests)', () => {
  it('genau ein Verdict; matchedPolicyId ∈ {0} ∪ enabled-IDs; Aktion konsistent', () => {
    fc.assert(
      fc.property(arbConfig, arbPacket, (config, packet) => {
        const verdict = evaluate(packet, config);

        expect(['accept', 'deny']).toContain(verdict.action);

        const enabledIds = config.policies.filter((p) => p.enabled).map((p) => p.id);
        expect([0, ...enabledIds]).toContain(verdict.matchedPolicyId);

        if (verdict.matchedPolicyId !== 0) {
          const matched = config.policies.find((p) => p.id === verdict.matchedPolicyId) as Policy;
          expect(matched.enabled).toBe(true);
          expect(verdict.action).toBe(matched.action);
          expect(verdict.natApplied).toBe(matched.action === 'accept' && matched.nat);
        } else {
          expect(verdict.action).toBe('deny');
          expect(verdict.natApplied).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('Trace ist konsistent zum Verdict', () => {
    fc.assert(
      fc.property(arbConfig, arbPacket, (config, packet) => {
        const verdict = evaluate(packet, config);
        const trace = verdict.trace;

        // Genau ein Terminal-Schritt, und zwar am Ende
        const terminals = trace.filter(isTerminal);
        expect(terminals).toHaveLength(1);
        expect(isTerminal(trace[trace.length - 1] as TraceStep)).toBe(true);

        const last = trace[trace.length - 1] as TraceStep;
        if (verdict.matchedPolicyId === 0) {
          expect(last.kind === 'implicit-deny' || last.kind === 'no-route').toBe(true);
        } else {
          expect(last).toMatchObject({ kind: 'policy-match', policyId: verdict.matchedPolicyId });
        }

        if (last.kind === 'no-route') {
          expect(verdict.dstintf).toBe('');
          expect(trace.some((s) => s.kind.startsWith('policy'))).toBe(false);
          return;
        }

        // Jede Policy bis zum Match hat genau einen Trace-Eintrag in Listenreihenfolge
        const policySteps = trace.filter((s) => 'policyId' in s);
        const expectedIds: number[] = [];
        for (const p of config.policies) {
          expectedIds.push(p.id);
          if (p.id === verdict.matchedPolicyId) break;
        }
        expect(policySteps.map((s) => (s as { policyId: number }).policyId)).toEqual(expectedIds);

        // disabled ⇒ skipped, enabled ⇒ no-match oder match
        for (const step of policySteps) {
          const policy = config.policies.find(
            (p) => p.id === (step as { policyId: number }).policyId,
          ) as Policy;
          if (policy.enabled) {
            expect(step.kind === 'policy-no-match' || step.kind === 'policy-match').toBe(true);
          } else {
            expect(step.kind).toBe('policy-skipped');
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('Evaluation ist deterministisch', () => {
    fc.assert(
      fc.property(arbConfig, arbPacket, (config, packet) => {
        expect(evaluate(packet, config)).toEqual(evaluate(packet, config));
      }),
      { numRuns: 100 },
    );
  });

  it('dnat nur bei akzeptiertem VIP-Traffic', () => {
    fc.assert(
      fc.property(arbConfig, arbPacket, (config, packet) => {
        const verdict = evaluate(packet, config);
        if (verdict.dnat) {
          expect(verdict.action).toBe('accept');
          expect(verdict.trace.some((s) => s.kind === 'dnat')).toBe(true);
        }
        if (verdict.action === 'deny') {
          expect(verdict.dnat).toBeUndefined();
        }
      }),
      { numRuns: 200 },
    );
  });
});
