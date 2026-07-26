/**
 * Local-In: Verkehr AN die FortiGate selbst (Management-Zugriff).
 *
 * WARUM DAS EIN EIGENER PFAD IST. Ein Paket an eine Interface-IP der Firewall
 * ist kein Forward-Traffic. Es wird nicht geroutet, es hat kein
 * Ziel-Interface, und es wird nicht von der Policy-Tabelle entschieden.
 * Genau diese Unterscheidung fehlt in fast jedem Erklärversuch — und sie ist
 * der Grund, warum sich Leute aus einer FortiGate aussperren.
 *
 * DREI UNABHÄNGIGE TORE. Damit Management-Verkehr ankommt, müssen alle drei
 * zustimmen:
 *
 *   1. `allowaccess` am Interface — ist der Dienst hier überhaupt offen?
 *   2. Local-In-Policy — darf diese Quelle ihn erreichen?
 *   3. `trusthost` des Admin-Kontos — nur für Admin-Dienste (https/ssh/http).
 *
 * Die Engine prüft sie in dieser Reihenfolge und meldet, WELCHES Tor zu war.
 * Die Reihenfolge ist eine Darstellungsentscheidung: fachlich müssen ohnehin
 * alle drei passen, und die Lektion ist genau die — drei voneinander
 * unabhängige Dinge können dich aussperren, und zwei davon stehen nicht in der
 * Policy-Tabelle.
 *
 * DIE ASYMMETRIE, auf die es ankommt: Local-In-Policies enden mit einem
 * IMPLIZITEN ACCEPT, nicht mit einem Implicit Deny. Eine leere
 * Local-In-Tabelle sperrt also nichts aus. Wer das mit der Forward-Tabelle
 * verwechselt, sucht den Fehler an der falschen Stelle — in beide Richtungen.
 *
 * Vereinfachungen (bewusst, siehe docs/ENGINE.md): keine VDOMs, kein
 * Session-Helper, kein `set fgfm`, und `allowaccess` kennt nur die Dienste, die
 * im Spiel vorkommen.
 */
import { cidrContains } from './ip';
import { createResolver } from './resolve';
import { scheduleMatches } from './schedule';
import type {
  AdminAccount,
  Iface,
  LocalInPolicy,
  LocalInVerdict,
  LocalService,
  MatchField,
  NetworkConfig,
  Packet,
  TraceStep,
} from './types';

/**
 * Welcher Management-Dienst ist gemeint?
 *
 * Bewusst über den Zielport, nicht über einen Service-Objektnamen: `allowaccess`
 * arbeitet auf einer echten FortiGate ebenfalls auf Dienst-Ebene und nicht über
 * die Service-Objekte der Policy-Tabelle. Ein Paket, das zu keinem bekannten
 * Management-Dienst gehört, gibt null — dann gibt es hier nichts zu erlauben.
 */
export function localServiceOf(packet: Packet): LocalService | null {
  if (packet.protocol === 'icmp') return 'ping';
  if (packet.protocol !== 'tcp') return null;
  switch (packet.dstPort) {
    case 443:
      return 'https';
    case 22:
      return 'ssh';
    case 80:
      return 'http';
    case 161:
      return 'snmp';
    default:
      return null;
  }
}

/** Dienste, hinter denen ein Admin-Login steht — nur die kennen trusthost. */
const ADMIN_SERVICES: readonly LocalService[] = ['https', 'ssh', 'http'];

export function isAdminService(service: LocalService): boolean {
  return ADMIN_SERVICES.includes(service);
}

/**
 * Das Interface, dessen IP angesprochen wird — oder undefined, wenn das Paket
 * nicht an die Firewall selbst geht.
 */
export function localInInterface(packet: Packet, interfaces: readonly Iface[]): Iface | undefined {
  return interfaces.find((i) => i.ip !== undefined && i.ip === packet.dstIp);
}

/** true, wenn dieses Paket an die FortiGate selbst geht (statt durch sie hindurch). */
export function isLocalInTraffic(packet: Packet, config: NetworkConfig): boolean {
  return localInInterface(packet, config.interfaces) !== undefined;
}

/**
 * Feldprüfung einer Local-In-Policy. Kein dstintf — Local-In-Traffic hat
 * keines, das ist der ganze Punkt. `dstaddr` bleibt trotzdem echt geprüft: auf
 * einer FortiGate kann eine Local-In-Regel gezielt EINE Interface-Adresse
 * treffen und die anderen nicht.
 */
