/**
 * Level-Format und Loader. Level sind Daten (JSON unter content/levels/),
 * kein Code. Die Engine ist die einzige Quelle für Lösungen.
 */
import type { NetworkConfig, Packet, TestPacket } from '../engine';

export interface LocalizedText {
  de: string;
  en: string;
}

export type LevelMode = 'verdict' | 'architect' | 'audit' | 'incident';

export interface LevelBase {
  id: string; // "ch1-l01"
  chapter: number; // 1..8
  index: number; // 1..10 (10 = Boss)
  mode: LevelMode;
  title: LocalizedText;
  briefing: LocalizedText;
  /** 1 = einführend, 2 = kombinierend, 3 = gemein */
  difficulty: 1 | 2 | 3;
  /** neue Konzepte dieses Levels (für die "Neu hier"-Karte) */
  concepts: string[];
  network: NetworkConfig;
}

export interface VerdictLevel extends LevelBase {
  mode: 'verdict';
  /** Aufgaben in Reihenfolge; Boss-Level haben mehrere */
  packets: Packet[];
  /** Zielzeit (Sekunden) pro Paket für den 3. Stern; sichtbar, aber ohne Zwang */
  targetSeconds: number;
  /** harter Countdown (ab Kapitel 3); undefined = kein Timer */
  timerSeconds?: number;
}

export interface ArchitectLevel extends LevelBase {
  mode: 'architect';
  ticket: LocalizedText;
  suite: TestPacket[];
  /** Referenz-Regelanzahl für den 3. Stern */
  referencePolicyCount: number;
}

export interface AuditLevel extends LevelBase {
  mode: 'audit';
  ticket: LocalizedText;
  task: 'find-shadowed' | 'fix-order' | 'harden-any' | 'remove-redundant';
  suite: TestPacket[];
  /** maximale Eingriffe (Edits/Moves/Deletes) für den 3. Stern */
  maxEdits: number;
}

export interface IncidentLevel extends LevelBase {
  mode: 'incident';
  ticket: LocalizedText;
  /** Pakete, aus denen der Forward-Log generiert wird */
  logPackets: Packet[];
  suite: TestPacket[];
  maxEdits: number;
}

export type Level = VerdictLevel | ArchitectLevel | AuditLevel | IncidentLevel;

// ---------------------------------------------------------------------------
// Loader: alle JSON-Level einlesen (eager — Content ist Teil des Bundles)
// ---------------------------------------------------------------------------

const modules = import.meta.glob('/content/levels/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Level>;

export const allLevels: Level[] = Object.values(modules).sort(
  (a, b) => a.chapter - b.chapter || a.index - b.index,
);

export function levelsForChapter(chapter: number): Level[] {
  return allLevels.filter((l) => l.chapter === chapter);
}

export function getLevel(id: string): Level | undefined {
  return allLevels.find((l) => l.id === id);
}

export const CHAPTERS: { number: number; title: LocalizedText }[] = [
  { number: 1, title: { de: 'First Match & Implicit Deny', en: 'First Match & Implicit Deny' } },
  { number: 2, title: { de: 'Adressobjekte', en: 'Address Objects' } },
  { number: 3, title: { de: 'Services & Ports', en: 'Services & Ports' } },
  { number: 4, title: { de: 'Interfaces, VLANs & Zonen', en: 'Interfaces, VLANs & Zones' } },
  { number: 5, title: { de: 'Stateful Thinking', en: 'Stateful Thinking' } },
  { number: 6, title: { de: 'SNAT', en: 'SNAT' } },
  { number: 7, title: { de: 'VIPs / DNAT', en: 'VIPs / DNAT' } },
  { number: 8, title: { de: 'Audit & Hardening', en: 'Audit & Hardening' } },
];
