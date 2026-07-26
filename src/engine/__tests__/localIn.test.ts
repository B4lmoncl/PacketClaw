import { describe, expect, it } from 'vitest';
import { makeConfig, makePolicy } from '../config';
import { evaluate } from '../evaluate';
import {
  evaluateLocalIn,
  isAdminService,
  isLocalInTraffic,
  localInInterface,
  localServiceOf,
  trustedHostAllows,
} from '../localIn';
import type { LocalInPolicy, NetworkConfig, Packet } from '../types';

const FW_LAN = '10.0.1.1';
const FW_WAN = '203.0.113.2';

function net(over: Partial<NetworkConfig> = {}): NetworkConfig {
  return makeConfig({
    interfaces: [
      { id: 'p1', name: 'port1', ip: FW_LAN, allowaccess: ['https', 'ssh', 'ping'] },
      { id: 'w1', name: 'wan1', ip: FW_WAN, allowaccess: [] },
      { id: 'p2', name: 'port2' }, // ohne IP: hier gibt es kein Local-In
    ],
    addresses: [
      { id: 'MGMT', name: 'MGMT_NET', type: 'subnet', subnet: '10.0.1.0/28' },
      { id: 'LAN', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
    ],
    services: [
      { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
      { id: 'SSH', name: 'SSH', protocol: 'tcp', dstPorts: [{ from: 22, to: 22 }] },
    ],
    routes: [{ dst: '0.0.0.0/0', iface: 'wan1' }],
    ...over,
  });
}

const toFw = (over: Partial<Packet> = {}): Packet => ({
  srcintf: 'port1',
  srcIp: '10.0.1.5',
  dstIp: FW_LAN,
  protocol: 'tcp',
  dstPort: 443,
  ...over,
});

const lip = (over: Partial<LocalInPolicy> = {}): LocalInPolicy => ({
  id: 1,
  name: 'rule',
  enabled: true,
  intf: 'any',
  srcaddr: ['all'],
  dstaddr: ['all'],
  service: ['ALL'],
  action: 'accept',
  schedule: 'always',
  ...over,
});

describe('Erkennung: geht das Paket AN die Firewall oder durch sie hindurch?', () => {
  it('Interface-IP ⇒ Local-In, alles andere ⇒ Forward', () => {
    const config = net();
    expect(isLocalInTraffic(toFw(), config)).toBe(true);
    expect(isLocalInTraffic(toFw({ dstIp: FW_WAN }), config)).toBe(true);
    // ein Host IM Netz der Firewall ist nicht die Firewall
    expect(isLocalInTraffic(toFw({ dstIp: '10.0.1.50' }), config)).toBe(false);
  });

  it('ein Interface ohne IP erzeugt kein Local-In', () => {
    const config = net({
      interfaces: [{ id: 'p2', name: 'port2' }],
      routes: [{ dst: '0.0.0.0/0', iface: 'port2' }],
    });
    expect(isLocalInTraffic(toFw(), config)).toBe(false);
    expect(localInInterface(toFw(), config.interfaces)).toBeUndefined();
  });

  it('findet das richtige Interface, wenn mehrere IPs haben', () => {
    expect(localInInterface(toFw(), net().interfaces)?.name).toBe('port1');
    expect(localInInterface(toFw({ dstIp: FW_WAN }), net().interfaces)?.name).toBe('wan1');
  });
});

describe('Dienst-Erkennung', () => {
  it('bildet Protokoll und Port auf den Management-Dienst ab', () => {
    expect(localServiceOf(toFw({ dstPort: 443 }))).toBe('https');
    expect(localServiceOf(toFw({ dstPort: 22 }))).toBe('ssh');
    expect(localServiceOf(toFw({ dstPort: 80 }))).toBe('http');
    expect(localServiceOf(toFw({ dstPort: 161 }))).toBe('snmp');
    expect(localServiceOf(toFw({ protocol: 'icmp', dstPort: undefined }))).toBe('ping');
  });

  it('unbekannte Ziele sind kein Management-Dienst', () => {
    expect(localServiceOf(toFw({ dstPort: 8080 }))).toBeNull();
    expect(localServiceOf(toFw({ protocol: 'udp', dstPort: 443 }))).toBeNull();
  });

  it('nur Dienste mit Admin-Login kennen trusthost', () => {
    expect(isAdminService('https')).toBe(true);
    expect(isAdminService('ssh')).toBe(true);
    expect(isAdminService('http')).toBe(true);
    expect(isAdminService('ping')).toBe(false);
    expect(isAdminService('snmp')).toBe(false);
  });
});

describe('Tor 1: allowaccess', () => {
  it('offener Dienst kommt durch', () => {
    const v = evaluateLocalIn(toFw(), net());
    expect(v).toMatchObject({ action: 'accept', iface: 'port1', service: 'https', gate: 'open' });
  });

  /**
   * DER haeufigste Grund fuer „ich komme nicht auf die GUI": am Interface ist
   * der Dienst gar nicht offen. Das steht in KEINER Policy-Tabelle.
   */
  it('nicht offener Dienst wird verworfen — auch ohne jede Local-In-Regel', () => {
    const v = evaluateLocalIn(toFw({ dstIp: FW_WAN, srcintf: 'wan1' }), net());
    expect(v).toMatchObject({ action: 'deny', gate: 'allowaccess', service: 'https' });
    expect(v.trace.some((s) => s.kind === 'allowaccess-denied')).toBe(true);
  });

  it('Dienst, den allowaccess nicht kennt, wird verworfen', () => {
    const v = evaluateLocalIn(toFw({ dstPort: 8080 }), net());
    expect(v).toMatchObject({ action: 'deny', gate: 'allowaccess', service: null });
  });

  it('fehlendes allowaccess ist wie leeres — nichts offen', () => {
    const config = net({ interfaces: [{ id: 'p1', name: 'port1', ip: FW_LAN }] });
    expect(evaluateLocalIn(toFw(), config).gate).toBe('allowaccess');
  });

  it('ping ist ein eigener Dienst und unabhaengig von https', () => {
    const icmp = toFw({ protocol: 'icmp', dstPort: undefined });
    expect(evaluateLocalIn(icmp, net()).action).toBe('accept');
    const noPing = net({
      interfaces: [{ id: 'p1', name: 'port1', ip: FW_LAN, allowaccess: ['https'] }],
    });
    expect(evaluateLocalIn(icmp, noPing)).toMatchObject({ action: 'deny', gate: 'allowaccess' });
  });
});

describe('Tor 2: Local-In-Policies', () => {
  /**
   * DIE ASYMMETRIE. Die Forward-Tabelle endet mit Implicit Deny, Local-In endet
   * mit implizitem ACCEPT. Wer das verwechselt, sucht den Fehler falsch.
   */
  it('keine Regel getroffen ⇒ ERLAUBT (kein Implicit Deny)', () => {
    const v = evaluateLocalIn(toFw(), net({ localInPolicies: [] }));
    expect(v.action).toBe('accept');
    expect(v.trace.some((s) => s.kind === 'local-in-implicit-accept')).toBe(true);
    expect(v.trace.some((s) => s.kind === 'implicit-deny')).toBe(false);
  });

  it('eine Regel, die nicht passt, sperrt nichts', () => {
    const config = net({
      localInPolicies: [lip({ id: 1, action: 'deny', srcaddr: ['MGMT_NET'], intf: 'wan1' })],
    });
    const v = evaluateLocalIn(toFw(), config);
    expect(v.action).toBe('accept');
    expect(v.trace.some((s) => s.kind === 'local-in-no-match' && s.failedField === 'srcintf')).toBe(
      true,
    );
  });

  it('First Match gilt auch hier: die erste passende Regel entscheidet', () => {
    const config = net({
      localInPolicies: [
        lip({ id: 1, action: 'accept', srcaddr: ['MGMT_NET'] }),
        lip({ id: 2, action: 'deny' }),
      ],
    });
    // 10.0.1.5 liegt in MGMT_NET (/28) ⇒ Regel 1 gewinnt
    expect(evaluateLocalIn(toFw(), config)).toMatchObject({ action: 'accept', matchedPolicyId: 1 });
    // 10.0.1.50 liegt nicht in /28 ⇒ Regel 2 greift
    expect(evaluateLocalIn(toFw({ srcIp: '10.0.1.50' }), config)).toMatchObject({
      action: 'deny',
      gate: 'local-in-policy',
      matchedPolicyId: 2,
    });
  });

  it('deaktivierte Regeln werden uebersprungen', () => {
    const config = net({ localInPolicies: [lip({ id: 1, action: 'deny', enabled: false })] });
    const v = evaluateLocalIn(toFw(), config);
    expect(v.action).toBe('accept');
    expect(v.trace.some((s) => s.kind === 'policy-skipped')).toBe(true);
  });

  it('jedes Feld kann scheitern und wird als solches gemeldet', () => {
    const cases: Array<[Partial<LocalInPolicy>, string]> = [
      [{ intf: 'wan1' }, 'srcintf'],
      [{ srcaddr: ['MGMT_NET'] }, 'srcaddr'],
      [{ dstaddr: ['MGMT_NET'] }, 'dstaddr'],
      [{ service: ['SSH'] }, 'service'],
      [{ schedule: 'work-hours' }, 'schedule'],
    ];
    for (const [patch, field] of cases) {
      const config = net({ localInPolicies: [lip({ ...patch, action: 'deny' })] });
      // Quelle ausserhalb MGMT_NET und Ziel FW_LAN (nicht in MGMT_NET /28? doch —
      // deshalb prueft der dstaddr-Fall gegen eine Adresse, die FW_LAN nicht enthaelt)
      const packet = toFw({
        srcIp: field === 'srcaddr' ? '10.0.1.50' : '10.0.1.5',
        // Sonntag 03:00 — ausserhalb work-hours
        timestamp: field === 'schedule' ? '2026-07-26T03:00:00Z' : undefined,
      });
      const v = evaluateLocalIn(packet, config);
      const failed = v.trace.find((s) => s.kind === 'local-in-no-match');
      if (field === 'dstaddr') {
        // FW_LAN 10.0.1.1 LIEGT in MGMT_NET/28 — dieser Fall braucht ein Objekt,
        // das die Interface-IP nicht enthaelt
        const other = net({
          addresses: [{ id: 'X', name: 'OTHER', type: 'host', host: '10.0.9.9' }],
          localInPolicies: [lip({ dstaddr: ['OTHER'], action: 'deny' })],
        });
        const v2 = evaluateLocalIn(toFw(), other);
        const f2 = v2.trace.find((s) => s.kind === 'local-in-no-match');
        expect(f2 && 'failedField' in f2 ? f2.failedField : null).toBe('dstaddr');
        continue;
      }
      expect(failed && 'failedField' in failed ? failed.failedField : null, field).toBe(field);
    }
  });
});

describe('Tor 3: trusthost', () => {
  it('leeres trusthost heisst von ueberall — Auslieferungszustand', () => {
    expect(trustedHostAllows({ name: 'admin', trustedHosts: [] }, '198.51.100.7')).toBe(true);
  });

  it('gesetztes trusthost laesst nur passende Quellen zu', () => {
    const admin = { name: 'admin', trustedHosts: ['10.0.1.0/28'] };
    expect(trustedHostAllows(admin, '10.0.1.5')).toBe(true);
    expect(trustedHostAllows(admin, '10.0.1.50')).toBe(false);
  });

  /**
   * Das ist der Aussperr-Klassiker: allowaccess offen, keine Local-In-Regel im
   * Weg — und trotzdem kein Login, weil trusthost auf ein anderes Netz zeigt.
   */
  it('trusthost sperrt aus, obwohl Dienst offen und keine Regel im Weg ist', () => {
    const config = net({ admins: [{ name: 'admin', trustedHosts: ['192.168.99.0/24'] }] });
    const v = evaluateLocalIn(toFw(), config);
    expect(v).toMatchObject({ action: 'deny', gate: 'trusthost' });
    expect(v.trace.some((s) => s.kind === 'trusthost-denied')).toBe(true);
  });

  it('ein passendes Konto genuegt', () => {
    const config = net({
      admins: [
        { name: 'admin', trustedHosts: ['192.168.99.0/24'] },
        { name: 'noc', trustedHosts: ['10.0.1.0/24'] },
      ],
    });
    expect(evaluateLocalIn(toFw(), config)).toMatchObject({ action: 'accept', admin: 'noc' });
  });

  it('ping kennt kein trusthost — es gibt kein Login', () => {
    const config = net({ admins: [{ name: 'admin', trustedHosts: ['192.168.99.0/24'] }] });
    const icmp = toFw({ protocol: 'icmp', dstPort: undefined });
    expect(evaluateLocalIn(icmp, config).action).toBe('accept');
  });

  it('trusthost gilt auch nach einer erlaubenden Local-In-Regel', () => {
    const config = net({
      localInPolicies: [lip({ id: 7, action: 'accept' })],
      admins: [{ name: 'admin', trustedHosts: ['192.168.99.0/24'] }],
    });
    expect(evaluateLocalIn(toFw(), config)).toMatchObject({
      action: 'deny',
      gate: 'trusthost',
      matchedPolicyId: 7,
    });
  });

  it('ohne Admin-Konten spielt trusthost keine Rolle', () => {
    expect(evaluateLocalIn(toFw(), net()).action).toBe('accept');
  });
});

describe('Abgrenzung zum Forward-Pfad', () => {
  it('evaluate() leitet Local-In-Traffic an den Local-In-Pfad', () => {
    const v = evaluate(toFw(), net());
    expect(v.action).toBe('accept');
    expect(v.trace.some((s) => s.kind === 'local-in')).toBe(true);
    // kein Routing, kein dstintf — das ist der Kern der Unterscheidung
    expect(v.dstintf).toBe('');
    expect(v.trace.some((s) => s.kind === 'route')).toBe(false);
  });

  it('Forward-Traffic bleibt unberuehrt, auch wenn Interfaces IPs haben', () => {
    const config = net({
      policies: [
        makePolicy({
          id: 1,
          srcintf: ['port1'],
          dstintf: ['wan1'],
          srcaddr: ['LAN_NET'],
          dstaddr: ['all'],
          service: ['HTTPS'],
          action: 'accept',
          nat: true,
        }),
      ],
    });
    const v = evaluate(toFw({ dstIp: '198.51.100.10' }), config);
    expect(v).toMatchObject({ action: 'accept', matchedPolicyId: 1, dstintf: 'wan1' });
    expect(v.trace.some((s) => s.kind === 'local-in')).toBe(false);
  });

  it('die Forward-Policy-Tabelle entscheidet Local-In NICHT', () => {
    // Eine erlaubende Forward-Regel aendert nichts daran, dass allowaccess zu ist
    const config = net({
      policies: [makePolicy({ id: 1, action: 'accept' })],
    });
    const v = evaluate(toFw({ dstIp: FW_WAN, srcintf: 'wan1' }), config);
    expect(v.action).toBe('deny');
    expect(v.matchedPolicyId).toBe(0);
  });

  it('evaluateLocalIn auf Forward-Traffic meldet not-local statt zu raten', () => {
    const v = evaluateLocalIn(toFw({ dstIp: '198.51.100.10' }), net());
    expect(v).toMatchObject({ action: 'deny', gate: 'not-local', iface: '', service: null });
  });
});
