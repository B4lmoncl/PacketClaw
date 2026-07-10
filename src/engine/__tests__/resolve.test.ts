import { describe, expect, it } from 'vitest';
import { makeConfig } from '../config';
import { addressObjectContainsIp, createResolver, serviceObjectMatches } from '../resolve';
import type { AddressObject, ServiceObject } from '../types';
import { baseConfig } from './fixtures';

describe('Gruppenauflösung', () => {
  const resolver = createResolver(baseConfig());

  it('löst verschachtelte Adressgruppen über 3 Ebenen auf', () => {
    const objs = resolver.resolveAddressEntry('ALL_PRIVATE');
    const names = objs.map((o) => o.name).sort();
    expect(names).toEqual(['DMZ_NET', 'GUEST_NET', 'LAN_NET']);
  });

  it('löst verschachtelte Servicegruppen über 3 Ebenen auf', () => {
    const svcs = resolver.resolveServiceEntry('OFFICE');
    const names = svcs.map((s) => s.name).sort();
    expect(names).toEqual(['DNS', 'DNS_TCP', 'HTTP', 'HTTPS', 'RDP']);
  });

  it('unbekannte Namen lösen zu nichts auf (matchen nie)', () => {
    expect(resolver.resolveAddressEntry('GIBTS_NICHT')).toEqual([]);
    expect(resolver.resolveServiceEntry('GIBTS_NICHT')).toEqual([]);
  });

  it('zyklische Gruppen terminieren und liefern die erreichbaren Objekte', () => {
    const cyclic = createResolver(
      makeConfig({
        addresses: [{ id: 'a', name: 'HOST_A', type: 'host', host: '10.0.0.1' }],
        addressGroups: [
          { id: 'g1', name: 'G1', members: ['G2', 'HOST_A'] },
          { id: 'g2', name: 'G2', members: ['G1'] },
        ],
      }),
    );
    expect(cyclic.resolveAddressEntry('G1').map((o) => o.name)).toEqual(['HOST_A']);
    // G2 → G1 → (G2 bereits gesehen) + HOST_A: erreichbare Objekte werden gefunden
    expect(cyclic.resolveAddressEntry('G2').map((o) => o.name)).toEqual(['HOST_A']);
  });

  it('zyklische Servicegruppen terminieren ebenfalls', () => {
    const cyclic = createResolver(
      makeConfig({
        services: [{ id: 's', name: 'HTTP', protocol: 'tcp', dstPorts: [{ from: 80, to: 80 }] }],
        serviceGroups: [
          { id: 'g1', name: 'SG1', members: ['SG2', 'HTTP'] },
          { id: 'g2', name: 'SG2', members: ['SG1'] },
        ],
      }),
    );
    expect(cyclic.resolveServiceEntry('SG1').map((s) => s.name)).toEqual(['HTTP']);
    expect(cyclic.resolveServiceEntry('SG2').map((s) => s.name)).toEqual(['HTTP']);
  });

  it('Memoisierung: wiederholte Auflösung liefert dasselbe Array', () => {
    expect(resolver.resolveAddressEntry('SERVERS')).toBe(resolver.resolveAddressEntry('SERVERS'));
  });
});

describe('interfaceMatches', () => {
  const resolver = createResolver(baseConfig());

  it('"any" matcht jedes Interface', () => {
    expect(resolver.interfaceMatches('any', 'port1')).toBe(true);
    expect(resolver.interfaceMatches('any', 'wan1')).toBe(true);
  });

  it('exakter Interface-Name', () => {
    expect(resolver.interfaceMatches('port1', 'port1')).toBe(true);
    expect(resolver.interfaceMatches('port1', 'port2')).toBe(false);
  });

  it('Zone matcht ihre Member-Interfaces (via Interface-ID)', () => {
    expect(resolver.interfaceMatches('inside', 'port1')).toBe(true);
    expect(resolver.interfaceMatches('inside', 'vlan20')).toBe(true);
    expect(resolver.interfaceMatches('inside', 'port2')).toBe(false);
    expect(resolver.interfaceMatches('inside', 'wan1')).toBe(false);
  });

  it('Zonen-Member dürfen lenient auch als Namen angegeben sein', () => {
    const lenient = createResolver(
      makeConfig({
        interfaces: [{ id: 'if-1', name: 'port1' }],
        zones: [{ id: 'z', name: 'lan-zone', members: ['port1'] }],
      }),
    );
    expect(lenient.interfaceMatches('lan-zone', 'port1')).toBe(true);
  });

  it('unbekannter Eintrag matcht nichts', () => {
    expect(resolver.interfaceMatches('port99', 'port1')).toBe(false);
  });
});

