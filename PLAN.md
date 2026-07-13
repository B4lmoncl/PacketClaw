# AetherGate (ehem. Arbeitstitel PacketClaw) — Plan

> **⭐ OBERSTE DIREKTIVE (Prio 1, Nutzerwunsch 2026-07-11):** AetherGate soll
> sich so nah wie möglich **1:1 wie ein echtes FortiGate-GUI** bedienen — mit
> allem, was dazugehört — und darüber werden Aufgaben spielerisch gelöst, damit
> der Spieler lernt, mit echten FortiGates zu arbeiten. GUI-Nähe schlägt eigene
> Design-Ideen; fachliche Korrektheit ist nicht verhandelbar; Lore/Gamification
> ist Rahmen, nie Ersatz. Details: **CLAUDE.md** ganz oben.

> **Namensentscheidung (2026-07-10, Nutzerwunsch: Name gemäß QuestHall-Lore-Bible):**
> Das Spiel heißt **AetherGate** — Schwestertitel zu QuestHall, verankert in dessen Welt
> (Aethermoor, der Aetherstrom, das Venennetz des Turms). Framing: Der Spieler ist
> **Torwächter des Venennetzes** — er entscheidet, welcher Aetherstrom (Traffic) die Tore
> des Turms passieren darf. Das Krebs-Maskottchen bleibt und heißt **Snipp, der Torwächter**
> (sein Snip beim DENY ist namensgebend). Verworfene Kandidaten: Aetherwacht, Venenwacht,
> WardHall, Torwacht.
> **Wichtig:** Die Lore ist Rahmen (Titel, Tickets, Flavor) — die Fachbegriffe im Spiel
> (Policy, srcintf, VIP, Implicit Deny …) bleiben unverändert fachlich korrekt.
> Technische IDs (Repo `packetclaw`, npm-Name, localStorage-Key) bleiben bis v1.0 stabil;
> Repo-Rename ist optional Sache des Owners (GitHub redirectet).
>
> Hosting-Konzept (Container auf dem QuestHall-VPS): **docs/DEPLOY.md**.

## 1. Kurzarchitektur

```
src/engine/        # pure TS-Lib: Typen, evaluate(), Analysefunktionen, seedbarer RNG — KEINE UI-Abhängigkeiten
src/game/          # Modi-Logik, Scoring, Progression, Savegame (localStorage, versioniert)
src/ui/            # React-Komponenten, Screens, Animationen (Framer Motion)
src/theme/         # tokens.ts (Farben, Typo, Radii), globale Styles
content/levels/    # JSON-Level pro Kapitel (Level = Daten, kein Code)
content/i18n/      # de.json (Default), en.json
scripts/           # validate-levels.ts, generate-daily-preview.ts
docs/              # ENGINE.md (Semantik + Vereinfachungen), CONTENT.md (Level-Format)
```

Stack: Vite + React 18 + TypeScript (strict), TailwindCSS, Zustand, Framer Motion, i18next, vitest + fast-check + @testing-library/react. Kein Backend, Persistenz nur localStorage + JSON-Export/Import.

**Grundsatz:** Die Engine ist die Wahrheit. Jede didaktische Aussage (Debrief, Trace-Animation, Sterne-Bewertung) wird aus Engine-Ausgaben generiert, nie handgeschrieben dupliziert.

## 2. Engine-Semantik (verbindliche Entscheidungen)

Evaluationsreihenfolge für ein Paket:

1. **VIP/DNAT-Check zuerst:** Matcht `dstIp` (+ ggf. `protocol`/`extPort`) ein VIP-Objekt, wird die effektive Routing-Ziel-IP die `mappedIp`, und für den Policy-Match ist die Destination das **VIP-Objekt** (Policy matcht nur, wenn `dstaddr` den VIP-Namen enthält — `"all"` matcht DNAT-Traffic bewusst NICHT; das ist die klassische FortiOS-Lektion).
   _Abweichung von der wörtlichen Prompt-Reihenfolge (Route vor VIP): FortiOS macht DNAT vor dem Routing-Lookup; nur so ergibt WAN→DMZ-Portforwarding das richtige `dstintf`. Fachkorrektheit gewinnt. Dokumentiert in docs/ENGINE.md._
