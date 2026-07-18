/**
 * Config Doctor (Casual): ein Regelwerk mit GENAU EINEM realistischen Fehler
 * plus Symptom-Ticket. Der Spieler diagnostiziert (Policy Lookup, Debug-Flow,
 * CLI) und fixt in der Werkbank; eine Test-Suite prüft, ob der gewünschte
 * Verkehr jetzt durchkommt — ohne dass zu viel geöffnet wurde.
 *
 * Fehlertypen sind die häufigsten Praxis-Patzer: vergessenes SNAT auf einer
 * Egress-Regel, versehentlich deaktivierte Regel, und eine breite Deny-Regel,
 * die die Erlauben-Regel verschattet (First-Match/Reihenfolge).
 *
 * Deterministisch pro Seed (mulberry32). Es gibt bewusst mehrere gültige
 * Lösungen (z. B. Regel verschieben ODER die störende löschen) — bewertet
 * wird, dass die Suite grün wird, mit möglichst wenig Eingriffen.
 */
import { createRng, makeConfig, makePolicy, matchesExpectation } from '../engine';
import type { NetworkConfig, TestPacket } from '../engine';
import {
  ADDRESS_GROUPS,
  ADDRESSES,
  INTERFACES,
  ROUTES,
  SERVICE_GROUPS,
  SERVICES,
  ZONES,
} from './daily';

export type DoctorBug =
  'nat-missing' | 'disabled' | 'order' | 'wrong-service' | 'wrong-srcaddr' | 'wrong-dstintf';
export const DOCTOR_BUGS: DoctorBug[] = [
  'nat-missing',
  'disabled',
  'order',
  'wrong-service',
  'wrong-srcaddr',
  'wrong-dstintf',
];

/** Welches Konzept der Fall trainiert (für Debrief/Anzeige). */
export const BUG_CONCEPT: Record<DoctorBug, string> = {
  'nat-missing': 'snat',
  disabled: 'status',
  order: 'firstMatch',
  'wrong-service': 'service',
  'wrong-srcaddr': 'address',
  'wrong-dstintf': 'interface',
};

export interface DoctorCase {
  /** Das kaputte Netz, das der Spieler repariert */
  network: NetworkConfig;
  bug: DoctorBug;
  /** i18n-Schlüssel des Symptom-Tickets */
  symptomKey: string;
  /** Erwartete Ausgänge, die der Fix erfüllen muss */
  suite: TestPacket[];
}

export function generateDoctorCase(seed: string): DoctorCase {
  const rng = createRng(`aethergate-doctor-${seed}`);
  const bug = rng.pick(DOCTOR_BUGS);
  const srcIp = rng.pick(['10.0.1.5', '10.0.1.10', '10.0.1.200']);
  const dstIp = rng.pick(['203.0.113.50', '9.9.9.9', '198.51.100.20']);
  const port = rng.next() < 0.5 ? 443 : 80;

  // Gesunde Egress-Regel: LAN darf Web ins Internet (mit SNAT)
  const allow = makePolicy({
    id: 2,
    name: 'lan-web-out',
    srcintf: ['port1'],
    dstintf: ['wan1'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['all'],
    service: ['WEB'],
    action: 'accept',
    nat: true,
  });
  const denyRest = makePolicy({ id: 9, name: 'deny-all', action: 'deny' });

  let policies = [allow, denyRest];
  if (bug === 'nat-missing') {
    // SNAT vergessen → Rueckweg scheitert
    policies = [{ ...allow, nat: false }, denyRest];
  } else if (bug === 'disabled') {
    // Regel versehentlich deaktiviert
    policies = [{ ...allow, enabled: false }, denyRest];
  } else if (bug === 'wrong-service') {
    // falscher Dienst erlaubt (SSH/DNS statt Web) → Web faellt durch
    policies = [{ ...allow, service: [rng.pick(['SSH', 'DNS'])] }, denyRest];
  } else if (bug === 'wrong-srcaddr') {
    // Quelle deckt das LAN nicht ab → Pakete matchen nie
    policies = [{ ...allow, srcaddr: [rng.pick(['DMZ_NET', 'GUEST_NET'])] }, denyRest];
  } else if (bug === 'wrong-dstintf') {
    // Ziel-Interface passt nicht zur Route ins Internet
    policies = [{ ...allow, dstintf: [rng.pick(['port2', 'vlan20'])] }, denyRest];
  } else {
    // order: breite Deny ganz oben verschattet die Erlauben-Regel
    const broadDeny = makePolicy({
      id: 1,
      name: 'block-outbound',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['all'],
      dstaddr: ['all'],
      service: ['ALL'],
      action: 'deny',
    });
    policies = [broadDeny, allow, denyRest];
  }

  const network = makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes: ROUTES,
    policies,
  });

  // Ziel: Web muss raus (accept + SNAT); RDP muss weiter geblockt bleiben
  // (verhindert die faule „einfach alles erlauben"-Lösung).
  const suite: TestPacket[] = [
    {
      packet: { srcintf: 'port1', srcIp, dstIp, protocol: 'tcp', dstPort: port },
      expect: 'accept',
      expectNat: true,
    },
    {
      packet: { srcintf: 'port1', srcIp, dstIp, protocol: 'tcp', dstPort: 3389 },
      expect: 'deny',
    },
  ];

  return { network, bug, symptomKey: `doctor.symptom.${bug}`, suite };
}

/** Wie viele Suite-Prüfungen das aktuelle Regelwerk noch NICHT erfüllt. */
export function failingChecks(suite: TestPacket[], config: NetworkConfig): number {
  return suite.filter((tp) => !matchesExpectation(tp, config)).length;
}
