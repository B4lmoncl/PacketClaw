/**
 * Change Request (Policy Design): der Spieler baut ein KOMPLETTES Regelwerk
 * von null, nach schriftlichen Vorgaben — die häufigste echte Firewall-Arbeit.
 *
 * Aufbau: es gibt einen festen Katalog von „Capabilities" (Verkehrsbeziehungen,
 * die im Netz technisch möglich wären). Ein Auftrag fordert einige davon
 * ausdrücklich AN; alles, was nicht gefordert ist, muss geschlossen bleiben und
 * wird als Guard geprüft. Damit ist Least Privilege kein versteckter Fallstrick,
 * sondern ergibt sich aus dem im Ticket genannten Grundsatz („was nicht
 * gefordert ist, bleibt zu") — also genau Default-Deny.
 *
 * Bewertung deckt drei Ebenen ab, wie ein echtes Review:
 *   1. Erfüllt das Regelwerk die Anforderungen? (Sonden je Anforderung)
 *   2. Öffnet es NICHT mehr als gefordert? (Guards)
 *   3. Ist es saubere Handwerksarbeit? (keine unnötig breiten, keine toten Regeln)
 *
 * Deterministisch pro Seed (mulberry32, kein Math.random).
 */
import {
  createRng,
  evaluate,
  findOverbroadPolicies,
  findShadowedPolicies,
  makeConfig,
} from '../engine';
import type { NetworkConfig, Packet } from '../engine';
import {
  ADDRESS_GROUPS,
  ADDRESSES,
  INTERFACES,
  ROUTES,
  SERVICE_GROUPS,
  SERVICES,
  ZONES,
} from './daily';

/** Eine technisch mögliche Verkehrsbeziehung im Übungsnetz. */
export interface Capability {
  id: string;
  /** Sonde, mit der die Beziehung geprüft wird */
  probe: Packet;
  /** Egress ins Internet ⇒ die Regel braucht SNAT, sonst kommt nichts zurück */
  needsNat: boolean;
}

/**
 * Katalog. Die Sonden-IPs liegen absichtlich in den Adressobjekten der
 * gemeinsamen Bibliothek (LAN_NET, GUEST_NET, SRV_WEB01, ADMIN_PC …), damit
 * der Spieler mit Objekten statt mit rohen IPs arbeiten kann.
 */
export const CAPABILITIES: Capability[] = [
  {
    id: 'lanWeb',
    probe: {
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 443,
    },
    needsNat: true,
  },
  {
    id: 'lanDns',
    probe: { srcintf: 'port1', srcIp: '10.0.1.5', dstIp: '9.9.9.9', protocol: 'udp', dstPort: 53 },
    needsNat: true,
  },
  {
    id: 'lanDmzHttps',
    probe: {
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '172.16.0.10',
      protocol: 'tcp',
      dstPort: 443,
    },
    needsNat: false,
  },
  {
    id: 'guestWeb',
    probe: {
      srcintf: 'vlan20',
      srcIp: '10.0.20.7',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 443,
    },
    needsNat: true,
  },
  {
    id: 'adminDmzSsh',
    probe: {
      srcintf: 'port1',
      srcIp: '10.0.1.10',
      dstIp: '172.16.0.10',
      protocol: 'tcp',
      dstPort: 22,
    },
    needsNat: false,
  },
  {
    id: 'lanDmzPing',
    probe: {
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '172.16.0.10',
      protocol: 'icmp',
      icmpType: 8,
    },
    needsNat: false,
  },
  {
    id: 'lanRdpOut',
    probe: {
      srcintf: 'port1',
      srcIp: '10.0.1.5',
      dstIp: '203.0.113.50',
      protocol: 'tcp',
      dstPort: 3389,
    },
    needsNat: true,
  },
];

/**
 * Wird NIE angefordert und ist immer eine ausdrückliche Anforderung mit
 * kind='deny': Gast-Netz darf das interne LAN nicht erreichen (Segmentierung).
 */
export const SEGMENTATION: Capability = {
  id: 'guestToLan',
  probe: {
    srcintf: 'vlan20',
    srcIp: '10.0.20.7',
    dstIp: '10.0.1.5',
    protocol: 'tcp',
    dstPort: 3389,
  },
  needsNat: false,
};

export interface Requirement {
  /** Ticket-Nummer zur Anzeige: R1, R2 … */
  label: string;
  capabilityId: string;
  kind: 'allow' | 'deny';
  /** i18n-Schlüssel des Anforderungstexts */
  textKey: string;
  needsNat: boolean;
  probe: Packet;
}

