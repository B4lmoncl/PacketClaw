/**
 * „Where Used" — wer verweist auf dieses Objekt?
 *
 * Im echten FortiOS trägt jede Zeile unter Policy & Objects eine Spalte
 * **Ref.** mit einer Zahl. Ein Klick darauf listet auf, WO das Objekt benutzt
 * wird, und solange die Zahl über null steht, lässt sich das Objekt nicht
 * löschen. Das ist keine Kosmetik, sondern eine der häufigsten Fragen im
 * Alltag: „Kann ich SRV_WEB01 wegwerfen?" und „Welche Regeln fasse ich an,
 * wenn ich LAN_NET ändere?"
 *
 * ZWEI ENTSCHEIDUNGEN, die dem Original folgen:
 *
 * 1. **Nur DIREKTE Verweise zählen.** Steckt ADDR in der Gruppe GRP und GRP in
 *    einer Policy, dann hat ADDR genau EINEN Verweis — die Gruppe. Genau so
 *    zählt FortiOS, und genau das ist die Lehre: Man muss die Kette
 *    zurücklaufen, statt zu hoffen, dass ein Objekt „schon irgendwie frei" ist.
 * 2. **Tokens sind keine Objekte.** `all`, `ALL` und `any` sind
 *    Platzhalter im Policy-Feld, keine Referenz auf ein Objekt gleichen Namens.
 *    Ausnahme: Existiert tatsächlich ein Objekt mit diesem Namen, ist es
 *    dasselbe Ding — dann zählt der Eintrag.
 *
 * Rein über NetworkConfig, keine Paketauswertung.
 */
import type { NetworkConfig } from './types';

export type RefKind =
  'address' | 'addressGroup' | 'service' | 'serviceGroup' | 'vip' | 'interface' | 'zone';

/** Wo der Verweis steht. */
export type RefVia =
  'policy' | 'localInPolicy' | 'addressGroup' | 'serviceGroup' | 'zone' | 'route';

export interface ObjectRef {
  via: RefVia;
  /** Anzeigename der verweisenden Stelle (Policy-Name, Gruppenname, Routen-Ziel) */
  name: string;
  /** Policy-ID, wenn der Verweis in einer (Local-In-)Policy steht */
  policyId?: number;
  /** Feld innerhalb der verweisenden Stelle */
  field: 'srcintf' | 'dstintf' | 'srcaddr' | 'dstaddr' | 'service' | 'intf' | 'member' | 'device';
}

/** Platzhalter, die kein Objekt meinen — solange kein Objekt so heißt. */
const TOKEN_BY_KIND: Partial<Record<RefKind, string>> = {
  address: 'all',
  addressGroup: 'all',
  vip: 'all',
  service: 'ALL',
  serviceGroup: 'ALL',
  interface: 'any',
  zone: 'any',
};

/** Heißt tatsächlich ein Objekt dieser Art so? Dann ist der Token dieses Objekt. */
function objectExists(config: NetworkConfig, kind: RefKind, name: string): boolean {
  switch (kind) {
    case 'address':
      return config.addresses.some((o) => o.name === name);
    case 'addressGroup':
      return config.addressGroups.some((o) => o.name === name);
    case 'service':
      return config.services.some((o) => o.name === name);
    case 'serviceGroup':
      return config.serviceGroups.some((o) => o.name === name);
    case 'vip':
      return config.vips.some((o) => o.name === name);
    case 'interface':
      return config.interfaces.some((o) => o.name === name);
    case 'zone':
      return config.zones.some((o) => o.name === name);
  }
}

/**
 * Zählt ein Feld-Eintrag als Verweis auf `name`? Der Token-Fall ist der einzige
 * Grund, warum das nicht einfach `entry === name` ist.
 */
function hits(config: NetworkConfig, kind: RefKind, name: string, entry: string): boolean {
  if (entry !== name) return false;
  const token = TOKEN_BY_KIND[kind];
  if (token !== undefined && entry === token) return objectExists(config, kind, name);
  return true;
}

/** Adress-artig: Adressobjekte, Adressgruppen und VIPs teilen sich die Felder. */
const ADDRESS_LIKE: readonly RefKind[] = ['address', 'addressGroup', 'vip'];
const SERVICE_LIKE: readonly RefKind[] = ['service', 'serviceGroup'];
const INTF_LIKE: readonly RefKind[] = ['interface', 'zone'];

/**
 * Alle Stellen, die `name` direkt nennen. Reihenfolge ist stabil: Policies
 * (aufsteigend nach ID), dann Local-In-Policies, dann Gruppen, Zonen, Routen —
 * damit die Anzeige nicht bei jedem Rendern springt.
 */
