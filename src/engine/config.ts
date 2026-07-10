import type { NetworkConfig, Policy } from './types';

/** Füllt fehlende Collections mit leeren Arrays — für Tests und schlanke Level-JSONs. */
export function makeConfig(partial: Partial<NetworkConfig>): NetworkConfig {
  return {
    interfaces: partial.interfaces ?? [],
    zones: partial.zones ?? [],
    addresses: partial.addresses ?? [],
    addressGroups: partial.addressGroups ?? [],
    services: partial.services ?? [],
    serviceGroups: partial.serviceGroups ?? [],
    vips: partial.vips ?? [],
    routes: partial.routes ?? [],
    policies: partial.policies ?? [],
  };
}

/** Policy mit sinnvollen Defaults — reduziert Boilerplate in Tests und Generatoren. */
export function makePolicy(partial: Partial<Policy> & Pick<Policy, 'id'>): Policy {
  return {
    name: partial.name ?? `policy-${partial.id}`,
    enabled: partial.enabled ?? true,
    srcintf: partial.srcintf ?? ['any'],
    dstintf: partial.dstintf ?? ['any'],
    srcaddr: partial.srcaddr ?? ['all'],
    dstaddr: partial.dstaddr ?? ['all'],
    service: partial.service ?? ['ALL'],
    action: partial.action ?? 'accept',
    nat: partial.nat ?? false,
    schedule: partial.schedule ?? 'always',
    log: partial.log ?? false,
    id: partial.id,
  };
}