export interface DesignSpec {
  /** Netz mit Objekten und Routen, aber OHNE Policies */
  baseNetwork: NetworkConfig;
  requirements: Requirement[];
  /** nicht geforderte Beziehungen — müssen zu bleiben (Least Privilege) */
  guards: Capability[];
  /** i18n-Schlüssel der Auftraggeber-Anmerkung (Flavour) */
  noteKey: string;
}

const NOTE_KEYS = ['design.note.a', 'design.note.b', 'design.note.c'] as const;

export function generateDesignSpec(seed: string): DesignSpec {
  const rng = createRng(`aethergate-design-${seed}`);

  // 3 geforderte Capabilities ziehen (ohne Wiederholung), Rest wird Guard.
  const pool = [...CAPABILITIES];
  const chosen: Capability[] = [];
  const wanted = 3;
  while (chosen.length < wanted && pool.length > 0) {
    const index = Math.floor(rng.next() * pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked) chosen.push(picked);
  }
  // Stabile Anzeige-Reihenfolge nach Katalog, nicht nach Ziehungsreihenfolge
  chosen.sort(
    (a, b) =>
      CAPABILITIES.findIndex((c) => c.id === a.id) - CAPABILITIES.findIndex((c) => c.id === b.id),
  );

  const requirements: Requirement[] = chosen.map((cap, i) => ({
    label: `R${i + 1}`,
    capabilityId: cap.id,
    kind: 'allow',
    textKey: `design.req.${cap.id}`,
    needsNat: cap.needsNat,
    probe: cap.probe,
  }));
  // Segmentierung ist immer die letzte, ausdrücklich formulierte Anforderung
  requirements.push({
    label: `R${requirements.length + 1}`,
    capabilityId: SEGMENTATION.id,
    kind: 'deny',
    textKey: `design.req.${SEGMENTATION.id}`,
    needsNat: false,
    probe: SEGMENTATION.probe,
  });

  const baseNetwork = makeConfig({
    interfaces: INTERFACES,
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes: ROUTES,
    policies: [],
  });

  return {
    baseNetwork,
    requirements,
    guards: pool, // alles, was nicht gezogen wurde
    noteKey: rng.pick([...NOTE_KEYS]),
  };
}

export interface RequirementResult {
  label: string;
  capabilityId: string;
  ok: boolean;
  /** true, wenn der Verkehr durchkommt, aber das geforderte SNAT fehlt */
  natMissing: boolean;
}

export interface DesignReview {
  perRequirement: RequirementResult[];
  /** nicht geforderte Beziehungen, die durchkommen (zu weit geöffnet) */
  breaches: string[];
  /** Regeln mit all/ALL/any, die enger gefasst werden könnten */
  overbroad: number;
  /** Regeln, die nie greifen (von weiter oben verschattet) */
  shadowed: number;
  /** alle Anforderungen erfüllt UND kein Guard gebrochen */
  passed: boolean;
  /** saubere Handwerksarbeit: nichts zu breit, nichts totes */
  clean: boolean;
}

/** Prüft ein Regelwerk gegen den Auftrag — wie ein Change-Review. */
export function reviewDesign(config: NetworkConfig, spec: DesignSpec): DesignReview {
  const perRequirement: RequirementResult[] = spec.requirements.map((req) => {
    const verdict = evaluate(req.probe, config);
    if (req.kind === 'deny') {
      return {
        label: req.label,
        capabilityId: req.capabilityId,
        ok: verdict.action === 'deny',
        natMissing: false,
      };
    }
    const accepted = verdict.action === 'accept';
    const natMissing = accepted && req.needsNat && !verdict.natApplied;
    return {
      label: req.label,
      capabilityId: req.capabilityId,
      ok: accepted && !natMissing,
      natMissing,
    };
  });

  const breaches = spec.guards
    .filter((cap) => evaluate(cap.probe, config).action === 'accept')
    .map((cap) => cap.id);

  // Die Suite für die Handwerks-Analysen: geforderte Ausgänge als Erwartung.
  const suite = [
    ...spec.requirements.map((req) => ({
      packet: req.probe,
      expect: req.kind === 'allow' ? ('accept' as const) : ('deny' as const),
    })),
    ...spec.guards.map((cap) => ({ packet: cap.probe, expect: 'deny' as const })),
  ];
  const overbroad = findOverbroadPolicies(config, suite).length;
  const shadowed = findShadowedPolicies(config).length;

  const passed = perRequirement.every((r) => r.ok) && breaches.length === 0;
  return {
    perRequirement,
    breaches,
    overbroad,
    shadowed,
    passed,
    clean: overbroad === 0 && shadowed === 0,
  };
}