2. **Routing:** Longest-Prefix-Match der effektiven Ziel-IP gegen die Level-Routing-Tabelle → `dstintf`. Kein Match → Verdict `deny`, `matchedPolicyId: 0`, Trace „keine Route".
3. **Top-down, First Match:** Policies in Listenreihenfolge; `enabled: false` wird übersprungen (Trace: skipped). Felder werden in fester Reihenfolge geprüft (srcintf → dstintf → srcaddr → dstaddr → service → schedule); das **erste** scheiternde Feld landet im Trace.
4. **Feld-Matching:** Innerhalb eines Feldes ODER, zwischen Feldern UND. Interfaces: exakter Name, Zonen-Mitgliedschaft oder `"any"`. Adressen: rekursive Gruppenauflösung (zyklensicher), `"all"` matcht jede IP (außer DNAT-Traffic, s. o.), CIDR inkl. Netz-/Broadcast-Adresse, Ranges inklusiv. Services: rekursiv, `"ALL"` matcht alles; tcp/udp = Protokoll UND dstPort in Range; icmp = Protokoll (+ Typ falls gesetzt). Schedule `work-hours` = Mo–Fr 08:00–17:59 (Wanduhrzeit aus dem ISO-String, deterministisch, keine System-TZ); fehlender Timestamp ⇒ work-hours-Policies matchen nicht.
5. **Implicit Deny:** keine Policy matcht → `deny`, `matchedPolicyId: 0`. UI zeigt immer Zeile „0 · Implicit Deny · DENY".
6. **Stateful didaktisch:** Engine bewertet nur Initiator-Pakete. Antwortverkehr braucht keine Regel — Kapitel 5 macht daraus die „überflüssige Rückregel"-Falle.
7. **SNAT:** nur Flag (`nat: true` + accept ⇒ `natApplied: true`, Egress-Interface-IP), keine IP-Pools.

Analysefunktionen (Audit-Modus): `findShadowedPolicies` (konservative Mengenlogik, bei Unentscheidbarkeit NICHT markieren), `findRedundantPolicies` (entfernbar ohne Verhaltensänderung gegen Testsuite), `findOverbroadPolicies` (Accept-Policies mit all/ALL/any, die sich gegen die must-pass-Suite enger fassen lassen).

Test-Gate Phase 1: vitest, >95 % Branch-Coverage auf `src/engine/`, alle Pflicht-Edge-Cases aus dem Briefing, fast-check-Property-Test (genau ein Verdict, matchedPolicyId ∈ {0} ∪ enabled-IDs, Trace konsistent).

## 3. Spielmodi

Alle Modi nutzen dieselbe Engine + dasselbe Level-Format. Nach jeder Antwort: **Debrief** aus dem Engine-Trace (welche Policy matchte und warum; pro darüberliegender Policy das erste gescheiterte Feld).

- **A Verdict** (Kern, touch-first): Diagramm + Policy-Tabelle + Paket → (1) ACCEPT/DENY, (2) Policy-ID inkl. „0". Timer optional ab Kapitel 3.
- **B Architect:** Ticket in Prosa + Objektbibliothek → Policies bauen/ordnen; unsichtbare must-pass/must-block-Suite prüft. Sterne für minimale Regelzahl + Verzicht auf all/ALL.
- **C Audit:** gewachsenes Regelwerk (8–25 Regeln) → shadowed Rule finden, Reihenfolge fixen, Any-Any härten, Redundanz löschen. Verifikation via Analysefunktionen.
- **D Incident:** Symptom-Ticket + Engine-generierter Forward-Log → schuldige Policy finden + Fix anwenden. Verifikation via Testsuite.
- **Daily Run:** 10 prozedurale Verdict-Aufgaben, Seed = Datum (mulberry32, kein Math.random), Share-Text nur via Clipboard.
- **Sandbox:** freies Netz/Regelwerk/Testpakete, animierter Match-Trace, JSON-Export/Import.

## 4. Kampagnen-/Kapitelplan (8 Kapitel × 9 Level + 8 Boss = 80 Level)

