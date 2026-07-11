import { describe, expect, it } from 'vitest';
import { makeConfig } from '../../engine';
import type { NetworkConfig } from '../../engine';
import { resolveObjectInfo } from '../objectInfo';

const config: NetworkConfig = makeConfig({
  interfaces: [
    { id: 'port1', name: 'port1' },
    { id: 'port2', name: 'port2' },
    { id: 'wan1', name: 'wan1' },
  ],
  zones: [{ id: 'LAN', name: 'LAN', members: ['port1', 'port2'] }],
  addresses: [
    { id: 'LAN_NET', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
    { id: 'SRV_WEB01', name: 'SRV_WEB01', type: 'host', host: '172.16.0.10' },
    {
      id: 'DHCP_POOL',
      name: 'DHCP_POOL',
      type: 'range',
      range: { from: '10.0.1.100', to: '10.0.1.199' },
    },
  ],
  addressGroups: [
    { id: 'SERVERS', name: 'SERVERS', members: ['SRV_WEB01'] },
    { id: 'INTERNAL', name: 'INTERNAL', members: ['LAN_NET', 'SERVERS'] },
    { id: 'LOOP_A', name: 'LOOP_A', members: ['LOOP_B'] },
    { id: 'LOOP_B', name: 'LOOP_B', members: ['LOOP_A', 'LAN_NET'] },
  ],
  services: [
    { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
    { id: 'WEB_ALT', name: 'WEB_ALT', protocol: 'tcp', dstPorts: [{ from: 8080, to: 8090 }] },
    { id: 'PING', name: 'PING', protocol: 'icmp' },
  ],
  serviceGroups: [{ id: 'WEB', name: 'WEB', members: ['HTTPS', 'WEB_ALT'] }],
  vips: [
    {
      id: 'VIP_WEB',
      name: 'VIP_WEB',
      extIp: '203.0.113.10',
      extPort: 443,
      mappedIp: '172.16.0.10',
      mappedPort: 8443,
    },
  ],
});

describe('resolveObjectInfo — Adressen', () => {
  it('Adressobjekt zeigt seinen Wert', () => {
    const info = resolveObjectInfo(config, 'srcaddr', 'LAN_NET');
    expect(info.kindKey).toBe('address');
    expect(info.value).toBe('10.0.1.0/24');
    const range = resolveObjectInfo(config, 'srcaddr', 'DHCP_POOL');
    expect(range.value).toBe('10.0.1.100–10.0.1.199');
  });

  it('Gruppe listet Mitglieder rekursiv mit Einrückung', () => {
    const info = resolveObjectInfo(config, 'dstaddr', 'INTERNAL');
    expect(info.kindKey).toBe('addressGroup');
    expect(info.lines).toEqual([
      { depth: 0, name: 'LAN_NET', detail: '10.0.1.0/24' },
      { depth: 0, name: 'SERVERS', group: true },
      { depth: 1, name: 'SRV_WEB01', detail: '172.16.0.10' },
    ]);
  });

  it('Zyklen terminieren', () => {
    const info = resolveObjectInfo(config, 'srcaddr', 'LOOP_A');
    expect(info.lines.some((l) => l.name === 'LAN_NET')).toBe(true);
    expect(info.lines.length).toBeLessThan(10);
  });

  it('"all" traegt den DNAT-Hinweis nur auf dstaddr', () => {
    expect(resolveObjectInfo(config, 'dstaddr', 'all').noteKey).toBe('allDst');
    expect(resolveObjectInfo(config, 'srcaddr', 'all').noteKey).toBe('allSrc');
  });

  it('VIP zeigt ext → mapped inkl. Ports', () => {
    const info = resolveObjectInfo(config, 'dstaddr', 'VIP_WEB');
    expect(info.kindKey).toBe('vip');
    expect(info.value).toBe('203.0.113.10:443 → 172.16.0.10:8443');
  });

  it('unbekanntes Objekt wird als unknown markiert', () => {
    expect(resolveObjectInfo(config, 'srcaddr', 'NOPE').kindKey).toBe('unknown');
  });
});

describe('resolveObjectInfo — Services & Interfaces', () => {
  it('Service zeigt Protokoll/Port, Portranges als Bereich', () => {
    expect(resolveObjectInfo(config, 'service', 'HTTPS').value).toBe('TCP/443');
    expect(resolveObjectInfo(config, 'service', 'WEB_ALT').value).toBe('TCP/8080-8090');
    expect(resolveObjectInfo(config, 'service', 'PING').value).toBe('ICMP');
  });

  it('Service-Gruppe listet Mitglieder', () => {
    const info = resolveObjectInfo(config, 'service', 'WEB');
    expect(info.kindKey).toBe('serviceGroup');
    expect(info.lines.map((l) => l.detail)).toEqual(['TCP/443', 'TCP/8080-8090']);
  });

  it('Zone listet Member-Interfaces, Interface kennt seine Zone', () => {
    const zone = resolveObjectInfo(config, 'srcintf', 'LAN');
    expect(zone.kindKey).toBe('zone');
    expect(zone.lines.map((l) => l.name)).toEqual(['port1', 'port2']);
    const iface = resolveObjectInfo(config, 'srcintf', 'port1');
    expect(iface.kindKey).toBe('iface');
    expect(iface.value).toBe('LAN');
    expect(resolveObjectInfo(config, 'dstintf', 'wan1').value).toBeUndefined();
  });

  it('any/ALL werden markiert', () => {
    expect(resolveObjectInfo(config, 'srcintf', 'any').noteKey).toBe('anyIface');
    expect(resolveObjectInfo(config, 'service', 'ALL').noteKey).toBe('allService');
  });
});