function firstFailedLocalInField(
  policy: LocalInPolicy,
  packet: Packet,
  resolver: ReturnType<typeof createResolver>,
): MatchField | null {
  if (!resolver.interfaceMatches(policy.intf, packet.srcintf)) return 'srcintf';
  if (!policy.srcaddr.some((e) => e === 'all' || resolver.addressEntryMatchesIp(e, packet.srcIp))) {
    return 'srcaddr';
  }
  if (!policy.dstaddr.some((e) => e === 'all' || resolver.addressEntryMatchesIp(e, packet.dstIp))) {
    return 'dstaddr';
  }
  if (!policy.service.some((e) => e === 'ALL' || resolver.serviceEntryMatches(e, packet))) {
    return 'service';
  }
  if (!scheduleMatches(policy.schedule, packet.timestamp)) return 'schedule';
  return null;
}

/**
 * Passt die Quell-IP zu den Trusted Hosts des Kontos?
 *
 * KEIN trusthost gesetzt heißt „von überall" — so verhält sich eine FortiGate
 * im Auslieferungszustand, und genau deshalb ist ein leeres trusthost ein
 * Audit-Befund und kein Feature.
 */
export function trustedHostAllows(admin: AdminAccount, srcIp: string): boolean {
  if (admin.trustedHosts.length === 0) return true;
  return admin.trustedHosts.some((cidr) => cidrContains(cidr, srcIp));
}

/**
 * Entscheidet Verkehr AN die Firewall. Liefert immer ein Ergebnis mit Trace;
 * `iface` ist gesetzt, sobald das Paket eine Interface-IP anspricht.
 */
export function evaluateLocalIn(packet: Packet, config: NetworkConfig): LocalInVerdict {
  const resolver = createResolver(config);
  const trace: TraceStep[] = [];
  const iface = localInInterface(packet, config.interfaces);
  if (!iface) {
    // Kein Local-In-Traffic — der Aufrufer hätte nicht hier landen sollen
    return { action: 'deny', iface: '', service: null, gate: 'not-local', trace };
  }

  const service = localServiceOf(packet);
  trace.push({ kind: 'local-in', iface: iface.name, service });

  // Tor 1: ist der Dienst an diesem Interface überhaupt offen?
  const allowed = iface.allowaccess ?? [];
  if (service === null || !allowed.includes(service)) {
    trace.push({ kind: 'allowaccess-denied', iface: iface.name, service });
    return { action: 'deny', iface: iface.name, service, gate: 'allowaccess', trace };
  }

  // Tor 2: Local-In-Policies, top-down — aber mit implizitem ACCEPT am Ende
  for (const policy of config.localInPolicies ?? []) {
    if (!policy.enabled) {
      trace.push({ kind: 'policy-skipped', policyId: policy.id, reason: 'disabled' });
      continue;
    }
    const failedField = firstFailedLocalInField(policy, packet, resolver);
    if (failedField !== null) {
      trace.push({ kind: 'local-in-no-match', policyId: policy.id, failedField });
      continue;
    }
    trace.push({ kind: 'local-in-match', policyId: policy.id, action: policy.action });
    if (policy.action === 'deny') {
      return {
        action: 'deny',
        iface: iface.name,
        service,
        gate: 'local-in-policy',
        matchedPolicyId: policy.id,
        trace,
      };
    }
    // ACCEPT heißt nicht „durch": trusthost kommt noch
    return finish(packet, config, iface.name, service, trace, policy.id);
  }

  // Die Asymmetrie: keine Regel getroffen ⇒ erlaubt (NICHT Implicit Deny)
  trace.push({ kind: 'local-in-implicit-accept' });
  return finish(packet, config, iface.name, service, trace);
}

/** Tor 3: trusthost — nur für Dienste mit Admin-Login. */
function finish(
  packet: Packet,
  config: NetworkConfig,
  ifaceName: string,
  service: LocalService,
  trace: TraceStep[],
  matchedPolicyId?: number,
): LocalInVerdict {
  const admins = config.admins ?? [];
  if (isAdminService(service) && admins.length > 0) {
    // Ein einziges Konto muss die Quelle akzeptieren — mehr braucht es nicht,
    // um sich anzumelden
    const admin = admins.find((a) => trustedHostAllows(a, packet.srcIp));
    if (!admin) {
      trace.push({ kind: 'trusthost-denied', admins: admins.map((a) => a.name) });
      return {
        action: 'deny',
        iface: ifaceName,
        service,
        gate: 'trusthost',
        matchedPolicyId,
        trace,
      };
    }
    trace.push({ kind: 'trusthost-ok', admin: admin.name });
    return {
      action: 'accept',
      iface: ifaceName,
      service,
      gate: 'open',
      admin: admin.name,
      matchedPolicyId,
      trace,
    };
  }
  return { action: 'accept', iface: ifaceName, service, gate: 'open', matchedPolicyId, trace };
}
