import { describe, expect, it } from 'vitest';
import { evaluate, makeConfig, makePolicy } from '../../engine';
import type { NetworkConfig, Packet } from '../../engine';
import { debugFlowLines } from '../debugFlow';

const network: NetworkConfig = makeConfig({
  interfaces: [
    { id: 'port1', name: 'port1' },
    { id: 'port2', name: 'port2' },
    { id: 'wan1', name: 'wan1' },
  ],
  addresses: [{ id: 'LAN_NET', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' }],
  services: [{ id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] }],
  vips: [
    {
      id: 'VIP_WEB',
      name: 'VIP_WEB',
      extIp: '203.0.113.10',
      extPort: 443,
      mappedIp: '172.16.0.10',
      protocol: 'tcp',
    },
  ],
  routes: [
    { dst: '172.16.0.0/24', iface: 'port2' },
    { dst: '0.0.0.0/0', iface: 'wan1' },
  ],
  policies: [
    makePolicy({
      id: 1,
      name: 'lan-out',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET'],
      service: ['HTTPS'],
      nat: true,
    }),
    makePolicy({
      id: 2,
      name: 'vip-in',
      srcintf: ['wan1'],
      dstintf: ['port2'],
      dstaddr: ['VIP_WEB'],
      service: ['HTTPS'],
    }),
  ],
});

const lanPacket: Packet = {
  srcintf: 'port1',
  srcIp: '10.0.1.5',
  dstIp: '203.0.113.50',
  protocol: 'tcp',
  dstPort: 443,
};

describe('debugFlowLines', () => {
  it('ACCEPT mit SNAT: received → session → route → Allowed by Policy-1: SNAT', () => {
    const verdict = evaluate(lanPacket, network);
    const lines = debugFlowLines(lanPacket, verdict);
    expect(lines[0]).toContain('received a packet(proto=6, 10.0.1.5:');
    expect(lines[0]).toContain('from port1');
    expect(lines[1]).toContain('allocate a new session-');
    expect(lines.some((l) => l.includes('find a route') && l.includes('via wan1'))).toBe(true);
    expect(lines.at(-1)).toContain('Allowed by Policy-1: SNAT');
  });

  it('DNAT-Verbindung: VIP-Zeile mit Uebersetzung vor der Route', () => {
    const packet: Packet = {
      srcintf: 'wan1',
      srcIp: '198.51.100.7',
      dstIp: '203.0.113.10',
      protocol: 'tcp',
      dstPort: 443,
    };
    const verdict = evaluate(packet, network);
    const lines = debugFlowLines(packet, verdict);
    const dnat = lines.find((l) => l.includes('DNAT'));
    expect(dnat).toContain('VIP-VIP_WEB');
    expect(dnat).toContain('203.0.113.10:443->172.16.0.10:443');
    expect(lines.at(-1)).toContain('Allowed by Policy-2:');
  });

  it('Implicit Deny: Denied by forward policy check (policy 0)', () => {
    const packet: Packet = {
      srcintf: 'port2',
      srcIp: '172.16.0.99',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 22,
    };
    const verdict = evaluate(packet, network);
    const lines = debugFlowLines(packet, verdict);
    expect(lines.at(-1)).toContain('Denied by forward policy check (policy 0)');
  });

  it('deterministisch: gleiches Paket → identische Ausgabe', () => {
    const verdict = evaluate(lanPacket, network);
    expect(debugFlowLines(lanPacket, verdict)).toEqual(debugFlowLines(lanPacket, verdict));
  });
});