export function findReferences(config: NetworkConfig, kind: RefKind, name: string): ObjectRef[] {
  const out: ObjectRef[] = [];
  const match = (entry: string) => hits(config, kind, name, entry);

  const addressLike = ADDRESS_LIKE.includes(kind);
  const serviceLike = SERVICE_LIKE.includes(kind);
  const intfLike = INTF_LIKE.includes(kind);

  for (const policy of config.policies) {
    const ref = (field: ObjectRef['field']): ObjectRef => ({
      via: 'policy',
      name: policy.name,
      policyId: policy.id,
      field,
    });
    if (intfLike) {
      if (policy.srcintf.some(match)) out.push(ref('srcintf'));
      if (policy.dstintf.some(match)) out.push(ref('dstintf'));
    }
    if (addressLike) {
      // Ein VIP im srcaddr ist unsinnig, aber wenn es dasteht, ist es ein
      // Verweis — die Anzeige soll den Bestand zeigen, nicht ihn schönen.
      if (policy.srcaddr.some(match)) out.push(ref('srcaddr'));
      if (policy.dstaddr.some(match)) out.push(ref('dstaddr'));
    }
    if (serviceLike && policy.service.some(match)) out.push(ref('service'));
  }

  for (const policy of config.localInPolicies ?? []) {
    const ref = (field: ObjectRef['field']): ObjectRef => ({
      via: 'localInPolicy',
      name: policy.name,
      policyId: policy.id,
      field,
    });
    if (intfLike && match(policy.intf)) out.push(ref('intf'));
    if (addressLike) {
      if (policy.srcaddr.some(match)) out.push(ref('srcaddr'));
      if (policy.dstaddr.some(match)) out.push(ref('dstaddr'));
    }
    if (serviceLike && policy.service.some(match)) out.push(ref('service'));
  }

  if (kind === 'address' || kind === 'addressGroup') {
    for (const group of config.addressGroups) {
      if (group.members.some(match)) {
        out.push({ via: 'addressGroup', name: group.name, field: 'member' });
      }
    }
  }
  if (serviceLike) {
    for (const group of config.serviceGroups) {
      if (group.members.some(match)) {
        out.push({ via: 'serviceGroup', name: group.name, field: 'member' });
      }
    }
  }
  if (kind === 'interface') {
    // Zonen nennen ihre Mitglieder mal per ID, mal per Name — die Engine ist
    // an der Stelle lenient, also muss die Referenzsuche es auch sein.
    const iface = config.interfaces.find((i) => i.name === name);
    for (const zone of config.zones) {
      const named = zone.members.some((m) => m === name || (iface !== undefined && m === iface.id));
      if (named) out.push({ via: 'zone', name: zone.name, field: 'member' });
    }
    for (const route of config.routes) {
      if (route.iface === name) {
        out.push({ via: 'route', name: route.dst, field: 'device' });
      }
    }
  }

  return out;
}

/** Die Zahl in der Ref.-Spalte. */
export function referenceCount(config: NetworkConfig, kind: RefKind, name: string): number {
  return findReferences(config, kind, name).length;
}

/**
 * FortiOS lässt ein Objekt mit Verweisen nicht löschen. Das ist die Regel, an
 * der im Alltag jeder Aufräumversuch hängen bleibt — und der Grund, warum man
 * die Kette überhaupt kennen muss.
 */
export function canDelete(
  config: NetworkConfig,
  kind: RefKind,
  name: string,
): { ok: boolean; blockedBy: ObjectRef[] } {
  const blockedBy = findReferences(config, kind, name);
  return { ok: blockedBy.length === 0, blockedBy };
}

export interface UnusedObject {
  kind: RefKind;
  name: string;
}

/**
 * Objekte ohne einen einzigen Verweis — im Betrieb der Kandidat fürs
 * Aufräumen, im Audit der Hinweis auf ein Regelwerk, das mit der Zeit
 * auseinandergelaufen ist.
 *
 * Interfaces sind bewusst NICHT dabei: ein Interface ohne Policy ist Hardware,
 * kein Müll, und „lösch mal port3" wäre ein schlechter Rat.
 */
export function unusedObjects(config: NetworkConfig): UnusedObject[] {
  const out: UnusedObject[] = [];
  const groups: Array<[RefKind, ReadonlyArray<{ name: string }>]> = [
    ['address', config.addresses],
    ['addressGroup', config.addressGroups],
    ['service', config.services],
    ['serviceGroup', config.serviceGroups],
    ['vip', config.vips],
    ['zone', config.zones],
  ];
  for (const [kind, objects] of groups) {
    for (const { name } of objects) {
      if (referenceCount(config, kind, name) === 0) out.push({ kind, name });
    }
  }
  return out;
}
