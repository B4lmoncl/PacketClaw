import { describe, expect, it } from 'vitest';
import type { NetworkConfig } from '../../engine';
import {
  FW_LAN_IP,
  FW_WAN_IP,
  generateMgmtCase,
  isLockedOut,
  MGMT_BUGS,
  MGMT_GATE,
  MGMT_NET,
  mgmtSolved,
  runMgmtSuite,
  setTrustedHosts,
  solve,
  toggleAllowaccess,
} from '../mgmt';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('Fallgenerierung', () => {
  it('ist deterministisch pro Seed', () => {
    const a = generateMgmtCase('same');
    const b = generateMgmtCase('same');
    expect(a.bug).toBe(b.bug);
    expect(JSON.stringify(a.network)).toBe(JSON.stringify(b.network));
  });

  it('erzeugt ueber mehrere Seeds alle Fallarten', () => {
    const bugs = new Set(SEEDS.map((s) => generateMgmtCase(s).bug));
    expect(bugs.size).toBeGreaterThan(1);
    for (const bug of bugs) expect(MGMT_BUGS).toContain(bug);
  });

  /**
   * Ohne Interface-IP gibt es kein Local-In — dann waere der ganze Modus
   * wirkungslos, und zwar unauffaellig.
   */
  it('die Firewall hat an port1 und wan1 eine IP', () => {
    for (const seed of SEEDS) {
      const { network } = generateMgmtCase(seed);
      expect(network.interfaces.find((i) => i.name === 'port1')?.ip).toBe(FW_LAN_IP);
      expect(network.interfaces.find((i) => i.name === 'wan1')?.ip).toBe(FW_WAN_IP);
    }
  });

  it('JEDER Fall startet ungeloest — sonst gaebe es nichts zu tun', () => {
    for (const seed of SEEDS) {
      const { network } = generateMgmtCase(seed);
      expect(mgmtSolved(runMgmtSuite(network)), seed).toBe(false);
    }
  });

  /**
   * DER wichtigste Test des Modus: jeder Fall MUSS mit den Reglern loesbar
   * sein, die der Spieler hat. Ein unloesbarer Fall ist schlimmer als kein
   * Fall — genau so ein Fehler ist bei der DNAT-Werkstatt passiert.
   */
  it('JEDER Fall ist mit den vorhandenen Reglern loesbar', () => {
    for (const seed of SEEDS) {
      const { network, bug } = generateMgmtCase(seed);
      const results = runMgmtSuite(solve(network));
      expect(mgmtSolved(results), `${seed} / ${bug}`).toBe(true);
      expect(isLockedOut(results)).toBe(false);
    }
  });
});

describe('Die Falle: zu viel zu und zu viel offen sind beide falsch', () => {
  it('alles zumachen sperrt aus und gilt NICHT als geloest', () => {
    const { network } = generateMgmtCase('lock');
    const closed = {
      ...network,
      interfaces: network.interfaces.map((i) => ({ ...i, allowaccess: [] })),
    };
    const results = runMgmtSuite(closed);
    expect(mgmtSolved(results)).toBe(false);
    expect(isLockedOut(results)).toBe(true);
  });

  it('alles aufmachen laesst das Internet rein und gilt NICHT als geloest', () => {
    const { network } = generateMgmtCase('open');
    let wide: NetworkConfig = {
      ...network,
      interfaces: network.interfaces.map((i) =>
        i.ip !== undefined ? { ...i, allowaccess: ['https' as const, 'ssh' as const] } : i,
      ),
    };
    wide = setTrustedHosts(wide, 'admin', []);
    const results = runMgmtSuite(wide);
    expect(mgmtSolved(results)).toBe(false);
    // ausgesperrt ist man dabei NICHT — nur unsicher
    expect(isLockedOut(results)).toBe(false);
    expect(results.filter((r) => !r.ok).every((r) => r.check.expect === 'deny')).toBe(true);
  });

  /**
   * Das Kernmissverstaendnis: allowaccess allein reicht nicht, trusthost
   * allein reicht auch nicht. Beide Tore muessen stimmen.
   */
  it('nur allowaccess oeffnen genuegt nicht, wenn trusthost falsch zeigt', () => {
    const { network } = generateMgmtCase('trust');
    const opened = {
      ...network,
      interfaces: network.interfaces.map((i) =>
        i.name === 'port1' ? { ...i, allowaccess: ['https' as const, 'ssh' as const] } : i,
      ),
      admins: [{ name: 'admin', trustedHosts: ['192.168.99.0/24'] }],
    };
    const results = runMgmtSuite(opened);
    expect(mgmtSolved(results)).toBe(false);
    expect(isLockedOut(results)).toBe(true);
    expect(results.find((r) => r.check.lockout && !r.ok)?.gate).toBe('trusthost');
  });

  it('nur trusthost richtig stellen genuegt nicht, wenn nichts offen ist', () => {
    const { network } = generateMgmtCase('closedcase');
    let fixed: NetworkConfig = {
      ...network,
      interfaces: network.interfaces.map((i) => ({ ...i, allowaccess: [] })),
    };
    fixed = setTrustedHosts(fixed, 'admin', [MGMT_NET]);
    const results = runMgmtSuite(fixed);
    expect(isLockedOut(results)).toBe(true);
    expect(results.find((r) => r.check.lockout && !r.ok)?.gate).toBe('allowaccess');
  });
});

