/**
 * DNAT/VIP-Workshop „Publish a Server": den internen Webserver aus dem
 * Internet erreichbar machen — eine der häufigsten echten FortiGate-Aufgaben
 * (Port-Forwarding). Der Spieler legt eine Virtual IP an (extern → intern)
 * und eine Eingangs-Policy, die die VIP als ZIEL referenziert (nicht die
 * interne IP — das ist der Klassiker-Fehler).
 *
 * Verifikation über die Engine: ein Paket aus dem Internet auf die externe
 * IP:Port muss ACCEPT + DNAT auf die interne Server-IP ergeben; ein Paket auf
 * einen falschen Port muss geblockt bleiben.
 */
import { createRng, evaluate, makeConfig } from '../engine';
import type { NetworkConfig } from '../engine';

const INTERNET_SRC = '198.51.100.9';

export interface DnatChallenge {
  /** Startnetz: interner Server + Routen, ABER ohne VIP und ohne Eingangs-Policy */
  baseNetwork: NetworkConfig;
  /** öffentlicher Endpunkt, unter dem der Server erreichbar sein soll */
  extIp: string;
  extPort: number;
  /** interner Zielserver */
  server: { name: string; ip: string; port: number };
}

export function generateDnatChallenge(seed: string): DnatChallenge {
  const rng = createRng(`aethergate-dnat-${seed}`);
  const extIp = rng.pick(['203.0.113.10', '203.0.113.20', '198.51.100.80']);
  // Klassische VIP ohne Port-Translation: der Server wird 1:1 auf HTTPS/443
  // veroeffentlicht. Kernlektion ist, im Eingangs-Regelwerk die VIP als Ziel
  // zu referenzieren (nicht die interne IP) — nicht die Port-Forward-Feinheit.
  const extPort = 443;
  const server = { name: 'SRV_WEB01', ip: '172.16.0.10', port: 443 };

  const baseNetwork = makeConfig({
    interfaces: [
      { id: 'if-p1', name: 'port1' },
      { id: 'if-p2', name: 'port2' },
      { id: 'if-w1', name: 'wan1' },
    ],
    zones: [],
    addresses: [
      { id: 'SRV_WEB01', name: 'SRV_WEB01', type: 'host', host: '172.16.0.10' },
      { id: 'DMZ_NET', name: 'DMZ_NET', type: 'subnet', subnet: '172.16.0.0/24' },
      { id: 'LAN_NET', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
    ],
    services: [
      { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
      { id: 'SSH', name: 'SSH', protocol: 'tcp', dstPorts: [{ from: 22, to: 22 }] },
    ],
    routes: [
      { dst: '10.0.1.0/24', iface: 'port1' },
      { dst: '172.16.0.0/24', iface: 'port2' },
      { dst: '0.0.0.0/0', iface: 'wan1' },
    ],
    vips: [],
    policies: [],
  });

  return { baseNetwork, extIp, extPort, server };
}

/** Wie viele Prüfungen der aktuelle Aufbau NICHT erfüllt (0 = gelöst). */
export function verifyDnat(config: NetworkConfig, ch: DnatChallenge): number {
  let fails = 0;
  // 1) Von außen auf die externe IP:Port → muss durch UND auf den Server gemappt werden
  const hit = evaluate(
    { srcintf: 'wan1', srcIp: INTERNET_SRC, dstIp: ch.extIp, protocol: 'tcp', dstPort: ch.extPort },
    config,
  );
  if (!(hit.action === 'accept' && hit.dnat?.toIp === ch.server.ip)) fails++;
  // 2) Falscher Port (SSH) darf NICHT durch (kein zu weites Öffnen)
  const wrong = evaluate(
    { srcintf: 'wan1', srcIp: INTERNET_SRC, dstIp: ch.extIp, protocol: 'tcp', dstPort: 22 },
    config,
  );
  if (wrong.action !== 'deny') fails++;
  return fails;
}
