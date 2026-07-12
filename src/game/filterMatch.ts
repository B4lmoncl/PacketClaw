/**
 * Semantisches Filter-Matching wie im FortiGate-Filterdialog:
 *
 * EXACT   — der Policy-Eintrag IST genau das Gesuchte: der Objektname stimmt
 *           überein, ein Service ist exakt dieser eine Port, ein Host-Objekt
 *           ist exakt diese IP.
 * CONTAINS — der Policy-Eintrag ENTHÄLT das Gesuchte: Service-Gruppen (WEB),
 *           Portranges und ALL enthalten Port 443; Zonen und "any" enthalten
 *           ein Interface; Subnetze/Ranges/Gruppen und "all" enthalten eine
 *           IP; Adressgruppen enthalten ihre (rekursiven) Mitglieder.
 *
 * Pure Funktionen über Resolver/NetworkConfig — die UI rendert nur.
 */
import type { NetworkConfig, Resolver } from '../engine';

export type FilterMode = 'exact' | 'contains';

export type SemanticField = 'srcaddr' | 'dstaddr' | 'service' | 'srcintf' | 'dstintf';

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const PORT_RE = /^\d{1,5}$/;

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Prüft EINEN Policy-Feld-Eintrag (Objektname) gegen die Suchanfrage. */
export function entryMatchesQuery(
  network: NetworkConfig,
  resolver: Resolver,
  field: SemanticField,
  entry: string,
  rawQuery: string,
  mode: FilterMode,
): boolean {
  const query = rawQuery.trim();
  if (!query) return false;

  // Namensgleichheit zählt in beiden Modi (exakter Treffer auf das Objekt selbst)
  if (sameName(entry, query)) return true;

  if (field === 'srcintf' || field === 'dstintf') {
    if (mode === 'exact') return false;
    // "any" enthält jedes Interface; Zonen enthalten ihre Member
    if (entry === 'any') return true;
    const zone = resolver.zoneByName.get(entry);
    if (zone) {
      return zone.members.some((m) => {
        if (sameName(m, query)) return true;
        const iface = network.interfaces.find((i) => i.id === m);
        return iface ? sameName(iface.name, query) : false;
      });
    }
    return false;
  }

  if (field === 'service') {
    if (PORT_RE.test(query)) {
      const port = Number(query);
      if (mode === 'exact') {
        // NUR Services, deren Definition genau dieser eine Port ist
        const svc = network.services.find((s) => sameName(s.name, entry));
        return (
          !!svc &&
          svc.dstPorts?.length === 1 &&
          svc.dstPorts[0]?.from === port &&
          svc.dstPorts[0]?.to === port
        );
      }
      // CONTAINS: ALL, Gruppen und Portranges, die den Port abdecken
      if (entry === 'ALL') return true;
      return resolver
        .resolveServiceEntry(entry)
        .some(
          (svc) =>
            svc.protocol === 'any' ||
            (svc.dstPorts ?? []).some((r) => r.from <= port && port <= r.to),
        );
    }
    // Namens-Query: contains = Gruppe enthält den Service (rekursiv)
    if (mode === 'exact') return false;
    if (entry === 'ALL') return true;
    return resolver.resolveServiceEntry(entry).some((svc) => sameName(svc.name, query));
  }

  // srcaddr / dstaddr
  if (IPV4_RE.test(query)) {
    if (mode === 'exact') {
      // NUR Host-Objekte, die genau diese IP sind
      const obj = network.addresses.find((a) => sameName(a.name, entry));
      return !!obj && obj.type === 'host' && obj.host === query;
    }
    if (entry === 'all') return true;
    if (resolver.addressEntryMatchesIp(entry, query)) return true;
    // VIPs (nur dstaddr sinnvoll): externe oder gemappte IP
    const vip = resolver.vipByName.get(entry);
    return !!vip && (vip.extIp === query || vip.mappedIp === query);
  }
  // Objektname: contains = Gruppe enthält das Objekt (rekursiv aufgelöst)
  if (mode === 'exact') return false;
  if (entry === 'all') return true;
  return resolver.resolveAddressEntry(entry).some((obj) => sameName(obj.name, query));
}

/** Prüft ein ganzes Policy-Feld (Liste von Einträgen) gegen die Anfrage. */
export function fieldMatchesQuery(
  network: NetworkConfig,
  resolver: Resolver,
  field: SemanticField,
  entries: string[],
  query: string,
  mode: FilterMode,
): boolean {
  return entries.some((entry) => entryMatchesQuery(network, resolver, field, entry, query, mode));
}
