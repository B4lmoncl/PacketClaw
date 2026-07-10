/**
 * Gemeinsames Test-Netz: LAN (port1), Gäste-VLAN (vlan20), DMZ (port2), WAN (wan1).
 * Zone "inside" = port1 + vlan20. VIP_WEB: 203.0.113.10:443 → 172.16.0.10:8443.
 */
import { makeConfig } from '../config';
import type { NetworkConfig, Packet } from '../types';

export function baseConfig(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return makeConfig({
    interfaces: [
      { id: 'if-1', name: 'port1' },
      { id: 'if-2', name: 'port2' },
      { id: 'if-3', name: 'wan1' },
      { id: 'if-4', name: 'vlan20' },
    ],
    zones: [{ id: 'zn-1', name: 'inside', members: ['if-1', 'if-4'] }],
    addresses: [
      { id: 'a-1', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
      { id: 'a-2', name: 'GUEST_NET', type: 'subnet', subnet: '10.0.20.0/24' },
      { id: 'a-3', name: 'DMZ_NET', type: 'subnet', subnet: '172.16.0.0/24' },
      { id: 'a-4', name: 'SRV_WEB01', type: 'host', host: '172.16.0.10' },
      { id: 'a-5', name: 'SRV_DNS', type: 'host', host: '172.16.0.53' },
      {
        id: 'a-6',
        name: 'MGMT_RANGE',
        type: 'range',
        range: { from: '10.0.1.10', to: '10.0.1.19' },
      },
      { id: 'a-7', name: 'P2P_NET', type: 'subnet', subnet: '192.168.100.0/30' },
    ],
    addressGroups: [
      { id: 'g-1', name: 'SERVERS', members: ['SRV_WEB01', 'SRV_DNS'] },
      { id: 'g-2', name: 'INTERNAL', members: ['LAN_NET', 'GUEST_NET'] },
      // 3 Ebenen: ALL_PRIVATE → INTERNAL → LAN_NET
      { id: 'g-3', name: 'ALL_PRIVATE', members: ['INTERNAL', 'DMZ_NET'] },
    ],
    services: [
      { id: 's-1', name: 'HTTP', protocol: 'tcp', dstPorts: [{ from: 80, to: 80 }] },
      { id: 's-2', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
      { id: 's-3', name: 'DNS', protocol: 'udp', dstPorts: [{ from: 53, to: 53 }] },
      { id: 's-4', name: 'DNS_TCP', protocol: 'tcp', dstPorts: [{ from: 53, to: 53 }] },
      { id: 's-5', name: 'RDP', protocol: 'tcp', dstPorts: [{ from: 3389, to: 3389 }] },
      { id: 's-6', name: 'HIGH_PORTS', protocol: 'tcp', dstPorts: [{ from: 1024, to: 65535 }] },
      { id: 's-7', name: 'PING', protocol: 'icmp', icmpType: 8 },
      { id: 's-8', name: 'ICMP_ANY', protocol: 'icmp' },
      { id: 's-9', name: 'ANY_SVC', protocol: 'any' },
      { id: 's-10', name: 'TCP_FULL', protocol: 'tcp', dstPorts: [{ from: 0, to: 65535 }] },
      { id: 's-11', name: 'UDP_FULL', protocol: 'udp', dstPorts: [{ from: 0, to: 65535 }] },
    ],
    serviceGroups: [
      { id: 'sg-1', name: 'WEB', members: ['HTTP', 'HTTPS'] },
      { id: 'sg-2', name: 'DNS_ALL', members: ['DNS', 'DNS_TCP'] },
      // 3 Ebenen: OFFICE → STANDARD → WEB → HTTP
      { id: 'sg-3', name: 'STANDARD', members: ['WEB', 'DNS_ALL'] },
      { id: 'sg-4', name: 'OFFICE', members: ['STANDARD', 'RDP'] },
    ],
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
    routes: [
      { dst: '10.0.1.0/24', iface: 'port1' },
      { dst: '10.0.20.0/24', iface: 'vlan20' },
      { dst: '172.16.0.0/24', iface: 'port2' },
      { dst: '0.0.0.0/0', iface: 'wan1' },
    ],
    ...overrides,
  });
}

/** Standard-Testpaket: LAN-Client → Internet, HTTPS */
export function lanToWanHttps(overrides: Partial<Packet> = {}): Packet {
  return {
    srcintf: 'port1',
    srcIp: '10.0.1.5',
    dstIp: '198.51.100.20',
    protocol: 'tcp',
    dstPort: 443,
    ...overrides,
  };
}
