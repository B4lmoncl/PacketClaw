/**
 * Level-Validator — läuft in CI (npm run validate:levels).
 * Ein Level ohne grünen Validator darf nicht gemergt werden.
 *
 * Prüft pro Level:
 *  - Pflichtfelder + Schwierigkeitsmetadaten + de/en-Texte
 *  - eindeutige Level- und Policy-IDs, Policy-ID 0 ist reserviert
 *  - alle Referenzen existieren (Adressen/Gruppen/Services/Interfaces/Zonen/VIPs)
 *  - Routen zeigen auf existierende Interfaces, CIDRs/IPs sind gültig
 *  - Pakete: dstPort-Pflicht bei tcp/udp, srcintf existiert,
 *    Timestamp-Pflicht sobald das Level work-hours-Schedules nutzt
 *  - Verdict-Level: Engine liefert für jedes Paket ein eindeutiges Verdict
 *  - Architect/Audit/Incident: Testsuite vorhanden und konsistent
 *    (Audit/Incident: Startregelwerk erfüllt die Suite absichtlich NICHT
 *     vollständig, sonst gäbe es nichts zu tun — außer Task find-shadowed)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluate,
  findRedundantPolicies,
  findShadowedPolicies,
  matchesExpectation,
  isValidIPv4,
  parseCidr,
  type NetworkConfig,
  type Packet,
  type TestPacket,
} from '../src/engine/index';

interface LevelFile {
  id: string;
  chapter: number;
  index: number;
  mode: 'verdict' | 'architect' | 'audit' | 'incident';
  title: { de?: string; en?: string };
  briefing: { de?: string; en?: string };
  difficulty: number;
  concepts: string[];
  network: NetworkConfig;
  packets?: Packet[];
  targetSeconds?: number;
  timerSeconds?: number;
  ticket?: { de?: string; en?: string };
  suite?: TestPacket[];
  referencePolicyCount?: number;
  task?: string;
  maxEdits?: number;
  logPackets?: Packet[];
}

const errors: string[] = [];
let checkedLevels = 0;

function fail(level: string, message: string) {
  errors.push(`${level}: ${message}`);
}

function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectJsonFiles(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

function validateNetwork(id: string, network: LevelFile['network']) {
  const ifaceNames = new Set(network.interfaces.map((i) => i.name));
  const ifaceIds = new Set(network.interfaces.map((i) => i.id));
  const addressNames = new Set(network.addresses.map((a) => a.name));
  const addressGroupNames = new Set(network.addressGroups.map((g) => g.name));
  const serviceNames = new Set(network.services.map((s) => s.name));
  const serviceGroupNames = new Set(network.serviceGroups.map((g) => g.name));
  const zoneNames = new Set(network.zones.map((z) => z.name));
  const vipNames = new Set(network.vips.map((v) => v.name));

  // Namenskollisionen zwischen Namespaces, die die Engine verwechseln könnte
  for (const vip of vipNames) {
    if (addressNames.has(vip) || addressGroupNames.has(vip)) {
      fail(id, `VIP-Name kollidiert mit Adressobjekt/-gruppe: ${vip}`);
    }
  }

  for (const addr of network.addresses) {
    if (addr.type === 'subnet') {
      if (!addr.subnet) fail(id, `Adressobjekt ${addr.name}: subnet fehlt`);
      else {
        try {
          parseCidr(addr.subnet);
        } catch {
          fail(id, `Adressobjekt ${addr.name}: ungültiges CIDR ${addr.subnet}`);
        }
      }
    }
    if (addr.type === 'range') {
      if (!addr.range || !isValidIPv4(addr.range.from) || !isValidIPv4(addr.range.to)) {
        fail(id, `Adressobjekt ${addr.name}: ungültige Range`);
      }
    }
    if (addr.type === 'host' && (!addr.host || !isValidIPv4(addr.host))) {
      fail(id, `Adressobjekt ${addr.name}: ungültiger Host`);
    }
  }

  for (const group of network.addressGroups) {
    for (const member of group.members) {
      if (!addressNames.has(member) && !addressGroupNames.has(member)) {
        fail(id, `Adressgruppe ${group.name}: unbekanntes Mitglied ${member}`);
      }
    }
  }

  for (const svc of network.services) {
    if ((svc.protocol === 'tcp' || svc.protocol === 'udp') && svc.dstPorts) {
      for (const r of svc.dstPorts) {
        if (r.from < 0 || r.to > 65535 || r.from > r.to) {
          fail(id, `Service ${svc.name}: ungültige Portrange ${r.from}-${r.to}`);
        }
      }
    }
    if (svc.protocol !== 'tcp' && svc.protocol !== 'udp' && svc.dstPorts) {
      fail(id, `Service ${svc.name}: dstPorts nur bei tcp/udp erlaubt`);
    }
  }

  for (const group of network.serviceGroups) {
    for (const member of group.members) {
      if (!serviceNames.has(member) && !serviceGroupNames.has(member)) {
        fail(id, `Servicegruppe ${group.name}: unbekanntes Mitglied ${member}`);
      }
    }
  }

  for (const zone of network.zones) {
    for (const member of zone.members) {
      if (!ifaceIds.has(member) && !ifaceNames.has(member)) {
        fail(id, `Zone ${zone.name}: unbekanntes Member-Interface ${member}`);
      }
    }
  }

  for (const route of network.routes) {
    try {
      parseCidr(route.dst);
    } catch {
      fail(id, `Route ${route.dst}: ungültiges CIDR`);
    }
    if (!ifaceNames.has(route.iface)) {
      fail(id, `Route ${route.dst}: unbekanntes Interface ${route.iface}`);
    }
  }

  for (const vip of network.vips) {
    if (!isValidIPv4(vip.extIp)) fail(id, `VIP ${vip.name}: ungültige extIp`);
    if (!isValidIPv4(vip.mappedIp)) fail(id, `VIP ${vip.name}: ungültige mappedIp`);
  }

  const policyIds = new Set<number>();
  for (const policy of network.policies) {
    if (policy.id <= 0) fail(id, `Policy ${policy.name}: ID muss > 0 sein (0 = Implicit Deny)`);
    if (policyIds.has(policy.id)) fail(id, `Doppelte Policy-ID ${policy.id}`);
    policyIds.add(policy.id);

    for (const entry of policy.srcintf) {
      if (entry !== 'any' && !ifaceNames.has(entry) && !zoneNames.has(entry)) {
        fail(id, `Policy ${policy.id} srcintf: unbekannt ${entry}`);
      }
    }
    for (const entry of policy.dstintf) {
      if (entry !== 'any' && !ifaceNames.has(entry) && !zoneNames.has(entry)) {
        fail(id, `Policy ${policy.id} dstintf: unbekannt ${entry}`);
      }
    }
    for (const entry of policy.srcaddr) {
      if (entry !== 'all' && !addressNames.has(entry) && !addressGroupNames.has(entry)) {
        fail(id, `Policy ${policy.id} srcaddr: unbekannt ${entry}`);
      }
    }
    for (const entry of policy.dstaddr) {
      if (
        entry !== 'all' &&
        !addressNames.has(entry) &&
        !addressGroupNames.has(entry) &&
        !vipNames.has(entry)
      ) {
        fail(id, `Policy ${policy.id} dstaddr: unbekannt ${entry}`);
      }
    }
    for (const entry of policy.service) {
      if (entry !== 'ALL' && !serviceNames.has(entry) && !serviceGroupNames.has(entry)) {
        fail(id, `Policy ${policy.id} service: unbekannt ${entry}`);
      }
    }
  }
}

function validatePacket(id: string, label: string, packet: Packet, network: NetworkConfig) {
  const ifaceNames = new Set(network.interfaces.map((i) => i.name));
  if (!ifaceNames.has(packet.srcintf)) {
    fail(id, `${label}: srcintf ${packet.srcintf} existiert nicht`);
  }
  if (!isValidIPv4(packet.srcIp)) fail(id, `${label}: ungültige srcIp`);
  if (!isValidIPv4(packet.dstIp)) fail(id, `${label}: ungültige dstIp`);
  if ((packet.protocol === 'tcp' || packet.protocol === 'udp') && packet.dstPort === undefined) {
    fail(id, `${label}: dstPort fehlt bei ${packet.protocol}`);
  }
  if (packet.protocol === 'icmp' && packet.dstPort !== undefined) {
    fail(id, `${label}: icmp-Paket darf keinen dstPort haben`);
  }
}

function usesWorkHours(network: NetworkConfig): boolean {
  return network.policies.some((p) => p.schedule === 'work-hours');
}

function validateLevel(file: string) {
  const raw = readFileSync(file, 'utf8');
  let level: LevelFile;
  try {
    level = JSON.parse(raw) as LevelFile;
  } catch {
    errors.push(`${file}: kein gültiges JSON`);
    return;
  }
  const id = level.id ?? file;
  checkedLevels++;

  // Metadaten
  if (!level.id) fail(id, 'id fehlt');
  if (!level.chapter || level.chapter < 1 || level.chapter > 8) fail(id, 'chapter ungültig');
  if (!level.index || level.index < 1 || level.index > 10) fail(id, 'index ungültig (1-10)');
  if (![1, 2, 3].includes(level.difficulty)) fail(id, 'difficulty fehlt (1|2|3)');
  if (!level.title?.de || !level.title?.en) fail(id, 'title de/en fehlt');
  if (!level.briefing?.de || !level.briefing?.en) fail(id, 'briefing de/en fehlt');
  if (!Array.isArray(level.concepts) || level.concepts.length === 0) fail(id, 'concepts fehlen');
  if (!level.network) {
    fail(id, 'network fehlt');
    return;
  }

  validateNetwork(id, level.network);
  const workHours = usesWorkHours(level.network);

  if (level.mode === 'verdict') {
    if (!level.packets || level.packets.length === 0) fail(id, 'packets fehlen');
    if (!level.targetSeconds) fail(id, 'targetSeconds fehlt');
    for (const [i, packet] of (level.packets ?? []).entries()) {
      validatePacket(id, `Paket ${i + 1}`, packet, level.network);
      if (workHours && !packet.timestamp) {
        fail(id, `Paket ${i + 1}: timestamp fehlt (Level nutzt work-hours)`);
      }
      // Lösbarkeit: Engine muss deterministisch entscheiden (wirft nicht)
      try {
        evaluate(packet, level.network);
      } catch (e) {
        fail(id, `Paket ${i + 1}: Engine-Fehler ${(e as Error).message}`);
      }
    }
  } else {
    // Architect/Audit/Incident brauchen Ticket + Suite
    if (!level.ticket?.de || !level.ticket?.en) fail(id, 'ticket de/en fehlt');
    if (!level.suite || level.suite.length === 0) {
      fail(id, 'suite fehlt');
      return;
    }
    const hasPass = level.suite.some((t) => t.expect === 'accept');
    const hasBlock = level.suite.some((t) => t.expect === 'deny');
    if (!hasPass || !hasBlock) fail(id, 'suite braucht must-pass UND must-block');
    for (const [i, test] of level.suite.entries()) {
      validatePacket(id, `Suite-Paket ${i + 1}`, test.packet, level.network);
      if (workHours && !test.packet.timestamp) {
        fail(id, `Suite-Paket ${i + 1}: timestamp fehlt (work-hours)`);
      }
    }

    if (level.mode === 'architect') {
      if (!level.referencePolicyCount) fail(id, 'referencePolicyCount fehlt');
      // Startregelwerk ist leer oder minimal — die Suite darf NICHT schon grün sein
      // (leeres Regelwerk + must-pass-Erwartung kann nie grün sein; hasPass ist geprüft)
      const alreadyGreen = level.suite.every((t) => matchesExpectation(t, level.network));
      if (alreadyGreen) fail(id, 'Architect: Suite ist ohne Spielerzutun schon grün');
    }

    if (level.mode === 'audit' || level.mode === 'incident') {
      if (!level.maxEdits) fail(id, 'maxEdits fehlt');
      if (level.mode === 'incident' && (!level.logPackets || level.logPackets.length === 0)) {
        fail(id, 'incident: logPackets fehlen');
      }
      const green = level.suite.every((t) => matchesExpectation(t, level.network));
      if (level.task === 'find-shadowed') {
        if (findShadowedPolicies(level.network).length === 0) {
          fail(id, 'audit find-shadowed: keine shadowed Policy vorhanden');
        }
      } else if (level.task === 'remove-redundant') {
        // Grüne Suite ist hier erlaubt — dann muss es aber beweisbar
        // redundante Policies geben (sonst gäbe es nichts zu löschen).
        const redundant = findRedundantPolicies(
          level.network,
          level.suite.map((t) => t.packet),
        );
        if (green && redundant.length === 0) {
          fail(id, 'audit remove-redundant: keine redundante Policy gegen die Suite');
        }
      } else if (green) {
        fail(id, `${level.mode}: Suite ist schon grün — es gibt nichts zu reparieren`);
      }
    }
  }
}

// ---------------------------------------------------------------------------

const levelsDir = join(process.cwd(), 'content', 'levels');
const files = collectJsonFiles(levelsDir).sort();
const seenIds = new Set<string>();

for (const file of files) {
  validateLevel(file);
}

// Doppelte Level-IDs über alle Dateien
for (const file of files) {
  try {
    const { id } = JSON.parse(readFileSync(file, 'utf8')) as { id: string };
    if (seenIds.has(id)) errors.push(`Doppelte Level-ID: ${id}`);
    seenIds.add(id);
  } catch {
    // bereits oben gemeldet
  }
}

if (errors.length > 0) {
  console.error(`✗ ${errors.length} Fehler in ${checkedLevels} Leveln:\n`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`✓ ${checkedLevels} Level valide (${files.length} Dateien)`);
