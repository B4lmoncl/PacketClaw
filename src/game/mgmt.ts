/**
 * Management-Zugriff: „mach die GUI fürs Büro auf — ohne dich auszusperren."
 *
 * DER DIDAKTISCHE KERN. Dieser Modus benutzt bewusst NICHT die
 * Policy-Tabelle. Wer hier den Reflex „ich schreibe eine Regel" bringt, kommt
 * nicht weiter: Verkehr an die Firewall selbst wird von drei völlig anderen
 * Stellschrauben entschieden (siehe engine/localIn.ts). Zwei davon stehen in
 * keiner Policy-Tabelle, und genau daran scheitern echte Admins.
 *
 * WARUM DAS EIN EIGENER MODUS IST UND KEIN LEVEL. Der Fehler ist hier nicht
 * „falsch geraten", sondern „an der falschen Stelle gesucht". Das lernt man nur
 * durch Anfassen: drei Regler, ein Ziel, und ein Prüflauf, der auch das
 * ungewollte Ergebnis findet.
 *
 * DIE FALLE, die jeder Fall stellt: es reicht nicht, das Büro reinzulassen.
 * Die Prüfung verlangt AUCH, dass das Internet draußen bleibt UND dass man sich
 * nicht selbst aussperrt. Eine Lösung, die alles zumacht, ist genauso falsch
 * wie eine, die alles aufmacht — nur teurer, weil man dann vor Ort fahren muss.
 *
 * Deterministisch pro Seed (createRng, kein Math.random).
 */
import { createRng, evaluateLocalIn, makeConfig, makePolicy } from '../engine';
import type {
  AdminAccount,
  Iface,
  LocalInPolicy,
  LocalService,
  NetworkConfig,
  Packet,
} from '../engine';
import { ADDRESSES, ADDRESS_GROUPS, SERVICES, SERVICE_GROUPS, ZONES } from './daily';

/** Die IP der Firewall am Büro-Interface und am Internet-Interface. */
export const FW_LAN_IP = '10.0.1.1';
export const FW_WAN_IP = '203.0.113.2';

/** Das Netz, das Management darf — als Adressobjekt vorhanden. */
export const MGMT_NET = '10.0.1.0/28';

/**
 * Die drei Fallarten. Alle drei enden im gleichen Symptom („kein Zugriff" oder
 * „zu viel Zugriff"), aber die Ursache sitzt jedes Mal an einem anderen Tor —
 * das ist die Übung.
 */
export type MgmtBug = 'closed' | 'wide-open' | 'wrong-trusthost';
export const MGMT_BUGS: MgmtBug[] = ['closed', 'wide-open', 'wrong-trusthost'];

/** Welches Tor der Fall trainiert (für den Debrief). */
export const MGMT_GATE: Record<MgmtBug, 'allowaccess' | 'local-in-policy' | 'trusthost'> = {
  closed: 'allowaccess',
  'wide-open': 'local-in-policy',
  'wrong-trusthost': 'trusthost',
};

/** Ein Prüfpunkt: dieses Paket an die Firewall muss so ausgehen. */
export interface MgmtCheck {
  packet: Packet;
  expect: 'accept' | 'deny';
  /** i18n-Schlüssel der Beschreibung („Admin aus dem Büro erreicht die GUI") */
  labelKey: string;
  /**
   * true, wenn dieser Punkt das Aussperren prüft. Wird er rot, ist die Lösung
   * nicht bloß unvollständig — sie kostet eine Anfahrt.
   */
  lockout?: boolean;
}

export interface MgmtCase {
  network: NetworkConfig;
  bug: MgmtBug;
  /** i18n-Schlüssel des Tickets */
  ticketKey: string;
  suite: MgmtCheck[];
}

const ADMIN_IP = '10.0.1.5';
const OTHER_LAN_IP = '10.0.1.90';
const INTERNET_IP = '198.51.100.66';

/**
 * Interfaces MIT IPs — nur dadurch entsteht Local-In-Traffic überhaupt.
 * port2/vlan20 bleiben ohne IP: sie spielen in diesem Modus keine Rolle, und
 * ein Interface ohne IP kann kein Management-Ziel sein.
 */