| Kap | Thema                       | Neue Konzepte                                           | Formate                        |
| --- | --------------------------- | ------------------------------------------------------- | ------------------------------ |
| 1   | First Match & Implicit Deny | Reihenfolge > Spezifität, Deny über Accept              | nur Verdict                    |
| 2   | Adressobjekte               | CIDR, Host/Subnetz/Range, Gruppen, „all"-Fallen         | Verdict + erste Architect      |
| 3   | Services                    | Portranges, tcp/udp, ICMP, „ALL"-Fallen                 | Verdict (Timer!) + Architect   |
| 4   | Interfaces, VLANs & Zonen   | srcintf/dstintf, Zonen, „any", Routing→dstintf          | Verdict + Architect            |
| 5   | Stateful Thinking           | Initiator vs. Antwort, überflüssige Rückregel           | Verdict + Audit                |
| 6   | SNAT                        | nat-Flag, LAN→WAN vs. LAN→DMZ, vergessenes NAT          | Verdict + Incident             |
| 7   | VIPs / DNAT                 | Portforwarding, extPort≠mappedPort, VIP-Objekt-Falle    | Verdict + Architect + Incident |
| 8   | Audit & Hardening           | Shadowing, Redundanz, Any-Any, Logging, Least Privilege | fast nur Audit/Incident        |

Kurve pro Kapitel: 1–3 einführend, 4–6 kombinierend, 7–9 gemein (Distraktoren: fast passende Regeln, disabled Regeln, Zonen-Verwechslung, Off-by-one an Port-/Subnetzgrenzen). Boss (Level 10) = Incident/Audit, mehrstufig, ohne Timer.

Level = JSON unter `content/levels/`, validiert durch `npm run validate:levels` in CI (lösbar, eindeutig/konsistent, Referenzen existieren, Schwierigkeitsmetadaten, Timestamp-Pflicht sobald schedules vorkommen).

## 5. Gamification

- Verdict: 100 × Combo (×1,0 +0,1 je Serie, Cap ×3,0; Fehler = Reset) + Zeitbonus. Architect/Audit/Incident: 250–500 nach Schwierigkeitsmetadatum.
- Sterne: 1 gelöst / 2 ohne Fehlversuch / 3 zusätzlich Zielzeit bzw. ≤ Referenz-Regelzahl ohne all/ALL bzw. minimaler Eingriff.
- Ränge: Packet Rookie → Port Wächter → Rule Runner → Zone Keeper → NAT Navigator → Session Sensei → Audit Ace → Policy Architect → Implicit-Deny-Veteran → Claw Commander.
- ≥25 Achievements, Daily-Streak mit Freeze-Token alle 7 Tage.
- Save: localStorage, `saveVersion` + Migration, Export/Import als JSON.

## 6. Design

Tokens in `src/theme/tokens.ts`: BG `#0B1220`, Panel `#111A2E`, Akzent `#FF5A3C` (Claw-Koralle), Erfolg `#3DDC97`, Warn `#FFB020`, Deny `#FF3B5C`, Text `#E6EDF7`/`#8A97AD`. Space Grotesk (Display) / Inter (UI) / JetBrains Mono (Daten), lokal gebundelt. 6px/2px-Radien, 1px-Linien.

**Signature: Packet Descent** — Paket-Chip fährt die Tabelle top-down ab, scheiternde Felder glimmen rot, Match rastet ein; ACCEPT = Claw schnappt & schleudert durchs Egress (Partikel in Trace-Grün), DENY = Snip + Fragment-Konfetti + ≤4px Shake, Implicit Deny = Durchfallen bis Zeile 0 (rotes Pulsieren). Läuft als skippbares Debrief-Replay. `prefers-reduced-motion` ⇒ statische Trace-Tabelle.

**QuestHall-Orientierung** (Nutzerwunsch, 2026-07-10 — Schwesterprojekt `B4lmoncl/QuestHall`):
PacketClaw übernimmt QuestHalls Gamification-Sprache und Teile der visuellen Signatur, ohne die eigene Identität (Ops-Terminal + Claw-Koralle) aufzugeben:

- _Thematisch:_ Levelauswahl als **Quest-Board** (Karten statt nackter Liste); Kampagne als „Aufstieg" mit Kapitel-Türen wie QuestHalls Tower-Map; Achievements mit **Rarity-Stufen** (common → rare → epic → legendary) inkl. Rarity-Glow; Daily Run als „Daily Quest" mit Login-/Streak-Kalender-Gefühl; XP-Bar + Rang prominent im Header (RPG-Statbar); Tickets im Architect/Incident-Modus als „Quest-Auftrag" mit Auftraggeber-NPC-Flavor (z. B. „der Praktikant", „die Buchhaltung").
- _Visuell:_ dezenter vertikaler Hintergrund-Gradient wie QuestHall (`#0B1220 → leicht violettes Tiefblau → #0B1220`, langsame Animation, unter reduced-motion statisch); Glow-„breathe"-Animationen für seltene Achievements/3-Sterne-Momente (Gold-Glow analog QuestHalls Legendary); Star-Earn-Animation bei Sternevergabe; kompakte Karten mit `hover:bg-white/[0.02]`-Idiom, `text-xs`-Dichte und Mono-Zahlen wie in QuestHalls Quest-Cards; Krebs-Maskottchen als **Pixel-Art-Sprite-Set** (passend zu QuestHalls Pixel-Assets), selbst gestaltet.
- _Nicht übernehmen:_ Gacha/Loot/Professions-Mechaniken (REJECTED-Geist: polierter Kern gewinnt), Backend/Accounts, Next.js-Stack (PacketClaw bleibt Vite-SPA).

