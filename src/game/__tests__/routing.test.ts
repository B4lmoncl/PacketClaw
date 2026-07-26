import { describe, expect, it } from 'vitest';
import { evaluate } from '../../engine';
import type { NetworkConfig, RouteEntry } from '../../engine';
import {
  failingRoutes,
  generateRoutingCase,
  lookupRoute,
  ROUTING_BUGS,
  type RoutingBug,
} from '../routing';

function caseFor(bug: RoutingBug) {
  for (let i = 0; i < 500; i++) {
    const c = generateRoutingCase(`seed-${bug}-${i}`);
    if (c.bug === bug) return c;
  }
  throw new Error(`kein Fall fuer ${bug} gefunden`);
}

const withRoutes = (net: NetworkConfig, routes: RouteEntry[]): NetworkConfig => ({
  ...net,
  routes,
});

/** Die korrekte Tabelle: DMZ ueber port2, sonst wie gehabt, kein Hijack. */
const FIXED: RouteEntry[] = [
  { dst: '10.0.1.0/24', iface: 'port1' },
  { dst: '10.0.20.0/24', iface: 'vlan20' },
  { dst: '172.16.0.0/24', iface: 'port2' },
  { dst: '0.0.0.0/0', iface: 'wan1' },
];

describe('Routing-Werkstatt', () => {
  it('jeder Fall startet kaputt', () => {
    for (const bug of ROUTING_BUGS) {
      const c = caseFor(bug);
      expect(failingRoutes(c.suite, c.network), `Bug ${bug}`).toBeGreaterThan(0);
    }
  });

  it('korrekte Routing-Tabelle loest jeden Fall — ohne das Regelwerk anzufassen', () => {
    for (const bug of ROUTING_BUGS) {
      const c = caseFor(bug);
      expect(failingRoutes(c.suite, withRoutes(c.network, FIXED)), `Bug ${bug}`).toBe(0);
    }
  });

  it('missing: die Default-Route fangt den Verkehr ab — es gibt KEIN no-route', () => {
    const c = caseFor('missing');
    expect(c.network.routes.some((r) => r.dst === '172.16.0.0/24')).toBe(false);
    const verdict = evaluate(c.probe, c.network);
    // 0.0.0.0/0 greift, also findet die Engine sehr wohl eine Route
    expect(verdict.trace.some((s) => s.kind === 'no-route')).toBe(false);
    const route = verdict.trace.find((s) => s.kind === 'route');
    expect(route?.kind === 'route' && route.route).toBe('0.0.0.0/0');
    expect(verdict.dstintf).toBe('wan1');
  });

  it('der gemeinste Fall: ACCEPT ueber das falsche Interface gilt als Fehler', () => {
    const c = caseFor('missing');
    const verdict = evaluate(c.probe, c.network);
    // Die Egress-Regel erlaubt HTTPS nach wan1 — die Firewall sagt also accept,
    // obwohl der Server nie erreicht wird. Genau das muss die Suite fangen.
    expect(verdict.action).toBe('accept');
    expect(failingRoutes(c.suite, c.network)).toBeGreaterThan(0);
  });

  it('wrong-iface: Route existiert, zeigt aber aufs falsche Interface', () => {
    const c = caseFor('wrong-iface');
    const dmz = c.network.routes.find((r) => r.dst === '172.16.0.0/24');
    expect(dmz).toBeDefined();
    expect(dmz?.iface).not.toBe('port2');
    const verdict = evaluate(c.probe, c.network);
    expect(verdict.dstintf).not.toBe('port2');
    expect(failingRoutes(c.suite, c.network)).toBeGreaterThan(0);
  });

  it('hijack: die spezifischere /25 gewinnt gegen die korrekte /24 (LPM)', () => {
    const c = caseFor('hijack');
    // Die richtige Route IST vorhanden — trotzdem geht der Verkehr falsch raus
    expect(c.network.routes.some((r) => r.dst === '172.16.0.0/24' && r.iface === 'port2')).toBe(
      true,
    );
    const verdict = evaluate(c.probe, c.network);
    expect(verdict.dstintf).not.toBe('port2');
    const route = verdict.trace.find((s) => s.kind === 'route');
    expect(route?.kind === 'route' && route.route).toBe('172.16.0.0/25');
    // Loeschen der Hijack-Route reicht als Fix
    const fixed = c.network.routes.filter((r) => r.dst !== '172.16.0.0/25');
    expect(failingRoutes(c.suite, withRoutes(c.network, fixed))).toBe(0);
  });

  it('Kontroll-Check beisst: alles nach port2 umbiegen bricht den Internet-Zugang', () => {
    const c = caseFor('missing');
    const lazy: RouteEntry[] = [
      { dst: '10.0.1.0/24', iface: 'port1' },
      { dst: '0.0.0.0/0', iface: 'port2' },
    ];
    expect(failingRoutes(c.suite, withRoutes(c.network, lazy))).toBeGreaterThan(0);
  });

  it('SSH in die DMZ bleibt auch nach dem Fix geblockt (Routing oeffnet nichts)', () => {
    const c = caseFor('wrong-iface');
    const fixedNet = withRoutes(c.network, FIXED);
    const ssh = evaluate(
      {
        srcintf: 'port1',
        srcIp: c.probe.srcIp,
        dstIp: '172.16.0.10',
        protocol: 'tcp',
        dstPort: 22,
      },
      fixedNet,
    );
    expect(ssh.action).toBe('deny');
    // Route ist da, dstintf stimmt — geblockt wird von der Policy-Ebene
    expect(ssh.dstintf).toBe('port2');
  });

  it('Route-Lookup zeigt die gewinnende Route und das Egress-Interface', () => {
    const c = caseFor('hijack');
    const hit = lookupRoute(c.network, '172.16.0.10');
    expect(hit.matched?.dst).toBe('172.16.0.0/25');
    expect(hit.dstintf).not.toBe('port2');

    const fixed = withRoutes(
      c.network,
      c.network.routes.filter((r) => r.dst !== '172.16.0.0/25'),
    );
    const after = lookupRoute(fixed, '172.16.0.10');
    expect(after.matched?.dst).toBe('172.16.0.0/24');
    expect(after.dstintf).toBe('port2');
  });

  it('Route-Lookup ohne passende Route liefert nichts', () => {
    const c = caseFor('missing');
    const net = withRoutes(c.network, [{ dst: '10.0.1.0/24', iface: 'port1' }]);
    expect(lookupRoute(net, '172.16.0.10')).toEqual({ matched: undefined, dstintf: undefined });
  });
});
