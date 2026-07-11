# Level-Format (content/levels/)

Level sind **Daten, kein Code**: eine JSON-Datei pro Level unter
`content/levels/chapter-N/chN-lNN.json`. Jede Datei wird von
`npm run validate:levels` geprüft (läuft in CI) — ein Level ohne grünen
Validator darf nicht gemergt werden.

## Gemeinsame Felder

| Feld                | Typ                                               | Bedeutung                                              |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `id`                | string                                            | eindeutig, Schema `chN-lNN` (Daily nutzt `daily-…`)    |
| `chapter`           | 1–8                                               | Kapitel                                                |
| `index`             | 1–10                                              | Position im Kapitel; 10 = Boss                         |
| `mode`              | `verdict` \| `architect` \| `audit` \| `incident` | Aufgabentyp                                            |
| `title`, `briefing` | `{ de, en }`                                      | Titel + Konzept-Einführung (Ton: knapp, admin-trocken) |
| `difficulty`        | 1 \| 2 \| 3                                       | einführend / kombinierend / gemein                     |
| `concepts`          | string[]                                          | eingeführte/trainierte Konzepte                        |
| `network`           | NetworkConfig                                     | komplette Netz-Definition (s. u.)                      |

`NetworkConfig` = `interfaces`, `zones`, `addresses`, `addressGroups`,
`services`, `serviceGroups`, `vips`, `routes`, `policies` — Typen in
`src/engine/types.ts`, Semantik in `docs/ENGINE.md`. Konvention: `id` = `name`
bei benannten Objekten; Routen referenzieren Interface-**Namen**.

## Modus-spezifische Felder

**verdict** — Pakete bewerten:

- `packets: Packet[]` — Aufgaben in Reihenfolge (Boss: mehrere)
- `targetSeconds: number` — Zielzeit pro Paket (3. Stern), immer sichtbar
- `timerSeconds?: number` — harter Countdown (ab Kapitel 3); Ablauf = Fehlversuch

**architect** — Regelwerk bauen:

- `ticket: { de, en }` — der Auftrag in Prosa
- `suite: TestPacket[]` — unsichtbare must-pass/must-block-Suite
  (`expect: accept|deny`, optional `expectNat: boolean`)
- `referencePolicyCount: number` — Referenz-Regelzahl für den 3. Stern
- Startregelwerk (`network.policies`) darf die Suite NICHT bereits erfüllen

**audit** — Regelwerk entrümpeln:

- `task`: `find-shadowed` \| `fix-order` \| `harden-any` \| `remove-redundant`
- `suite`, `ticket`, `maxEdits` (3. Stern: Eingriffe ≤ maxEdits)
- `find-shadowed`: mindestens eine beweisbar shadowed Policy (Analyse prüft)
- `remove-redundant`: Suite darf grün sein, wenn `findRedundantPolicies`
  beweisbar Kandidaten findet; sonst muss die Suite rot starten

**incident** — Symptom finden und fixen:

- `ticket`, `suite`, `maxEdits` wie audit
- `logPackets: Packet[]` — daraus generiert die Engine den Forward-Traffic-Log
  (time, srcintf, src, dst, service, policyid, action) gegen das START-Regelwerk

## Regeln fürs Schreiben

- **Die Engine ist die Wahrheit.** Kein Level speichert eine „Lösung" — Verdicts
  kommen aus `evaluate()`, Architect/Audit/Incident aus der Suite.
- Pakete mit tcp/udp brauchen `dstPort`; icmp-Pakete dürfen keinen haben.
- Sobald ein Level `work-hours`-Schedules nutzt: **jedes** Paket braucht `timestamp`.
- Timestamps sind Wanduhrzeit (`YYYY-MM-DDTHH:mm`), TZ-Suffixe werden ignoriert.
- Distraktoren gehören in die Kurve 7–9: fast passende Regeln, disabled Regeln,
  Zonen-Verwechslung, Off-by-one an Port-/Subnetzgrenzen.
- Boss-Level (Index 10): mehrstufig (Verdict: mehrere Pakete) oder Audit/Incident,
  ohne Timer.
- Ton der Tickets: knapp, lakonisch, kein Cringe. Der Praktikant hat immer
  „nur kurz was getestet".