Sound: selbstgenerierte Web-Audio-Blips, Mute prominent, kein Autoplay. Touch-first (Verdict einhändig @390px), PWA offline, A11y: Tastatur, Fokus, Farbinfo nie allein, AA-Kontraste.

## 7. Phasen & Status

- [x] Phase 0 — Plan (dieses Dokument, REJECTED.md, Scaffold)
- [x] Phase 1 — Engine + Analysefunktionen + Tests (133 Tests grün, 96,6 % Branch-Coverage)
- [x] Phase 2 — Verdict spielbar (Kapitel 1 komplett, Packet Descent, Debrief, Save; Desktop + 390px verifiziert)

### Screenshot-Selbstkritik Phase 2 (2026-07-10)

Geprüft via Playwright (1280px + 390px): Home, Kapitelauswahl, Verdict-Frage, Policy-Auswahl, Debrief.

- ✅ Tokens sitzen: Nachtblau/Koralle/Trace-Grün, Mono-Daten mit tabular-nums, 1-px-Linien, Chips statt Schatten.
- ✅ 390px einhändig spielbar: große ACCEPT/DENY-Buttons unten (safe-area), Policy-Wahl per Zeilen-Tap.
- ✅ Debrief generiert aus Trace (Match-Begründung + SNAT-Hinweis); Chip sitzt sichtbar in der gematchten Zeile.
- 🔧 Behoben: Emoji im Netzdiagramm (🦞) renderte im Headless-Container nicht → ersetzt durch SVG-Zangen + „FW"-Label (font-unabhängig). ⚔ beim Boss ebenso → ★.
- 📝 Offen für Phase 4: Claw-Snip-Animation beim DENY ist aktuell nur Row-Highlight (Partikel/Konfetti + Screen-Shake folgen mit Sound zusammen); Descent-Chip könnte beim ACCEPT durchs Egress „geschleudert" werden (Partikelspur).
- [x] Phase 3 — Volle Breite: alle 4 Modi, 80 Level über 8 Kapitel, Daily Run (seeded), Sandbox (JSON-Export/Import), Validator in CI; jeder Modus E2E im Browser verifiziert
- [x] Phase 4 — Gamification & Polish: Ränge/Achievements/Streak, Web-Audio-Sound, PWA (Manifest + SW, offline), i18n en, interaktives Onboarding, Settings inkl. Save-Export/Import; E2E verifiziert (Onboarding-Flow, SW-Registrierung, Profil, reduced-motion via Daily-E2E)
- [x] Phase 5 — Ship: Multi-Stage-Dockerfile (Tests im Build), nginx-SPA-Config mit CSP, compose (localhost-Bindung, Healthcheck, Traefik-Beispiel), CI-ghcr-Push bei v*-Tags, README (Features, Screenshots, Deploy in 3 Befehlen), CHANGELOG, docs/CONTENT.md, Tag v1.0.0. Hinweis: Docker-Build lokal nicht verifizierbar (kein Daemon im Dev-Container) — Verifikation über den CI-Lauf des Tags.

## 7b. Nutzerwünsche (2026-07-10, verbindlich)