function interfacesFor(lanAccess: LocalService[], wanAccess: LocalService[]): Iface[] {
  return [
    { id: 'if-p1', name: 'port1', ip: FW_LAN_IP, allowaccess: lanAccess },
    { id: 'if-v20', name: 'vlan20' },
    { id: 'if-p2', name: 'port2' },
    { id: 'if-w1', name: 'wan1', ip: FW_WAN_IP, allowaccess: wanAccess },
  ];
}

/**
 * Eine harmlose Forward-Regel bleibt im Netz. Sie ist Absicht: der Spieler soll
 * sehen, dass die Policy-Tabelle hier existiert und trotzdem nichts entscheidet.
 */
const DECOY_POLICIES = [
  makePolicy({
    id: 1,
    name: 'lan-web-out',
    srcintf: ['port1'],
    dstintf: ['wan1'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['all'],
    service: ['WEB'],
    action: 'accept',
    nat: true,
  }),
];

const toFw = (over: Partial<Packet>): Packet => ({
  srcintf: 'port1',
  srcIp: ADMIN_IP,
  dstIp: FW_LAN_IP,
  protocol: 'tcp',
  dstPort: 443,
  ...over,
});

export function generateMgmtCase(seed: string): MgmtCase {
  const rng = createRng(`aethergate-mgmt-${seed}`);
  const bug = rng.pick(MGMT_BUGS);

  let lanAccess: LocalService[];
  let wanAccess: LocalService[];
  let localInPolicies: LocalInPolicy[] | undefined;
  let admins: AdminAccount[];

  if (bug === 'closed') {
    // Nichts offen am Büro-Interface. Die Policy-Tabelle sieht dabei tadellos
    // aus — deshalb suchen die meisten dort.
    lanAccess = [];
    wanAccess = [];
    admins = [{ name: 'admin', trustedHosts: [MGMT_NET] }];
  } else if (bug === 'wide-open') {
    // Alles offen, auch nach draußen. Kein Zugriffsproblem — ein Auditbefund.
    lanAccess = ['https', 'ssh', 'ping'];
    wanAccess = ['https', 'ssh', 'ping'];
    localInPolicies = [];
    admins = [{ name: 'admin', trustedHosts: [] }];
  } else {
    // Alles richtig konfiguriert — nur zeigt trusthost auf ein Netz, das es
    // hier nicht gibt. Der Klassiker nach einer Netzumstellung.
    lanAccess = ['https', 'ssh', 'ping'];
    wanAccess = [];
    admins = [{ name: 'admin', trustedHosts: [rng.pick(['192.168.99.0/24', '172.31.0.0/16'])] }];
  }

  const network = makeConfig({
    interfaces: interfacesFor(lanAccess, wanAccess),
    zones: ZONES,
    addresses: ADDRESSES,
    addressGroups: ADDRESS_GROUPS,
    services: SERVICES,
    serviceGroups: SERVICE_GROUPS,
    routes: [
      { dst: '10.0.1.0/24', iface: 'port1' },
      { dst: '0.0.0.0/0', iface: 'wan1' },
    ],
    policies: DECOY_POLICIES,
    ...(localInPolicies !== undefined && { localInPolicies }),
    admins,
  });

  return { network, bug, ticketKey: `mgmt.ticket.${bug}`, suite: MGMT_SUITE };
}

/**
 * Die Prüfung. Gleich für alle Fälle — das Ziel ist immer dasselbe, nur die
 * Ausgangslage ist kaputt. Sie prüft ausdrücklich BEIDE Richtungen:
 * das Büro muss rein, das Internet muss draußen bleiben.
 */
export const MGMT_SUITE: MgmtCheck[] = [
  // Muss gehen — sonst hat man sich ausgesperrt
  {
    packet: toFw({ srcIp: ADMIN_IP, dstPort: 443 }),
    expect: 'accept',
    labelKey: 'mgmt.check.adminHttps',
    lockout: true,
  },
  {
    packet: toFw({ srcIp: ADMIN_IP, dstPort: 22 }),
    expect: 'accept',
    labelKey: 'mgmt.check.adminSsh',
    lockout: true,
  },
  // Darf NICHT gehen: das Internet hat auf der Management-Oberfläche nichts zu suchen
  {
    packet: toFw({ srcintf: 'wan1', srcIp: INTERNET_IP, dstIp: FW_WAN_IP, dstPort: 443 }),
    expect: 'deny',
    labelKey: 'mgmt.check.internetHttps',
  },
  {
    packet: toFw({ srcintf: 'wan1', srcIp: INTERNET_IP, dstIp: FW_WAN_IP, dstPort: 22 }),
    expect: 'deny',
    labelKey: 'mgmt.check.internetSsh',
  },
  // Und ein Rechner im LAN, der NICHT im Management-Netz liegt, auch nicht
  {
    packet: toFw({ srcIp: OTHER_LAN_IP, dstPort: 443 }),
    expect: 'deny',
    labelKey: 'mgmt.check.otherLan',
  },
];

export interface MgmtResult {
  check: MgmtCheck;
  got: 'accept' | 'deny';
  ok: boolean;
  /** Welches Tor entschieden hat — die eigentliche Erklärung */
  gate: string;
}

/** Prüft die Suite gegen die aktuelle Konfiguration. */
export function runMgmtSuite(network: NetworkConfig): MgmtResult[] {
  return MGMT_SUITE.map((check) => {
    const verdict = evaluateLocalIn(check.packet, network);
    return {
      check,
      got: verdict.action,
      ok: verdict.action === check.expect,
      gate: verdict.gate,
    };
  });
}

export function mgmtSolved(results: readonly MgmtResult[]): boolean {
  return results.length > 0 && results.every((r) => r.ok);
}

/**
 * Ausgesperrt? Das ist mehr als „ein Prüfpunkt rot": ab hier hilft nur noch die
 * Konsole vor Ort, und das ist die Erfahrung, die dieser Modus vermitteln soll.
 */
export function isLockedOut(results: readonly MgmtResult[]): boolean {
  return results.some((r) => r.check.lockout === true && !r.ok);
}

// ---------------------------------------------------------------------------
// Die Regler, die der Spieler hat
// ---------------------------------------------------------------------------

/** Dienste, die im Modus umgeschaltet werden können. */
export const TOGGLEABLE: LocalService[] = ['https', 'ssh', 'ping'];

/** allowaccess eines Interfaces umschalten. */
export function toggleAllowaccess(
  network: NetworkConfig,
  ifaceName: string,
  service: LocalService,
): NetworkConfig {
  return {
    ...network,
    interfaces: network.interfaces.map((i) => {
      if (i.name !== ifaceName) return i;
      const current = i.allowaccess ?? [];
      return {
        ...i,
        allowaccess: current.includes(service)
          ? current.filter((s) => s !== service)
          : [...current, service],
      };
    }),
  };
}

/** Trusted Hosts eines Kontos setzen. Leere Liste heißt „von überall". */
export function setTrustedHosts(
  network: NetworkConfig,
  adminName: string,
  hosts: string[],
): NetworkConfig {
  return {
    ...network,
    admins: (network.admins ?? []).map((a) =>
      a.name === adminName ? { ...a, trustedHosts: hosts } : a,
    ),
  };
}

/**
 * Die Lösung, die der Modus erwartet — als Referenz für den Debrief und als
 * Zusicherung im Test, dass der Fall überhaupt lösbar ist.
 */
export function solve(network: NetworkConfig): NetworkConfig {
  return {
    ...network,
    interfaces: network.interfaces.map((i) => {
      if (i.name === 'port1') return { ...i, allowaccess: ['https', 'ssh', 'ping'] };
      // Nach draußen bleibt zu — das ist der Punkt
      if (i.name === 'wan1') return { ...i, allowaccess: [] };
      return i;
    }),
    admins: (network.admins ?? []).map((a) => ({ ...a, trustedHosts: [MGMT_NET] })),
  };
}