describe('addressObjectContainsIp', () => {
  it('subnet: Netz- und Broadcast-Adresse inklusive', () => {
    const net: AddressObject = { id: 'x', name: 'N', type: 'subnet', subnet: '10.0.1.0/24' };
    expect(addressObjectContainsIp(net, '10.0.1.0')).toBe(true);
    expect(addressObjectContainsIp(net, '10.0.1.255')).toBe(true);
    expect(addressObjectContainsIp(net, '10.0.2.1')).toBe(false);
  });

  it('range: inklusive Grenzen', () => {
    const range: AddressObject = {
      id: 'x',
      name: 'R',
      type: 'range',
      range: { from: '10.0.1.10', to: '10.0.1.19' },
    };
    expect(addressObjectContainsIp(range, '10.0.1.10')).toBe(true);
    expect(addressObjectContainsIp(range, '10.0.1.19')).toBe(true);
    expect(addressObjectContainsIp(range, '10.0.1.20')).toBe(false);
  });

  it('host: exakte Adresse', () => {
    const host: AddressObject = { id: 'x', name: 'H', type: 'host', host: '172.16.0.10' };
    expect(addressObjectContainsIp(host, '172.16.0.10')).toBe(true);
    expect(addressObjectContainsIp(host, '172.16.0.11')).toBe(false);
  });

  it('fehlendes Typ-Feld matcht nichts (kaputtes Objekt)', () => {
    expect(addressObjectContainsIp({ id: 'x', name: 'B', type: 'subnet' }, '10.0.0.1')).toBe(false);
    expect(addressObjectContainsIp({ id: 'x', name: 'B', type: 'range' }, '10.0.0.1')).toBe(false);
    expect(addressObjectContainsIp({ id: 'x', name: 'B', type: 'host' }, '10.0.0.1')).toBe(false);
  });
});

describe('serviceObjectMatches', () => {
  const https: ServiceObject = {
    id: 's',
    name: 'HTTPS',
    protocol: 'tcp',
    dstPorts: [{ from: 443, to: 443 }],
  };

  it('tcp: Protokoll UND Port müssen passen', () => {
    expect(serviceObjectMatches(https, { protocol: 'tcp', dstPort: 443 })).toBe(true);
    expect(serviceObjectMatches(https, { protocol: 'tcp', dstPort: 444 })).toBe(false);
    expect(serviceObjectMatches(https, { protocol: 'udp', dstPort: 443 })).toBe(false);
  });

  it('Portrange-Grenzen: from==to, Port 1, Port 65535', () => {
    const single: ServiceObject = {
      id: 's',
      name: 'S',
      protocol: 'tcp',
      dstPorts: [{ from: 3389, to: 3389 }],
    };
    expect(serviceObjectMatches(single, { protocol: 'tcp', dstPort: 3389 })).toBe(true);
    expect(serviceObjectMatches(single, { protocol: 'tcp', dstPort: 3388 })).toBe(false);
    expect(serviceObjectMatches(single, { protocol: 'tcp', dstPort: 3390 })).toBe(false);

    const edge: ServiceObject = {
      id: 's',
      name: 'E',
      protocol: 'tcp',
      dstPorts: [
        { from: 1, to: 1 },
        { from: 65535, to: 65535 },
      ],
    };
    expect(serviceObjectMatches(edge, { protocol: 'tcp', dstPort: 1 })).toBe(true);
    expect(serviceObjectMatches(edge, { protocol: 'tcp', dstPort: 65535 })).toBe(true);
    expect(serviceObjectMatches(edge, { protocol: 'tcp', dstPort: 2 })).toBe(false);
  });

  it('mehrere Ranges: ODER-Verknüpfung', () => {
    const multi: ServiceObject = {
      id: 's',
      name: 'M',
      protocol: 'udp',
      dstPorts: [
        { from: 53, to: 53 },
        { from: 5000, to: 5010 },
      ],
    };
    expect(serviceObjectMatches(multi, { protocol: 'udp', dstPort: 53 })).toBe(true);
    expect(serviceObjectMatches(multi, { protocol: 'udp', dstPort: 5005 })).toBe(true);
    expect(serviceObjectMatches(multi, { protocol: 'udp', dstPort: 100 })).toBe(false);
  });

  it('tcp/udp ohne dstPorts matcht jeden Port — auch fehlenden', () => {
    const anyPort: ServiceObject = { id: 's', name: 'A', protocol: 'tcp' };
    expect(serviceObjectMatches(anyPort, { protocol: 'tcp', dstPort: 12345 })).toBe(true);
    expect(serviceObjectMatches(anyPort, { protocol: 'tcp' })).toBe(true);
  });

  it('Paket ohne dstPort matcht keine konkrete Portrange', () => {
    expect(serviceObjectMatches(https, { protocol: 'tcp' })).toBe(false);
  });

  it('icmp: ohne Port; icmpType optional', () => {
    const ping: ServiceObject = { id: 's', name: 'PING', protocol: 'icmp', icmpType: 8 };
    const anyIcmp: ServiceObject = { id: 's', name: 'ICMP', protocol: 'icmp' };
    expect(serviceObjectMatches(ping, { protocol: 'icmp', icmpType: 8 })).toBe(true);
    expect(serviceObjectMatches(ping, { protocol: 'icmp', icmpType: 0 })).toBe(false);
    expect(serviceObjectMatches(anyIcmp, { protocol: 'icmp', icmpType: 3 })).toBe(true);
    expect(serviceObjectMatches(anyIcmp, { protocol: 'icmp' })).toBe(true);
    expect(serviceObjectMatches(ping, { protocol: 'tcp', dstPort: 8 })).toBe(false);
  });

  it('protocol "any" matcht alles', () => {
    const any: ServiceObject = { id: 's', name: 'ALL', protocol: 'any' };
    expect(serviceObjectMatches(any, { protocol: 'tcp', dstPort: 80 })).toBe(true);
    expect(serviceObjectMatches(any, { protocol: 'udp', dstPort: 53 })).toBe(true);
    expect(serviceObjectMatches(any, { protocol: 'icmp', icmpType: 8 })).toBe(true);
  });
});