describe('Die Regler', () => {
  it('toggleAllowaccess schaltet an und wieder aus', () => {
    const { network } = generateMgmtCase('toggle');
    const on = toggleAllowaccess(network, 'port1', 'https');
    const iface = (n: typeof network) => n.interfaces.find((i) => i.name === 'port1');
    const had = (iface(network)?.allowaccess ?? []).includes('https');
    expect((iface(on)?.allowaccess ?? []).includes('https')).toBe(!had);
    const off = toggleAllowaccess(on, 'port1', 'https');
    expect((iface(off)?.allowaccess ?? []).includes('https')).toBe(had);
  });

  it('toggleAllowaccess laesst andere Interfaces unberuehrt', () => {
    const { network } = generateMgmtCase('toggle2');
    const before = network.interfaces.find((i) => i.name === 'wan1')?.allowaccess;
    const after = toggleAllowaccess(network, 'port1', 'ssh').interfaces.find(
      (i) => i.name === 'wan1',
    )?.allowaccess;
    expect(after).toEqual(before);
  });

  it('setTrustedHosts ersetzt die Liste und trifft nur das genannte Konto', () => {
    const { network } = generateMgmtCase('hosts');
    const two = {
      ...network,
      admins: [...(network.admins ?? []), { name: 'noc', trustedHosts: [] }],
    };
    const patched = setTrustedHosts(two, 'admin', ['10.9.0.0/24']);
    expect(patched.admins?.find((a) => a.name === 'admin')?.trustedHosts).toEqual(['10.9.0.0/24']);
    expect(patched.admins?.find((a) => a.name === 'noc')?.trustedHosts).toEqual([]);
  });

  it('die Regler aendern das Netz nicht in place', () => {
    const { network } = generateMgmtCase('immut');
    const snapshot = JSON.stringify(network);
    toggleAllowaccess(network, 'port1', 'https');
    setTrustedHosts(network, 'admin', ['1.2.3.0/24']);
    expect(JSON.stringify(network)).toBe(snapshot);
  });
});

/**
 * Sucht einen Seed, der eine bestimmte Fallart zieht — und SCHEITERT, wenn es
 * keinen gibt. Ein stilles `return` haette die folgenden Zusicherungen
 * lautlos abgeschaltet, sobald sich die Ziehung aendert.
 */
function seedFor(bug: string): string {
  const seed = SEEDS.find((s) => generateMgmtCase(s).bug === bug);
  expect(seed, `kein Seed zieht ${bug} — die Zusicherungen darunter liefen leer`).toBeDefined();
  return seed as string;
}

describe('Zuordnung Fall → Tor', () => {
  it('jede Fallart nennt das Tor, an dem es haengt', () => {
    for (const bug of MGMT_BUGS) {
      expect(['allowaccess', 'local-in-policy', 'trusthost']).toContain(MGMT_GATE[bug]);
    }
  });

  it('der closed-Fall scheitert wirklich an allowaccess', () => {
    const { network } = generateMgmtCase(seedFor('closed'));
    const failing = runMgmtSuite(network).find((r) => !r.ok);
    expect(failing?.gate).toBe('allowaccess');
  });

  it('der wrong-trusthost-Fall scheitert wirklich an trusthost', () => {
    const { network } = generateMgmtCase(seedFor('wrong-trusthost'));
    const failing = runMgmtSuite(network).find((r) => !r.ok);
    expect(failing?.gate).toBe('trusthost');
  });

  it('der wide-open-Fall laesst zu viel rein, sperrt aber nicht aus', () => {
    const { network } = generateMgmtCase(seedFor('wide-open'));
    const results = runMgmtSuite(network);
    expect(isLockedOut(results)).toBe(false);
    expect(results.some((r) => !r.ok && r.check.expect === 'deny')).toBe(true);
  });
});
