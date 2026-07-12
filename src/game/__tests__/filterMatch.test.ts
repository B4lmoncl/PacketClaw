import { describe, expect, it } from 'vitest';
import { createResolver, makeConfig } from '../../engine';
import type { NetworkConfig } from '../../engine';
import { entryMatchesQuery } from '../filterMatch';

const config: NetworkConfig = makeConfig({
  interfaces: [
    { id: 'port1', name: 'port1' },
    { id: 'port2', name: 'port2' },
    { id: 'wan1', name: 'wan1' },
  ],
  zones: [{ id: 'inside', name: 'inside', members: ['port1', 'port2'] }],
  addresses: [
    { id: 'LAN_NET', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
    { id: 'SRV_WEB01', name: 'SRV_WEB01', type: 'host', host: '172.16.0.10' },
    {
      id: 'MGMT_RANGE',
      name: 'MGMT_RANGE',
      type: 'range',
      range: { from: '10.0.1.10', to: '10.0.1.19' },
    },
  ],
  addressGroups: [
    { id: 'SERVERS', name: 'SERVERS', members: ['SRV_WEB01'] },
    { id: 'INTERNAL', name: 'INTERNAL', members: ['LAN_NET', 'SERVERS'] },
  ],
  services: [
    { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
    { id: 'HTTP', name: 'HTTP', protocol: 'tcp', dstPorts: [{ from: 80, to: 80 }] },
    { id: 'HIGH_PORTS', name: 'HIGH_PORTS', protocol: 'tcp', dstPorts: [{ from: 400, to: 500 }] },
  ],
  serviceGroups: [{ id: 'WEB', name: 'WEB', members: ['HTTPS', 'HTTP'] }],
  vips: [{ id: 'VIP_WEB', name: 'VIP_WEB', extIp: '203.0.113.10', mappedIp: '172.16.0.10' }],
});
const resolver = createResolver(config);

const m = (
  field: 'srcaddr' | 'dstaddr' | 'service' | 'srcintf' | 'dstintf',
  entry: string,
  query: string,
  mode: 'exact' | 'contains',
) => entryMatchesQuery(config, resolver, field, entry, query, mode);

describe('Service-Filter: Port 443', () => {
  it('EXACT: nur Services, die genau Port 443 sind', () => {
    expect(m('service', 'HTTPS', '443', 'exact')).toBe(true);
    expect(m('service', 'WEB', '443', 'exact')).toBe(false); // Gruppe ≠ exakt 443
    expect(m('service', 'HIGH_PORTS', '443', 'exact')).toBe(false); // Range ≠ exakt
    expect(m('service', 'ALL', '443', 'exact')).toBe(false);
  });

  it('CONTAINS: Gruppen, Portranges und ALL, die 443 enthalten', () => {
    expect(m('service', 'HTTPS', '443', 'contains')).toBe(true);
    expect(m('service', 'WEB', '443', 'contains')).toBe(true); // WEB ⊃ HTTPS(443)
    expect(m('service', 'HIGH_PORTS', '443', 'contains')).toBe(true); // 400-500 ⊃ 443
    expect(m('service', 'ALL', '443', 'contains')).toBe(true);
    expect(m('service', 'HTTP', '443', 'contains')).toBe(false); // 80 ⊅ 443
  });

  it('Service-NAME: contains findet die Gruppe, die ihn enthält', () => {
    expect(m('service', 'WEB', 'HTTPS', 'contains')).toBe(true);
    expect(m('service', 'WEB', 'HTTPS', 'exact')).toBe(false);
    expect(m('service', 'HTTPS', 'https', 'exact')).toBe(true); // Name selbst, ci
  });
});

describe('Interface-Filter', () => {
  it('EXACT: nur das Interface selbst', () => {
    expect(m('srcintf', 'port1', 'port1', 'exact')).toBe(true);
    expect(m('srcintf', 'inside', 'port1', 'exact')).toBe(false);
    expect(m('srcintf', 'any', 'port1', 'exact')).toBe(false);
  });

  it('CONTAINS: Zone enthält Member, any enthält alles', () => {
    expect(m('srcintf', 'inside', 'port1', 'contains')).toBe(true);
    expect(m('dstintf', 'any', 'port1', 'contains')).toBe(true);
    expect(m('srcintf', 'inside', 'wan1', 'contains')).toBe(false);
  });
});

describe('Adress-Filter: IP', () => {
  it('EXACT: nur Host-Objekte mit genau dieser IP', () => {
    expect(m('dstaddr', 'SRV_WEB01', '172.16.0.10', 'exact')).toBe(true);
    expect(m('dstaddr', 'SERVERS', '172.16.0.10', 'exact')).toBe(false); // Gruppe
    expect(m('srcaddr', 'LAN_NET', '10.0.1.5', 'exact')).toBe(false); // Subnetz
    expect(m('srcaddr', 'all', '10.0.1.5', 'exact')).toBe(false);
  });

  it('CONTAINS: Subnetz/Range/Gruppe/all, die die IP enthalten', () => {
    expect(m('srcaddr', 'LAN_NET', '10.0.1.5', 'contains')).toBe(true);
    expect(m('srcaddr', 'MGMT_RANGE', '10.0.1.15', 'contains')).toBe(true);
    expect(m('srcaddr', 'MGMT_RANGE', '10.0.1.5', 'contains')).toBe(false);
    expect(m('dstaddr', 'INTERNAL', '172.16.0.10', 'contains')).toBe(true); // via SERVERS→SRV_WEB01
    expect(m('srcaddr', 'all', '10.0.1.5', 'contains')).toBe(true);
  });

  it('CONTAINS: VIP matcht ueber externe und gemappte IP', () => {
    expect(m('dstaddr', 'VIP_WEB', '203.0.113.10', 'contains')).toBe(true);
    expect(m('dstaddr', 'VIP_WEB', '172.16.0.10', 'contains')).toBe(true);
    expect(m('dstaddr', 'VIP_WEB', '9.9.9.9', 'contains')).toBe(false);
  });
});

describe('Adress-Filter: Objektname (Host in Gruppe)', () => {
  it('EXACT: nur der Eintrag selbst', () => {
    expect(m('dstaddr', 'SRV_WEB01', 'SRV_WEB01', 'exact')).toBe(true);
    expect(m('dstaddr', 'SERVERS', 'SRV_WEB01', 'exact')).toBe(false);
  });

  it('CONTAINS: Gruppen, die das Objekt (rekursiv) enthalten', () => {
    expect(m('dstaddr', 'SERVERS', 'SRV_WEB01', 'contains')).toBe(true);
    expect(m('dstaddr', 'INTERNAL', 'SRV_WEB01', 'contains')).toBe(true); // verschachtelt
    expect(m('dstaddr', 'INTERNAL', 'LAN_NET', 'contains')).toBe(true);
    expect(m('dstaddr', 'all', 'SRV_WEB01', 'contains')).toBe(true);
    expect(m('dstaddr', 'LAN_NET', 'SRV_WEB01', 'contains')).toBe(false);
  });
});