- **Visuelle Regelverarbeitung ist Kern-Feature:** Der Spieler muss jederzeit SEHEN können, wie ein Paket verarbeitet wird — nach FortiGate-Vorbild (Policy-Lookup-Denke): Packet Descent als animierter Trace über die Policy-Tabelle, pro Zeile Aufleuchten des scheiternden Felds, statische Trace-Tabelle als reduced-motion-Variante UND als jederzeit aufrufbare „Warum?"-Ansicht im Debrief. Auch in der Sandbox: Paket abfeuern → Trace ansehen.
- **Tutorial/Onboarding:** interaktives 3-Minuten-Tutorial (Phase 4) + kontextuelle Konzept-Einführungen pro Kapitel („Neu in diesem Kapitel"-Karte vor Level 1).
- **Vollwertiges Spiel mit viel Content:** 80+ Level, alle Modi, Daily, Gamification — wie geplant; Umfang geht vor Deadline.
- **Security Profiles / cert vs. deep inspection:** auf ROADMAP.md (v1.1) — eigenes Kapitel mit Inspection-Entscheid-Aufgaben. NAT/SNAT/DNAT sind bereits Kern-Kapitel 6/7.

- **HA-Cluster, Perimeter- vs. interne FW, Routing vertieft (2026-07-10):** DMZ + Routing (LPM→dstintf) sind bereits Kern; Placement-Aufgaben („auf welcher der beiden Firewalls blocke ich — und warum") und HA-Fallen (Config-Sync, Failover, Session-Pickup) als **v1.2** auf ROADMAP.md ausgearbeitet — Wunsch: Aufnahme „nach und nach".

## 8. Offene Entscheidungen / Notizen

- **Repo-Anlage:** Die GitHub-Integration darf keine neuen Repos anlegen (403). Der komplette Stand lebt als eigenständige Historie auf dem Session-Branch und wird nach manueller Anlage von `packetclaw` dorthin gepusht (`git push <neues-remote> HEAD:main`).
- VIP-vor-Routing-Reihenfolge: entschieden (s. o., Fachkorrektheit).
- `dstaddr:"all"` matcht keinen DNAT-Traffic: entschieden (FortiOS-Verhalten ohne match-vip; dokumentiert als bewusste Vereinfachung, dass es kein match-vip-Flag gibt).
- Tailwind v3 (klassische Config) statt v4: bewusst, stabilere Token-Integration; Wechsel ist v1.1-Thema.
- Schedule-Zeitzone: Wanduhrzeit aus dem ISO-String, Suffixe werden ignoriert — deterministisch auf jedem Client. In CONTENT.md dokumentieren.

## Nachtrag 2026-07-11: Accounts + VPS-Deploy (Nutzerwunsch)

- Backend im QuestHall-Stil: `server/` (Express, scrypt, Token, JSON in
  DATA_DIR), Client-Sync in `src/game/sync.ts`, Konto-Panel in den Settings.
- Deploy: `git clone` auf dem VPS + `docker compose up -d --build`,
  Bind über `AETHERGATE_BIND` (0.0.0.0 = direkt über Public IP, ohne DNS).
- Desktop-first-Layout (max-w-7xl, Verdict-Zweispalter) — PC ist Prio,
  Mobile bleibt voll spielbar.
- Offen/Roadmap: QuestHall-Optik-Feinschliff (Animationen, weniger
  Claw-Referenzen in Texten), HTTPS via Reverse Proxy wenn gewünscht.

## Status-Log (für zukünftige Sessions — Details in den Task-Todos)

- 2026-07-11: Accounts+Sync live (server/, sync.ts), Deploy via git clone +
  compose build (docs/DEPLOY.md), Desktop-Layout 7xl, Default-Sprache en,
  QuestHall-Animationen, Objekt-Inspektion Schritt 1+2 (resolveObjectInfo +
  Hover/Tap-Popover in PolicyTable). OFFEN (Tasks #18-24): CK3-Lock-Tooltips
  - verschachtelte Hover + Workbench-Integration; FortiGate-Filterleiste;
    Challenge-Level mit langen/verworrenen Regelwerken; Daily-Generator
    (Varianz, weniger Implicit Deny); echte Zeitanzeige in Verdict/Daily;
    Endlos-Modus; Animations-Timing-Review.
- 2026-07-11 (später): Oberste Direktive verankert (CLAUDE.md: 1:1
  FortiGate-GUI-Nähe als Prio 1). Erledigt: Stoppuhr/Zeitanzeige in
  Verdict/Daily; Daily-Generator neu (Themen, 6-14 Policies, balancierte
  Ausgänge statt Implicit-Deny-Flut, ≥2 Accepts garantiert); Freitext- +
  additive Feld-Filter in der Policy-Tabelle (FortiGate-Stil); CK3-Tooltips
  (Hover→Lock per Klick, verschachtelte Member-Inspektion); Descent hält
  1,3s auf der Match-Zeile. OFFEN (hohe Prio zuerst): #26 FortiGate-
  Spaltenlayout der Policy-Tabelle (+ Filter am Spaltenkopf, linke Navi,
  Log-Ansicht wie Original), #18-Rest (Chips in RulesetWorkbench, Popover-
  Randkollision), #22 lange verworrene Challenge-Regelwerke (+ Workbench-
  Filter, IP-Containment-Suche), #19 Endlos-Modus.
- 2026-07-12: Großer FortiGate-GUI-Schub. ERLEDIGT: Policy-Tabelle als
  echtes Spaltenlayout (Desktop, #26); FortiGate-Filter — Objekt-Auswahl
  statt Freitext (#25) UND Spaltenkopf-Dropdown pro Spalte mit Trefferzahl
  in aktueller Auswahl (#27, Portal-gerendert); CK3-Tooltips fertig
  (Hover→Lock, verschachtelte Member-Inspektion, #18 Kern); Maskottchen ist
  jetzt das QuestHall-Wächter-Portrait statt Krebs (#28); Endlos-/Survival-
  Modus komplett (#19). OFFEN: #18-Rest (Objekt-Chips auch im Regelwerk-
  Editor RulesetWorkbench; Popover-Randkollision rechts via Portal), #22
  Challenge-Level mit langen/verworrenen Regelwerken (+ Workbench-Filter,
  IP-Containment-Suche 'Filter 10.0.1.5 findet Regeln deren Objekt die IP
  enthält'). Weitere FortiGate-Nähe als Folge-Ideen: linke FortiOS-Navi als
  Spielnavigation, Forward-Traffic-Log im Incident-Modus mit Original-
  Spalten. Tests: 189 grün.
- 2026-07-12 (Forts.): Endlos-Modus fertig (#19); Objekt-Browser
  „Policy & Objects" in Verdict/Endless/Sandbox (#29); Forward-Traffic-Log
  im FortiOS-Stil im Incident-Modus (#30). Damit deckt AetherGate den
  FortiGate-Kernworkflow ab: Policy-Spaltentabelle + Spaltenkopf-Filter,
  Objekt-Inspektion (Hover/Lock) + Objekt-Browser, Traffic-Log lesen,
  Regelwerk bauen/reparieren. OFFEN: #22 lange/verworrene Challenge-
  Regelwerke (nutzt Filter+Browser am meisten); #18-Rest (Objekt-Chips
  auch im RulesetWorkbench-Editor; Popover-Randkollision via Portal);
  Folge-Ideen: linke FortiOS-Navi, Endlos-Bestwert im Profil, IP-
  Containment-Suche im Filter. Tests: 189 grün, 30 Commits gepusht.
- 2026-07-12 (Forts. 2): #22 Challenge-Modus fertig (Generator 16/26/38
  Regeln mit toten/OLD_-Duplikaten + Größenwahl-Screen + Home-Kachel);
  #18 KOMPLETT (Objekt-Popover portal-gerendert/scrollfest, Workbench-
  Integration via PolicyTable verifiziert); IP-Containment-Suche im
  Freitextfilter ('10.0.1.5' matcht Regeln, deren Adressobjekte die IP
  enthalten, via createResolver). Damit sind ALLE Tasks der Liste
  abgearbeitet. Tests: 196 grün. Nächste Kandidaten (nicht begonnen):
  linke FortiOS-Navi als Spielnavigation; Endlos-/Challenge-Bestwerte im
  ProfileScreen; Audit-Challenge (find-shadowed über 30+ Regeln);
  Roadmap v1.1 (Security Profiles, cert vs. deep inspection), v1.2
  (HA-Cluster, Perimeter-Placement, Routing-Vertiefung).
- 2026-07-12 (Forts. 3): FortiOS-7.6-Doku-Abgleich der Policy-Liste
  durchgefuehrt (docs.fortinet.com Firewall policy / Policy views and
  policy lookup / FortiManager Policy search and filter). Nachgebaut:
  NOT-Filter (not equals) im Spaltenkopf-Dropdown; Policy-Views
  Interface Pair View (kollabierbare srcintf→dstintf-Sektionen) +
  By Sequence; Policy Lookup in der Workbench (Pflicht-srcintf,
  Protokoll, IPs, Port → matchende Regel wird gehighlightet). Bereits
  vorher abgedeckt: Spaltenfilter+Counts, OR/AND-Semantik, Freitext-
  suche (+IP-Containment, mehr als Original), Implicit-Deny-Zeile,
  Disabled-Darstellung. OFFEN (niedrig): Gear-Spaltenkonfig, Rechts-
  klick-Menue, Sequence Grouping View, Suche in Filter-Dropdowns.
  Tests: 196 gruen.
- 2026-07-12 (Forts. 4): Filterdialog auf FortiGate-Niveau (#32,
  Nutzerwunsch woertlich umgesetzt): Wert tippen + Contains/Exact/NOT +
  Apply im Spaltenkopf-Dialog; CONTAINS loest SEMANTISCH auf via
  src/game/filterMatch.ts (Service-Gruppen wie WEB + Portranges + ALL
  enthalten Port 443; Zonen/any enthalten Interfaces; Subnetze/Ranges/
  Adressgruppen rekursiv + all enthalten IPs und Host-Objekte; VIPs ueber
  ext-/mapped-IP), EXACT = ist genau das Gesuchte (HTTPS bei 443,
  Host-Objekt bei exakter IP). Badge zeigt SPALTE ⊇ wert. 10 neue
  Unit-Tests, E2E contains=8 vs exact=6. Tests: 206 gruen.
- 2026-07-12 (Forts. 5): GUI-Runde visuell+funktional (#33/#34/#35):
  (a) Globale Freitextsuche versteht jetzt Contains-Semantik ueber alle
  fuenf Felder (Token "443" findet WEB/ALL/Portranges, IPs finden
  Subnetze/Gruppen, Interfaces ihre Zonen, Hosts ihre Adressgruppen) —
  IP-Sonderfall entfiel. (b) Rechtsklick-Kontextmenue auf Policy-Zeilen
  in der Werkbank wie FortiOS (PolicyContextMenu.tsx: Edit, Insert
  Empty Policy Above/Below, Clone = deaktivierte Kopie unterm Original,
  Enable/Disable, Move, Delete; Portal an Cursorposition, Escape/
  Aussenklick, Viewport-Klemmung, Hinweiszeile auf Desktop).
  (c) QuestHall-Polish: ParticleBurst.tsx (Konfetti in DonePanels von
  Verdict/Audit/Incident/Architect, gruene Funken im Debrief bei
  richtiger Antwort), XpGain.tsx (+N XP schwebt ein, Rang-Balken fuellt
  animiert, Rangaufstieg mit Feder-Pop) in allen vier DonePanels,
  sanfte Einblendungen fuer Spaltenfilter-Dropdown + Objekt-Tooltips,
  FortiOS-Zeilen-Hover auch ausserhalb des Auswahlmodus. Alles mit
  Reduced-Motion-Gate ueber die Spieleinstellung. Tests: 206 gruen,
  Playwright-Smokes: Kontextmenue (Menue/Clone/Escape) + Debrief-Lauf
  ch1-l01 in beiden Motion-Modi ohne Konsolenfehler.
- 2026-07-12 (Forts. 6): Gear-Spaltenkonfiguration (#36) wie "Configure
  Table" in FortiOS: Zahnrad neben den Policy-View-Buttons oeffnet eine
  Checkbox-Liste aller Spalten (Name fix), Grid-Template wird dynamisch
  aus den sichtbaren Spalten gebaut (Kopf, Zeilen, Implicit-Deny-Zeile),
  Auswahl persistiert in localStorage ('packetclaw-columns'), Reset
  stellt den Standard wieder her. Playwright-Smoke: NAT ausblenden,
  Reload-Persistenz, Reset. Tests: 206 gruen.
- 2026-07-13 (Forts. 7): Profil zeigt Endless-Bestwert (Runden+Punkte, 4. Kennzahl-Karte). Sandbox aufgeraeumt: statt zwei Policy-Tabellen
  (Standalone + Werkbank) gibt es wie auf der echten FortiGate nur noch
  EINE — RulesetWorkbench nimmt jetzt optionale highlights/chipRow
  entgegen, die Descent-Animation laeuft in der Werkbank-Tabelle, ein
  aktiver Policy Lookup gewinnt solange er gesetzt ist. Damit hat die
  Sandbox auch Lookup + Rechtsklick-Kontextmenue. Playwright-Smoke:
  genau 1 Tabelle, Lookup sichtbar, Fire ohne Konsolenfehler.
  Tests: 206 gruen.
