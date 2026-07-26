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
- 2026-07-13 (Forts. 8): Sequence Grouping View (FortiOS 7.6, #38):
  Policy hat jetzt ein optionales label-Feld (global-label, rein
  kosmetisch, Engine ignoriert es; makePolicy reicht es durch,
  Validator unveraendert). Dritte Policy-View in der Tabelle: Sequenz
  bleibt erhalten, bei jedem Label-Wechsel beginnt ein kollabierbarer
  Abschnitt — nicht zusammenhaengende gleiche Labels ergeben wie im
  Original mehrere Abschnitte; ohne Label steht "No label". Der
  Challenge-Generator vergibt Themen-Labels (Egress, DMZ Publishing,
  Lockdown), der Anker bleibt unlabeled. Playwright-Smoke: Challenge
  Small → Grouping-View zeigt alle Abschnitte, Zuklappen reduziert
  Zeilen. Tests: 206 gruen, 80 Level valide.
- 2026-07-13 (Forts. 9, Nutzerwunsch "Features + Ambience + Recherche"):
  (a) AmbientBackground: Canvas-Partikel driften dezent hinter der App
  (Spielfarben, Alpha 0.05-0.15, Dichte gedeckelt, Pause bei hidden
  Tab, Reduced Motion = aus, Inhalt in eigener z-Ebene). (b) Recherche
  FCP/NSE4-Blueprint 7.6 + Admin-Workflows → ROADMAP-Sektion mit 10
  Kandidaten nach Lernwert (SNAT/DNAT-Werkstatt, Routing-Modus,
  Debug-Flow, Session-Tabelle, Auth/FSSO, Cert-Trainer ohne Dumps...).
  (c) Sofort umgesetzt daraus: Hits-Spalte wie FortiOS (Incident zaehlt
  Log-Traffic gegen das aktuelle Regelwerk, Sandbox kumuliert gefeuerte
  Pakete + Reset bei Config-Aenderung, 0 Hits = warnfarben, Spalte nur
  wenn Zaehler vorhanden, Gear-abwaehlbar) und CLI-Ansicht 'show
  firewall policy' (FortiOS-Syntax, Defaults unterdrueckt wie im
  Original + Hinweistext, in Werkbank + Verdict). Playwright-Smokes:
  Ambient (Canvas da/weg je Motion, Interaktion ok), Hits (Incident-
  Header, Sandbox zaehlt 2 nach 2x Fire), CLI (Syntax-Fragmente, genau
  1 'set action accept' bei ch1-l01). Tests: 206 gruen.
- 2026-07-13 (Forts. 10, Nutzerwunsch "eigene Casual-Modi"): Neuer
  Modus BLITZ (#42): 60 Sekunden, EIN kleines 6-Regel-Regelwerk
  (Daily-Bausteine, seeded), Paket um Paket nur ACCEPT/DENY — kein
  Policy-Picken, kein Leben-System. 10 Punkte pro Treffer + 2 je
  Serienstufe (gedeckelt), nach jeder Antwort blitzt 700 ms die Regel
  auf, die wirklich gezogen hat (First-Match-Training nebenbei).
  Outcome-Rotation accept→deny→implicit gegen Vorhersagbarkeit.
  blitzBest im Save (Store+Migration+Export+Sync), XP = Score,
  Home-Karte, Profil-Kachel, Done-Panel mit Konfetti + XpGain,
  Timer-Balken, Mobile-Daumen-Buttons. Playwright: volle 60s-Runde
  durchgespielt (Done-Panel, Summary, XP, Restart). Tests: 206 gruen.
- 2026-07-13 (Forts. 11): Zweiter Casual-Modus MATCH-CHECK: 45
  Sekunden, pro Frage EINE Regel + EIN Paket — "matcht das?".
  Wahrheit: evaluate() ueber ein Ein-Regel-Netz; bei "kein Match"
  liefert der Engine-Trace das scheiternde Feld (policy-no-match →
  failedField), das im Feedback rot aufleuchtet (vorhandenes
  failed-Cell-Rendering). Fragen wechseln Match/Kein-Match ab,
  Pakete ohne Route werden verworfen. matchBest im Save
  (Store/Migration/Export/Sync), Home-Karte, gleiche Punktelogik wie
  Blitz. Playwright: 1-Regel-Tabelle, 10 Antworten ohne Fehler.
  Tests: 206 gruen.
- 2026-07-13 (Forts. 12, Nutzerwunsch "debug flow waere hilfreicher"):
  diagnose debug flow (#45): src/game/debugFlow.ts uebersetzt den
  Engine-Trace in authentische FortiOS-CLI-Zeilen (id=20085
  trace_id=... func=print_pkt_detail/init_ip_session_common/
  fw_pre_route_handler/vf_ip_route_input_common/fw_forward_handler
  msg="received a packet(...)" / "allocate a new session" / "VIP-x,
  DNAT a:p->b:q" / "find a route ... via wan1" / "Allowed by
  Policy-N: SNAT" / "Denied by forward policy check (policy 0)").
  Wie im Original erscheinen nicht-matchende Policies NICHT; Pseudo-
  Werte (Session-ID, Quellport, trace_id) deterministisch per FNV-1a
  aus dem Paket. DebugFlowView (collapsible, Allowed gruen/Denied
  rot) haengt im Debrief → wirkt in Kampagne, Daily, Endless und
  Sandbox. 4 neue Unit-Tests (SNAT, DNAT, Implicit, Determinismus),
  E2E prueft die Zeilen im ch1-l01-Debrief. Hit-Hunter (#43) und
  Daily-Blitz (#44) als Tasks notiert. Tests: 210 gruen.
- 2026-07-13 (Forts. 13, Nutzerwunsch "visueller Overhaul, gamifiziert,
  Effekte/Ambience, mehr Knall, wie ein neues cooles PC-Game"):
  Design-Fundament (tokens: aura-Violett + panelHi; tailwind: glow-
  Shadows, float/shimmer/pulse-glow; index.css: Mesh-BG mit radialen
  Akzent-Glows + Blueprint-Raster, Glass, Aurora-Verlaufstext, Karten-
  Sheen). Ambient-Layer (wirkt auf ALLEN Screens): 3 driftende Aurora-
  Glow-Blobs (mix-blend screen) + hellere additive Datenpartikel mit
  Glow/Flimmern + cursor-folgender Lichtschein (CursorGlow, nur feine
  Zeiger, Reduced-Motion-aus). HomeScreen neu (Hero+Aura+Float, Spieler-
  Statusleiste mit XP-Balken, Featured-Kampagne + Modus-Karten mit Icon-
  Badges/Glow), Header-Premium-Leiste (Rang-Pille+Progress), PacketCard
  mit Scan-Streifen, ACCEPT/DENY taktil (Glow/Lift), Netzdiagramm mit
  gluehender Firewall, Collapsible-Panels auf Glas. Boot-Sequenz beim
  Start (BootSplash: rotierendes Gate, Aurora-Titel, Scan-Balken,
  getippte Statuszeilen "secure channel established", 1x pro Session,
  ueberspringbar). Cinematische Screen-Uebergaenge (Zoom + Focus-Pull,
  Richtung nach Tiefe: eintauchen rein / auftauchen zurueck). Verstecktes
  Easter-Egg Hyperdrive (Konami-Code → Aurora dreht auf + Toast).
  Funktion unveraendert (FortiGUI). Tests: 210 gruen.
- 2026-07-13 (Forts. 14, Nutzerwunsch): Maus-Lichtschein (CursorGlow)
  komplett entfernt (wirkte hektisch). Performance geglaettet:
  Ambient-Partikel nutzen jetzt vorgerenderte Glow-Sprites (drawImage
  statt teurem per-Partikel-shadowBlur), Dichte gedeckelt (38) und
  DPR-Cap auf 1.5; der ganzseitige Grund-Gradient ist statisch (kein
  animiertes background-position mehr — Bewegung kommt nur noch von den
  Aurora-Blobs), Aurora-Blur 75→64px + translateZ(0)-Layer. Tests: 210.
- 2026-07-13 (Forts. 15, Nutzerwunsch "erst den Doktor"): Config-Doctor-
  Casual-Modus (#48). src/game/doctor.ts generiert seeded ein Regelwerk
  mit GENAU einem realen Praxisfehler (nat-missing = SNAT auf Egress-Regel
  vergessen; disabled = richtige Regel deaktiviert; order = breite Deny
  verschattet die Erlauben-Regel) + Symptom-Ticket. Test-Suite
  (matchesExpectation): Web muss raus (accept+SNAT), RDP muss geblockt
  bleiben (Kontrolle gegen faules „alles erlauben"). Der Spieler fixt in
  der vorhandenen RulesetWorkbench (Edit/Move/Enable/NAT/Delete +
  Kontextmenue + Policy Lookup + CLI) und startet die Diagnose; mehrere
  gueltige Loesungen (verschieben ODER loeschen ODER narrow). Score sinkt
  mit Eingriffen/Fehlversuchen, doctorSolved im Save (Store/Migration/
  Export). Home-Karte, Done-Panel mit Partikeln + Xp + Konzept-Tag
  (SNAT/Status/First Match). 5 Unit-Tests (jeder Bug startet rot, jeder
  Fix macht gruen, Kontrolle beisst), E2E-Smoke (Screen/Ticket/Diagnose).
  Tests: 215 gruen.
- 2026-07-13 (Forts. 16): FortiOS-7.6 „Any of / And any of"-Match-Logik
  (#47, GUI displays logic between policy objects). src/game/matchLogic.ts
  (pure): matchClauses() bildet die fuenf Match-Felder als geordnete
  OR-Gruppen ab (UND zwischen Feldern, ODER innerhalb). MatchLogic.tsx
  rendert sie mit „Any of"/„And any of"-Labels, „or"-Trenner innerhalb
  eines Feldes, „not set" fuer leere Felder, animiertem Staggered-Reveal
  (reduced-motion-Gate) und Erklaerzeile „All fields must match (AND).
  Within a field, any one entry is enough (OR)". Eingebettet im
  PolicyEditor unter den Feldern — deckt sich beim Bearbeiten LIVE mit
  den gewaehlten Objekten auf (wirkt in Architect/Audit/Incident/Sandbox/
  Doctor). 2 Unit-Tests + E2E-Smoke (Labels + Interaktion). Tests: 217.
- 2026-07-13 (Forts. 17, Nutzerwunsch): (a) Lesbarkeit — Aurora-Blobs und
  Partikel deutlich zurueckgenommen, Mesh-Ecken gedimmt, Glass-Panels
  opaker (0.72→0.94) + Rand/Schatten, Root-Schrift 16→17px (alles
  proportional groesser). (b) Config Doctor von 3 auf 6 Fehlertypen
  erweitert: neu wrong-service (falscher Dienst erlaubt → Web faellt
  durch), wrong-srcaddr (Quelle deckt LAN nicht ab), wrong-dstintf
  (Ziel-Interface passt nicht zur Route). Je Symptom/Diagnose/Konzept-
  i18n, 3 neue Unit-Tests (jetzt 8). Tests: 220 gruen.
- 2026-07-13 (Forts. 18, Nutzerkorrektur): Aurora-Blobs wieder prominent
  (die vorige Abschwaechung zurueckgenommen — waren gewuenscht); nur der
  cursor-folgende Glow war das Problem (bleibt entfernt). Panels bleiben
  opak (Lesbarkeit) + 17px. NEU gegen „nur Farben langweilig": lebendiges
  Netz-Geflecht auf dem Ambient-Canvas — nahe Partikel-Knoten werden mit
  dezenten Linien (aura, distanzabhaengige Deckkraft) verbunden, ergibt
  eine on-theme Netzwerk-Textur ohne Fremd-Assets. Nur EIN QuestHall-Bild
  liegt lokal (mascot-gatekeeper.png); weitere Bilder bräuchten das
  QuestHall-Repo im Session-Scope. Tests: 220 gruen.
- 2026-07-18 (Forts. 19): DNAT/VIP-Workshop „Publish a Server" (#51) —
  aus dem VIP/DNAT-Recherchelauf abgeleitet (FortiOS-Cookbook Virtual IPs
  / Port-Forwarding). src/game/dnat.ts (pure): generateDnatChallenge(seed)
  liefert ein Startnetz (interner Webserver, Routen, ABER ohne VIP/ohne
  Eingangs-Policy) + oeffentlichen Endpunkt; verifyDnat() prueft ueber die
  Engine, dass ein Paket wan1→extIp:443 ACCEPT+DNAT auf die Server-IP
  ergibt UND Port 22 geblockt bleibt (kein Ueberoeffnen). Bewusst als
  klassische 1:1-VIP (extPort=443=Serverport) statt Port-Translation
  gebaut — Kernlektion ist, die VIP als ZIEL im dstaddr zu referenzieren
  (nicht die interne IP; genau der `dstaddr all`/interne-IP-Klassiker, den
  die Engine korrekt ablehnt). DnatScreen.tsx: zweistufige Werkbank —
  ① VIP-Formular (extIP/Port, gemappte Host-IP per Select, mappedPort) →
  „VIP speichern", ② RulesetWorkbench fuer die Eingangs-Policy → „Aus dem
  Internet testen"; done-Panel mit ParticleBurst + XpGain, Score
  90−10·Fehlversuche (min 30). Store: dnatSolved + recordDnat + Screen
  'dnat'; Home-Kachel 🌐 (aura); i18n de/en komplett. 7 neue Unit-Tests
  (Start rot; VIP+Policy = gruen; VIP fehlt/Policy fehlt/falsches Mapping/
  interne-IP-statt-VIP/dstaddr-all = rot). Tests: 227 gruen, Lint 0 Fehler
  (1 Vorwarnung PolicyTable), Build ok, E2E-Smoke (Home→DNAT→Ticket/VIP/
  Test rendern, keine JS-Exceptions). OFFEN Ideen: Port-Forward-Variante
  (8443→443 mit passendem Service-Objekt), #43/#44/#49/#50.
- 2026-07-25 (Forts. 20, Nutzerfeedback „Hauptmenue etwas ueberladen"):
  Menue-Hierarchie statt flachem Raster (#52). (a) NEU src/game/campaign.ts
  (pure, 8 Unit-Tests): nextLevel() = erstes Level in Kapitel-/Index-
  Reihenfolge ohne Stern (= genau die Freischalt-Grenze, weil sequenziell
  entsperrt wird → kein Store-Import noetig, Level-Liste injizierbar);
  campaignProgress() liefert completed/total + Sterne (auf 3 geklemmt,
  verwaiste Save-IDs ignoriert). (b) Hauptmenue: primaere Zeile beantwortet
  „was mache ich jetzt?" — grosse Karte „Weiterspielen" springt DIREKT ins
  naechste offene Level (vorher immer nach Kapitel 1) mit Kapitel+Level-
  Titel und Kampagnen-Fortschrittsbalken (5/80); daneben Daily mit
  Heute-Status (✓ „Heute erledigt" gruen vs. „Heute offen" warn, aus
  dailyHistory[todayString()]) + Streak. Label wechselt
  „Kampagne starten"/„Weiterspielen"/„Kampagne abgeschlossen".
  (c) Die uebrigen 7 Modi in drei benannte Gruppen mit Hairline-Headern:
  SCHNELLE RUNDEN (Blitz, Match-Check) · WERKSTATT (Config Doctor, Server
  veroeffentlichen, Sandbox) · AUSDAUER (Endlos, Challenge); Karten
  kompakter (h-10-Icon, py-3). (d) „Alle Kapitel · N/240 ★" als sekundaerer
  Link fuer gezieltes Wiederholen. (e) Lesbarkeit: Untertitel line-clamp-2
  statt truncate; doctorSub/dnatSub gekuerzt, damit nichts mehr abschneidet.
  Tests: 235 gruen, Lint 0 Fehler, Build ok, E2E-Smoke fuer frischen
  Spieler (→ „Kampagne starten") UND Rueckkehrer (→ „Weiterspielen"),
  beide landen per Klick im Level; Screenshots Desktop 1280 + Mobil 430.
- 2026-07-25 (Forts. 21, autonom): NEUER MODUS „Change Request" (#53) —
  Regelwerk komplett nach schriftlichen Vorgaben bauen, der vom Nutzer
  gewuenschte Policy-Design-Kern. src/game/design.ts (pure, 8 Tests):
  fester CAPABILITIES-Katalog (7 Verkehrsbeziehungen im Uebungsnetz);
  generateDesignSpec(seed) zieht 3 davon als allow-Anforderungen, ALLES
  nicht Gezogene wird automatisch Guard (muss zu bleiben) — dadurch kann
  Least Privilege nie im Widerspruch zur Anforderung stehen, und die
  Guards sind keine versteckte Falle, weil das Ticket den Grundsatz
  („was nicht gefordert ist, bleibt geschlossen") ausdruecklich nennt.
  Segmentierung (Gast→LAN verboten) ist immer die letzte, ausformulierte
  deny-Anforderung. reviewDesign() prueft drei Ebenen wie ein echtes
  Review: Anforderungen erfuellt (inkl. natMissing separat gemeldet, damit
  „geht nicht" von „SNAT fehlt" unterscheidbar ist) · nicht mehr geoeffnet
  als gefordert (Guards, im UI mit Klartext welche Verbindung durchkommt) ·
  Handwerk (findOverbroadPolicies + findShadowedPolicies aus der Engine
  wiederverwendet). Alle 7 Capabilities sind paarweise trennbar (Service
  bzw. Quelle), jeder generierte Auftrag ist also loesbar — per Test ueber
  8 Seeds gegen eine Referenzloesung abgesichert. Didaktischer Kern:
  die Zone `inside` enthaelt port1 UND vlan20, eine faule
  „inside→all/ALL"-Sammelregel erfuellt die allow-Punkte und bricht die
  Segmentierung (eigener Test). DesignScreen.tsx: LIVE-Checkliste (jede
  Anforderung ✓/○ waehrend des Bauens, durchgestrichen wenn erfuellt,
  [SNAT]-Marker), Breach-Warnung, Submit erst aktiv wenn passed, Sterne
  ueber starsFor (3. Stern = review.clean). Store: designSolved +
  recordDesign + Screen 'design'; Home-Kachel 📋 in der WERKSTATT-Gruppe;
  i18n de/en. Flavour im Ticket-Register (trocken/buerokratisch, eigene
  Texte — QuestHall/Lyra-Playbook liegt nicht im Session-Scope).
  Perf: config UND review memoisiert (reviewDesign fuehrt die
  Overbroad-/Shadow-Analysen, darf nicht pro Render laufen).
  Tests: 243 gruen, Lint 0 Fehler, Build ok, E2E-Smoke (Ticket R1-R4,
  Segmentierung vorab gruen via Implicit Deny, Submit gesperrt).
  ROADMAP v1.3 ergaenzt: Routing → FQDN-Objekte → DHCP → HA (#54), mit
  Begruendung der Reihenfolge; Routing ist der billigste naechste Schritt,
  weil longestPrefixMatch/RouteEntry schon existieren.
- 2026-07-25 (Forts. 22, autonom): ROUTING-WERKSTATT (#55) — erster Schritt
  aus ROADMAP v1.3. Kniff: das Regelwerk ist korrekt und READ-ONLY, der
  Fehler liegt ausschliesslich in der Routing-Tabelle. Damit sitzt die
  FortiOS-Reihenfolge: Route zuerst, sie bestimmt das dstintf, erst danach
  Policy-Match — eine Policy fuer port2 greift nie, wenn die Route nach wan1
  schickt. src/game/routing.ts (pure, 10 Tests) mit drei Fallarten: missing
  (spezifische Route fehlt), wrong-iface (Route zeigt falsch), hijack (eine
  SPEZIFISCHERE /25 gewinnt per LPM gegen die korrekte /24).
  WICHTIGE KORREKTUR durch die Tests: mein erster Entwurf wollte „no route,
  drop" zeigen — das ist mit vorhandener Default-Route UNMOEGLICH, 0.0.0.0/0
  faengt alles ab. Der Verkehr geht dann nach wan1 und wird von der
  Egress-Regel sogar ERLAUBT: die Firewall sagt ACCEPT, der Server wird nie
  erreicht. Das ist der bessere, gemeinere Fall — deshalb prueft der Modus
  ueber eigenes RoutingCheck-Interface (statt TestPacket) auch das
  EGRESS-INTERFACE: accept ueber das falsche Interface ist ein Fehler.
  Eigener Test haelt das fest. UI: RoutingTable.tsx im FortiOS-Stil
  (Network → Static Routes: Ziel/Interface, anlegen/aendern/loeschen, CIDR-
  Validierung) plus Route-Lookup analog zum Policy Lookup (Ziel-IP → welche
  Route gewinnt, welches Egress-Interface, rot wenn es nicht das erwartete
  ist). RoutingScreen zeigt Symptom-Ticket, Live-Pruefliste im Format
  „soll accept @ port2 · ist accept @ wan1", die read-only PolicyTable und
  den echten debugFlow-Trace (wiederverwendet) — genau die drei Werkzeuge,
  mit denen man das auf einer echten Box diagnostiziert. Routen bewusst
  NICHT nach Praefix sortiert: macht sichtbar, dass beim Routing die
  Tabellenreihenfolge irrelevant ist (anders als bei Policies), nur
  Spezifitaet zaehlt. Store: routingSolved + recordRouting + Screen
  'routing'; Home-Kachel 🧭 in WERKSTATT; i18n de/en.
  QuestHall ist jetzt im Session-Scope (/workspace/questhall) — Flavour
  gegen LYRA-PLAYBOOK Abschnitt 0 geschrieben: trocken, spezifisch, jeder
  Text mit Landung, Katastrophe als Terminproblem, kein Pathos, keine
  Motivationssprache. Die bereits existierenden design.ts-Notizen habe ich
  gegengeprueft — sie treffen den Kanon schon, kein Retune noetig.
  Tests: 253 gruen, Lint 0 Fehler, Build ok, E2E-Smoke spielt einen Fall
  KOMPLETT durch (Ticket → Route-Lookup → Route reparieren → gruen →
  geloest), 0 JS-Fehler.
- 2026-07-25 (Forts. 23, autonom): FQDN-ADRESSOBJEKTE (#56) — zweiter
  Schritt aus ROADMAP v1.3, erste ENGINE-Erweiterung seit Phase 1.
  types.ts: AddressObject bekommt type 'fqdn' mit fqdn + resolvedIps.
  Kernsemantik: LEERE/FEHLENDE resolvedIps = noch nicht aufgeloest und
  matcht NICHTS (FortiOS-Verhalten). Das ist die stille Praxisfehlerquelle
  schlechthin, weil die Regel in der Tabelle voellig korrekt aussieht.
  resolve.ts: eigener case im addressObjectContainsIp-Switch.
  WICHTIG — der neue Typ hat einen exhaustiven Switch in analysis.ts
  aufgedeckt (addressObjectInterval). Entscheidung: FQDN liefert dort
  bewusst null = UNBEKANNTE MENGE, nicht ein Intervall aus resolvedIps.
  Begruendung: ein FQDN kann mehrere Adressen haben und der
  Aufloesungsstand aendert sich jederzeit; die Analysen arbeiten
  konservativ (bei Unentscheidbarkeit NICHT markieren), sonst wuerde die
  Shadow-Erkennung Regeln als tot melden, die morgen wieder greifen.
  Eigener Engine-Test haelt das fest.
  Anzeige: formatAddress zeigt „host → ip, ip" bzw. „host → —";
  resolveObjectInfo setzt bei unaufgeloestem FQDN noteKey
  'fqdnUnresolved' — das Objekt-Popover ist die EINZIGE Stelle, an der es
  dem Spieler auffallen kann, also erklaert es den Zustand dort im
  Klartext. Neues isUnresolvedFqdn() als Helfer. filterMatch: FQDN-Objekte
  sind zusaetzlich ueber den Hostnamen auffindbar. Validator: fqdn
  pflicht, resolvedIps DARF leer sein (gueltiger Zustand), enthaltene IPs
  werden geprueft.
  SPIELBAR gemacht ueber den Config Doctor statt eines neuen Modus (viel
  billiger, passt exakt): 7. Fehlertyp 'fqdn-unresolved'. In der
  Bibliothek liegen jetzt zwei FQDN-Objekte — VENDOR_PORTAL (aufgeloest
  auf 203.0.113.50) und PORTAL_NEW (unaufgeloest); der Fall setzt
  PORTAL_NEW ins dstaddr, der Fix ist der Wechsel auf das aufgeloeste
  Objekt. Tests: 258 gruen (Engine-Coverage-Gate haelt: resolve.ts 100 %,
  analysis.ts 95,31 % Branches), 80 Level valide, Lint 0 Fehler, Build ok.
  E2E-Smoke: FQDN-Fall wird gefunden, Regel zeigt PORTAL_NEW, Hover-
  Popover erklaert „matcht nichts, solange das DNS nicht antwortet".
  Lerneffekt-Notiz: Die Objekt-Chips reagieren auf HOVER (Lock per Klick);
  Playwright braucht hover() + einen :visible-Selektor, weil Mobil- und
  Desktop-Variante der Tabelle beide im DOM liegen.
- 2026-07-25 (Forts. 24, Nutzerwunsch „Anreiz/Dopamin fehlt"): GAMIFICATION-
  DURCHLAUF 1 (#57). Vorher recherchiert statt geraten — „Juice it or lose
  it" (Jonasson/Purho): Feedback muss PRO AKTION kommen, plus Duolingo-
  Analysen: Tagesziel, Combo-Boni, VARIABLE Belohnungen, gestufte
  Achievements. Diagnose: Belohnungen existierten (10 Raenge, 39
  Achievements, Partikel, XP-Flug) — waren aber unsichtbar bis zum
  Modus-Ende. Es fehlte die VORFREUDE.
  NEU src/game/unlocks.ts (pure, 10 Tests): Modi schalten sich ueber
  Kampagnenfortschritt frei, Schwellen = Kapitelgrenzen (Routing-Werkstatt
  bei Kapitel 4, wo die Kampagne Routing lehrt; DNAT bei Kapitel 7).
  ODER-Bedingung ueber XP, damit reine Casual-Spieler nicht feststecken —
  per Test abgesichert, ebenso dass Schwellen monoton steigen und mit der
  vollen Kampagne alles erreichbar ist. Gesperrte Modi werden NICHT
  versteckt, sondern zeigen „noch N Level": Verstecken verkleinert nur die
  Auswahl, sichtbare Bedingungen motivieren.
  NEU src/game/rewards.ts (pure, 11 Tests): Combo-Stufen mit echtem
  Multiplikator (x1,25 ab 3 richtigen bis x2 ab 12), Tagesziel (300 XP,
  klein und heute schaffbar), Truhen alle 5 Aufgaben mit VARIABLEM Inhalt
  (70/25/5 % common/rare/epic) — deterministisch aus der Truhen-Nummer,
  also kein Math.random und trotzdem Ueberraschung.
  Bewusst NICHT gebaut: Verlust-Druck, kuenstliche Wartezeiten, Ranglisten
  gegen Fremde. Das Spiel soll ziehen, weil man besser wird.
  Store zentral umgebaut: rewardPatch() haengt XP + Tagesziel + Truhen-
  Zaehler + Achievements an JEDE record*-Aktion (6 automatisch per Regex,
  Level- und Daily-Pfad haendisch) — damit fuettert wirklich jeder Modus
  den Loop und nicht nur die, an die man gerade denkt.
  UI: Belohnungs-Leiste auf Home (Tagesziel-Ring, wartende Truhe,
  naechste Freischaltung), RewardOverlay als EINZIGE blockierende Feier
  (Truhe + Freischaltung, Feder-Pop + Partikel), ComboMeter mit Stufen
  ersetzt das simple x N im Blitz, .pc-shake fuer Screenshake.
  Desktop-Schrift ab 1024px auf 18px (Nutzerwunsch).
  Tests: 282 gruen, Lint 0 Fehler, Build ok, E2E-Smoke in zwei
  Fortschritts-Staenden (frisch: Sperren+Countdown sichtbar; fortgeschritten:
  Depot bereit, Tagesziel-Rest, frische Freischaltung).
- 2026-07-25 (Forts. 25): GAMIFICATION-DURCHLAUF 2 — Juice im Kernloop.
  Der store-interne `combo` (Serie richtiger Antworten UEBER Level hinweg)
  wurde bisher nur fuer Scoring/Stats benutzt und war NIRGENDS sichtbar;
  jetzt haengt der ComboMeter in der Antwortphase des VerdictScreens. Das
  ist der Faden, der zur naechsten Aufgabe zieht, weil die Serie erst beim
  Weiterspielen waechst.
  Test-Infrastruktur: src/test/setup.ts stubbt jetzt window.matchMedia —
  ohne das stirbt JEDE Komponente mit useReducedMotionPref in jsdom, also
  praktisch jede animierte. Damit sind Komponententests ueberhaupt erst
  moeglich; erster davon deckt den ComboMeter ab (unsichtbar unter 3,
  Stufen ab 3/5/12).
  Merknotiz fuer Folge-Sessions: `combo` ist BEWUSST fluechtig (nicht im
  Save) — ein E2E-Test kann ihn nicht ueber localStorage setzen, man muss
  ihn erspielen oder die Komponente direkt testen.
  Tests: 285 gruen, Lint 0 Fehler, Build ok.
- 2026-07-25 (Forts. 26): GAMIFICATION-DURCHLAUF 3 — die 39 Achievements
  sichtbar gemacht. Achievement bekommt ein optionales progress()-Feld
  (have/need); per Skript fuer alle 21 zaehlbaren Praedikate ergaenzt
  (stats.X >= N, streak.best >= N, xp >= N). nearestAchievements() sortiert
  die offenen nach Fortschritt und liefert die naechstliegenden.
  NextBadges-Panel auf Home: „Kurz davor" mit Fortschrittsbalken und
  „noch N" — aus einem Ueberraschungs-Popup wird ein Ziel.
  6 neue Unit-Tests, 291 gruen. Merknotiz: Panel-Ueberschriften sind per
  CSS uppercase, E2E-Regexe muessen case-insensitive pruefen.
- 2026-07-25 (Forts. 27, Nutzerwunsch „konzentrier dich auf Desktop"):
  DESKTOP-HOME UMGEBAUT. Messung vorher: bei 1280px war das Hauptmenue
  3210px hoch — zweieinhalb Bildschirme Scrollen fuer ein Menue, weil der
  Hero allein ~450px als gestapelter Block frass und alles einspaltig
  untereinander lag. Jetzt: max-w-7xl statt 5xl, Hero auf Desktop als
  flache Zeile (Maskottchen 72px links, Titel+Tagline rechts), und ein
  zweispaltiges Grid `lg:grid-cols-[1fr_21rem]` — links das HANDELN
  (Weiterspielen, Daily, Modi-Gruppen), rechts als <aside> der STATUS
  (Rang, Tagesziel, Depot, Freischaltung, Kurz-davor-Abzeichen).
  Reihenfolge ueber lg:order: im DOM kommt die Sidebar zuerst, damit sie
  MOBIL oben steht (Status zuerst), auf Desktop rutscht sie per order-2
  nach rechts. Mobil bleibt damit unveraendert gestapelt.
  Modus-Raster in der schmaleren linken Spalte auf 2 Karten (erst ab 2xl
  drei), line-clamp auf Desktop 3 Zeilen, und die zwei laengsten
  Modus-Untertitel gekuerzt.
  Ergebnis gemessen: 1920x1080 = 1.00 Bildschirme (passt komplett),
  1440x900 = 1.07, Mobil 2.43 wie vorher; 0 abgeschnittene Textzeilen auf
  allen drei Breiten, kein horizontaler Overflow.
  Tests: 291 gruen, Lint 0 Fehler, Build ok.
- 2026-07-25 (Forts. 28, Nutzerfeedback „Belohnungen zu wenig abgegrenzt,
  alles gleiches Design, monoton"): VISUELLE MATERIALIEN (#59). Referenz war
  QuestHall selbst (/workspace/questhall): dessen RARITY_COLORS in
  app/constants.ts plus die Karten-Signatur aus ItemTooltip.tsx
  (border-top 3px in Rarity-Farbe, getoenter Hintergrund, mit der Seltenheit
  wachsender Glow). Unsere tokens.ts-Rarity-Farben sind jetzt 1:1 QuestHalls,
  damit beide Spiele dieselbe Bildsprache sprechen.
  Statt EINEM .glass fuer alles gibt es vier Materialien, und die Oberflaeche
  traegt die Bedeutung:
  .panel-hero farbige Oberkante in Markenfarbe → die EINE Hauptaktion
  .panel-action erhaben, Innen-Highlight, Hover-Lift → Navigation/Modi
  .panel-inset vertieft, Innenschatten, kein Hover → Status/Anzeigen
  .panel-reward Rarity-Rahmen + Glow → Belohnungen/Abzeichen
  Dazu .rarity-common/uncommon/rare/epic/legendary (setzen --rarity und
  --rarity-glow) und .medallion (runde Plakette mit Rarity-Ring statt
  Emoji-Zeile); legendaere Plaketten bekommen einen wandernden Schimmer
  (.medallion-shine, reduced-motion-gated).
  NextBadges nutzt jetzt die ECHTE Rarity jedes Achievements: Rahmen,
  Medaillon, Fortschrittsbalken und Rang-Label faerben sich danach. Gesperrte
  Modi sind vertieft (sehen unanfassbar aus), „Depot bereit" ist legendaer
  gerahmt, eine frische Freischaltung episch.
  Verifiziert per DOM-Zaehlung: 8x panel-action, 5x panel-inset, 5x
  panel-reward, 3 Medaillons, drei verschiedene Rarity-Stufen gleichzeitig
  sichtbar; 0 verbleibende .glass-Nutzungen im HomeScreen.
  Tests: 291 gruen, Lint 0 Fehler, Build ok.
- 2026-07-25 (Forts. 29): CHAPTERSCREEN ALS FORTSCHRITTSPFAD. Die
  Levelauswahl war ein flaches Raster gleich aussehender Knoepfe — man sah
  nicht, wo man steht. Jetzt tragen die Karten ihren Zustand ueber die neuen
  Materialien: 3 Sterne = panel-reward rarity-legendary (goldene Kante),
  teilweise geschafft = rarity-uncommon (gruen), das naechste offene Level =
  panel-hero mit „du bist hier"-Marke, gesperrt = panel-inset. Dazu eine
  Kapitel-Schiene, die pro Kapitel den Stand zeigt (✓ bei komplett, sonst
  n/10) statt nur der Nummer, und ein Kapitel-Kopf mit Fortschrittsbalken
  und Sternestand.
  STOLPERSTEIN dokumentiert: die „du bist hier"-Marke war zuerst als
  ueberstehendes Badge (absolute -top-2) gebaut und wurde ABGESCHNITTEN —
  Ursache ist `cv-auto` (content-visibility: auto) auf den Level-Karten,
  dessen Containment absolut positionierte Kinder clippt. Loesung: Marke
  inline in die Kopfzeile. Wer dort kuenftig etwas ueberstehen lassen will,
  muss cv-auto auf der Karte entfernen.
  Tests: 291 gruen, Lint 0 Fehler, Build ok.
- 2026-07-25 (Forts. 30, Retention-Auftrag): TAGESAUFTRAEGE (#60). Recherche
  zuerst: Tagesauftraege sind laut Analysen der staerkste Einzelhebel fuers
  taegliche Spielen (+40 % Engagement), muessen aber in EINER Sitzung
  schaffbar sein; 7-Tage-Streak mit steigender Belohnung bringt ~25 % mehr
  taeglich Aktive. Wir hatten nur EINEN Daily Run — keine Tages-To-do-Liste.
  NEU src/game/dailyQuests.ts (pure, 16 Tests): drei Auftraege pro Tag,
  deterministisch aus dem Datum. Drei Entwurfsentscheidungen, alle getestet:
  (1) NUR aus freigeschalteten Modi ziehen — ein „reparier ein Regelwerk"
  bei gesperrtem Doctor waere eine Sackgasse; (2) einmal gezogen, dann im
  Save STABIL, sonst wechseln die Auftraege mitten am Tag, wenn ein Modus
  aufgeht, und der Fortschritt ist weg; (3) nur KUMULATIVE Zaehler im Pool,
  weil Fortschritt = heutiger Stand minus Tagesbeginn-Snapshot — Maxima wie
  „bester Combo" lassen sich so nicht messen und sind bewusst draussen.
  Dazu keine zwei Auftraege auf dieselbe Metrik, Ziele klein (1-3 Einheiten),
  Bonus wenn alle drei erfuellt sind, und ein Wochenmeilenstein
  (WEEK_REWARDS 60→500 ueber sieben Tage, Zyklus danach neu).
  Store: questDay {date, ids, snapshot, claimed} + ensureQuestDay() (rollt
  den Tag um und setzt die Nulllinie) + claimQuest(); readQuestCounters()
  liest die relevanten Zaehler aus dem Zustand.
  UI: DailyQuests-Panel in der Sidebar im Belohnungs-Material — erfuellte
  Auftraege stehen legendaer gerahmt mit Abhol-Knopf da (das Einloesen ist
  Teil der Belohnung, deshalb nichts automatisch verbuchen), offene vertieft
  mit Balken. Wochenmeilenstein als sieben Punkte, damit man den siebten Tag
  SIEHT. Texte im Lyra-Kanon.
  Tests: 307 gruen, Lint 0 Fehler, Build ok, E2E: 2/3 erfuellt → zwei
  Abhol-Knoepfe, Abholen oeffnet die Belohnung und der Knopf verschwindet.
- 2026-07-25 (Forts. 31): ZWEI FEHLER BEIM HINTERFRAGEN GEFUNDEN + HUMOR-PASS.
  (a) COMBO-WIDERSPRUCH, selbst verursacht: es gab ZWEI Combo-Systeme —
  scoring.ts rechnet die echten Punkte (x1,0 +0,1 je Treffer, Cap x3,0 bei
  Serie 21; darauf beziehen sich auch die Abzeichen combo-x2/x3 korrekt),
  waehrend mein rewards.comboTier eigene Stufenwerte x1,25/x1,5/x2,0 erfand.
  Die Anzeige log also ueber die vergebene Belohnung — genau das, was
  CLAUDE.md mit „die Engine ist die Wahrheit, nie handgeschrieben
  duplizieren" verbietet. comboTier delegiert jetzt an comboMultiplier und
  liefert nur noch die STUFEN-BENENNUNG (warm/hot/blaze/perfect ab 3/5/8/12).
  Der wichtigste neue Test ist der Vertrag: comboTier(s).multiplier ===
  comboMultiplier(s) fuer s = 0..30 — damit koennen die beiden nicht wieder
  auseinanderdriften.
  (b) FLOAT-ANZEIGE: 1 + 6*0.1 ist in JS 1.5999999999999999, das waere so im
  ComboMeter gestanden. Anzeige jetzt toFixed(1), Wert bleibt exakt.
  (c) HUMOR-PASS: alle 27 Abzeichen-Beschreibungen auf den Lyra-Kanon
  umgeschrieben. Vorher waren es nackte Bedingungen („50x Implicit Deny
  korrekt erkannt.") — genau das Negativbeispiel aus Playbook-Abschnitt 0.
  Jetzt bleibt die Bedingung lesbar, aber jeder Text landet („Die Regel, die
  es nicht gibt, kennst du inzwischen besser als die, die es gibt."). Das ist
  jetzt sichtbar, weil das „Kurz davor"-Panel die Beschreibungen zeigt.
  NEU als Gate: achievementText.test.ts prueft, dass keine nackte
  Bedingungszeile zurueckkommt (Laenge ODER mehr als ein Satz), dass DE und
  EN wirklich uebersetzt sind, und verbietet Motivationsposter-Floskeln.
  Tests: 317 gruen, Lint 0 Fehler, Build ok.
- 2026-07-25 (Forts. 32): KONZEPT-MASTERY (#49, Teil 1 von 2). Der Posten
  verbindet Lernen und Retention: ein Lernspiel, das nicht weiss, wo man
  schwach ist, kann nur zufaellig ueben — und „an DIESEM Konzept hakt es
  noch" ist der ehrlichste Grund, morgen wiederzukommen.
  NEU src/game/mastery.ts (pure, 13 Tests). Kernstueck ist
  conceptOfVerdict(): das Konzept wird AUS DEM ENGINE-TRACE abgeleitet, nicht
  handgepflegt (CLAUDE.md: die Engine ist die Wahrheit). Pruefreihenfolge nach
  LERNRELEVANZ, nicht nach Trace-Reihenfolge: no-route → routing; DNAT
  beteiligt → vip (die schwerste Lektion schlaegt alles); kein Treffer →
  implicitDeny; sonst der NAHE TREFFER, also das Feld, an dem die Regel
  direkt ueber der Treffer-Regel gescheitert ist — genau dort verrechnet man
  sich; gar keine Beinah-Regel → firstMatch.
  weakestConcepts() filtert bewusst Konzepte mit weniger als MIN_ATTEMPTS
  Versuchen heraus: ein einziger Fehler ist ein Ausrutscher, keine Schwaeche,
  und ihn zu melden waere nur Rauschen (eigener Test).
  Store: mastery-Map + recordConcept(); VerdictScreen bucht jede Antwort auf
  ihr Konzept. UI: MasteryPanel in der Sidebar zeigt die drei schwaechsten
  Konzepte mit Quote und Balken (Farbe als Wegweiser, nicht als Strafe) plus
  Hinweis auf noch ungeprueften Stoff; ohne Datenbasis behauptet es nichts.
  OFFEN (Teil 2): Review-Modus, der Aufgaben gezielt aus den schwachen
  Konzepten generiert — die Datenbasis dafuer steht jetzt.
  Tests: 330 gruen, Lint 0 Fehler, Build ok, E2E: schwaechstes Konzept steht
  oben (Services 25 %), Freeze-Token und Serie-Bezug sichtbar.
- 2026-07-25 (Forts. 33): REVIEW-MODUS (#49, Teil 2 — damit ist der Posten
  abgeschlossen). Mastery war eine Diagnose ohne Behandlung; jetzt schliesst
  sich der Kreis: Mastery zeigt die Luecke, Review fuellt sie, Mastery misst
  nach.
  NEU src/game/review.ts (pure, 9 Tests). Der harte Teil ist nicht die
  Aufgabe, sondern die GARANTIE: eine Uebung zum Konzept „Service" muss auch
  wirklich am Service haengen, sonst uebt der Spieler etwas anderes als
  angekuendigt UND die Mastery-Messung wird Unsinn. Deshalb baut jeder
  Generator sein Netz so, dass conceptOfVerdict() genau sein Zielkonzept
  liefert — und der zentrale Test prueft das fuer ALLE 9 Konzepte ueber
  mehrere Seeds durch. Bei den Feld-Konzepten ist der Trick eine Beinah-Regel
  davor, die nur an diesem EINEN Feld scheitert.
  Ein Test hat dabei eine echte Schwaeche aufgedeckt: fuenf Aufgaben einer
  Sitzung waren identisch. Jetzt variiert die Quell-IP — aber ausschliesslich
  innerhalb von LAN_NET, damit die Ziel-Regel weiter trifft und das Konzept
  nicht kippt; ein eigener Test sichert genau das ab (8 Seeds x 9 Konzepte).
  reviewPlan(): schwache Konzepte zuerst, sonst ungeprueftes, letzte
  Rueckfallebene alle — es gibt nie eine leere Sitzung.
  ReviewScreen: fuenf kurze ACCEPT/DENY-Aufgaben, pro Aufgabe steht das
  trainierte Konzept im Kopf, danach die Engine-Wahrheit plus eine
  Konzept-Lektion und der debug-flow-Trace. Die Antwort wird auf genau das
  Konzept gebucht, das die Aufgabe trainiert. Freigeschaltet ab 14 Leveln —
  vorher gibt es keine belastbare Datenbasis. Store: reviewsDone +
  recordReview; Home-Kachel 🧠 vorne in der WERKSTATT.
  Tests: 339 gruen, Lint 0 Fehler, Build ok, E2E: volle Sitzung mit fuenf
  Runden durchgespielt, Schwerpunkt zeigt die schwachen Konzepte.
- 2026-07-26 (Forts. 34): REVIEW ANGEBUNDEN — der Modus war gebaut, aber nicht
  verdrahtet. Zwei Luecken geschlossen:
  (a) Mastery war eine Diagnose ohne Handlungsmoeglichkeit — also nur ein
  Vorwurf. Das MasteryPanel hat jetzt einen Knopf, der direkt in die passende
  Uebung fuehrt („Genau das ueben" bei Schwaechen, sonst „Review starten").
  Der Knopf erscheint nur, wenn Review offen ist; sonst waere er eine
  Sackgasse.
  (b) Tagesauftrag `review1` (+220 XP) — der lernwirksamste Auftrag im Pool,
  weil er gezielt an den eigenen Schwaechen uebt. QuestCounters kennt dafuer
  reviewsDone.
  HAERTUNG: Der Smoke-Test lief mit einem falsch geformten Save und hat
  „9 von NaN richtig" ins GUI geschrieben. Saves wandern ueber das Backend und
  ueber Versionsgrenzen, also filtert conceptMastery() die Zaehler jetzt an der
  einen Stelle, durch die alle Leser gehen (count(): nur endliche positive
  Zahlen, sonst 0). Die intakte Haelfte eines kaputten Eintrags bleibt
  erhalten, statt alles zu verwerfen. Eigener Test mit vier Sorten Muell.
  Tests: 340 gruen, Lint 0 Fehler, Build ok, E2E: Mastery-Knopf sichtbar,
  fuehrt in Review, volle Sitzung durchgespielt, 0 Konsolenfehler.
- 2026-07-26 (Forts. 35): MASTERY-DELTA — der eigentliche Lohn einer
  Uebungssitzung. Der Abschlussschirm sagte „4 von 5 richtig" und +XP; beides
  verpufft. Was bleibt, ist eine Zahl, die sich bewegt: „Adressobjekte
  33 % → 50 %".
  NEU masteryDeltas(before, after) in src/game/mastery.ts + Komponente
  MasteryDeltaList. Der ReviewScreen friert den Stand beim START ein — sonst
  wandert der Vergleichspunkt mit jeder Antwort mit und das Delta waere am
  Ende immer null. Konzepte ohne neue Versuche kommen nicht vor (eine
  +-0-Zeile ist Fuellmaterial).
  Zwei Entscheidungen, die bewusst so sind:
  - RUECKSCHRITTE WERDEN NICHT VERSCHWIEGEN. Wer vorher richtig geraten hat,
    sieht die Zahl fallen. Eine Messung, die nur gute Nachrichten zeigt, ist
    keine Messung. Im Smoke sichtbar: Routing 80 % → 67 %, rot.
  - BEI GLEICHEM BETRAG steht der Fortschritt oben — der Abschnitt ist die
    Belohnung der Sitzung, nicht ihr Zeugnis. Ohne diese Regel entschiede die
    Reihenfolge von CONCEPTS, also der Zufall. Eigener Test.
    Optik: zwei Balken uebereinander, der alte Stand bleibt als Schatten stehen,
    damit der Zuwachs raeumlich sichtbar ist; gestaffelter Einlauf (60 ms),
    groesste Bewegung zuerst. Nebenbei: der Knopf hiess „Back to level select",
    was im Review falsch ist — jetzt review.toMenu.
    Tests: 347 gruen, Lint 0 Fehler, Build ok, E2E: Sitzung durchgespielt, drei
    Delta-Zeilen inkl. ehrlichem Rueckschritt, 0 Konsolenfehler.
- 2026-07-26 (Forts. 36): FELDNOTIZEN — die Truhen haben jetzt einen Inhalt.
  DAS PROBLEM: Eine Truhe gab XP. XP gibt es aber fuer alles, also war die
  Truhe nur eine lautere Version von dem, was ohnehin passiert. Fuer eine
  variable Belohnung muss der INHALT variieren, nicht der Betrag.
  NEU src/game/fieldNotes.ts (pure, 14 Tests) + FieldNoteCard + NotesScreen
  („Archiv", eigener Screen, Eintrag in der Belohnungs-Leiste).
  24 Sammelkarten, jede mit GENAU EINER echten FortiOS-Wahrheit: Policy 0,
  Route-vor-Policy, VIP-oder-nichts, Pre-DNAT-Port, Verschattung, die
  Session-Tabelle, Intra-Zone-Deny, Trefferzahl null, ID-ist-keine-Position,
  Service ALL, FQDN, any/all/ALL usw. Damit zieht das Feature in beide
  Richtungen: Sammlung (Retention) UND Nachschlagewerk (Oberste Direktive).
  Die Karten sind in der Lyra-Stimme geschrieben (Skulduggery-trocken, jede
  mit Landung, keine Motivationssprache) — Text in beiden i18n-Dateien, ein
  Test prueft fuer alle 24 Karten Titel + Text in de UND en samt Mindestlaenge,
  damit eine leere Belohnung nicht erst im GUI auffaellt.
  Entscheidungen: KEINE DUBLETTEN (gezogen wird nur aus dem offenen Rest — eine
  Truhe, die etwas ausspuckt, das man schon hat, ist eine Enttaeuschung mit
  Animation); vollstaendige Sammlung faellt auf den XP-Wurf zurueck statt leer
  zu sein; Seltenheit folgt der LERNRELEVANZ (die beiden „Grundgesetze" sind
  Policy 0 und Route-vor-Policy); Gewichte so, dass legendary etwas bedeutet,
  aber erreichbar bleibt (Test prueft beides).
  VORFREUDE-TAKT im Truhen-Overlay: 550 ms geschlossene, zitternde Kiste,
  dann Feder-Pop mit der Karte. Ohne den Takt kommentiert die Animation ein
  Ergebnis, das man schon gelesen hat. Zwei Fehler dabei gefunden und behoben:
  der Bestaetigungsknopf und der Backdrop-Klick waren waehrend des Taktes aktiv
  — ein ungeduldiger Klick hat also genau die Karte verworfen, die man nie
  gesehen hat (gebucht war sie zu dem Zeitpunkt schon). Jetzt ueberspringt ein
  Klick die Vorfreude, statt zu schliessen, und der Knopf erscheint erst mit
  der Belohnung.
  Save: fieldNotes: string[], migrateSave sortiert unbekannte IDs aus (der
  Katalog aendert sich, der Save nicht).
  Tests: 361 gruen, Lint 0 Fehler, Build ok, E2E: Truhe geoeffnet (geschlossener
  Takt + Karte „The outside port", epic), Archiv 4/24 mit Stufen-Zaehlern und
  Missing-Filter, 0 Konsolenfehler.
- 2026-07-26 (Forts. 37): NOTIZEN ANS SCHEITERN GEKOPPELT (#62). notesForConcept
  gab es schon, benutzt hat es niemand — eine Sammlung, deren einziger Zweck
  Vollstaendigkeit ist, ist Deko.
  NEU ConceptNote: nach einer FALSCHEN Antwort im Review erscheint die
  Archiv-Karte zum gescheiterten Konzept, direkt unter der Engine-Wahrheit.
  Nach einer richtigen Antwort nicht — dort waere es Wiederholung, und der
  Moment nach dem Fehler ist der einzige, in dem eine Erklaerung wirklich
  gelesen wird. Besitzt man mehrere Karten zum Konzept, kommt die mit dem
  hoechsten Rang (die traegt die grundlegendste Aussage).
  Fehlt die Karte noch, wird das GESAGT statt verschwiegen („zu diesem Konzept
  gibt es N Feldnotizen — noch in einer Truhe"). Ein Hinweis auf etwas zu
  Holendes ist ein Grund weiterzuspielen; eine leere Stelle ist keiner.
  Ausserdem: die Schwachstellen-Liste zeigt pro Konzept 📓 x/y — wie viel vom
  Nachschlagewerk dazu schon da ist.
  Tests: 361 gruen, Lint 0 Fehler, Build ok, E2E: absichtlich falsch geantwortet,
  Karte „The object decides" erscheint beim Adress-Konzept, 0 Konsolenfehler.
- 2026-07-26 (Forts. 38): EINSATZ SICHTBAR MACHEN. Das Tagesziel kannte die
  Serie schon im Text, aber sein VISUELLES Gewicht war immer gleich: eine
  Zwoelf-Tage-Serie mit offenem Ziel sah genauso leise aus wie Tag null. Der
  staerkste Hebel fuers taegliche Wiederkommen ist aber nicht die Belohnung,
  sondern das, was man verlieren kann.
  NEU rewards.stakeLevel(streak, goalDone, freezeTokens) → calm | notice |
  urgent (pure, 4 Tests). Schwelle sieben Tage: ab einer ganzen Woche fuehlt
  sich eine Serie wie Besitz an, darunter ist noch nichts aufgebaut, das man
  schuetzen muesste — ein Alarm am zweiten Tag waere nur Laerm. Ein
  Freeze-Token federt den Tag ab und nimmt die Dringlichkeit heraus.
  urgent: panel-reward rarity-legendary + 🔥 + oranger Ring + neues
  animate-pulse-soft (3,4 s, nur im Schein, nicht in der Groesse, per
  prefers-reduced-motion abschaltbar; es gibt genau EINE Stelle im Spiel, die
  das benutzt, sonst waere es Rauschen).
  WAS NICHT ESKALIERT, IST DIE SPRACHE. Kein Countdown, keine Drohung:
  „12 Tage. Heute ist noch keiner davon." Das ist eine Feststellung und trifft
  haerter als eine Warnung — und bleibt bei der Tonlage (Playbook: niemals
  motivieren, feststellen).
  Tests: 365 gruen, Lint 0 Fehler, Build ok, E2E: drei Saves gegenuebergestellt
  (12d ohne Token = laut, 12d mit Token = leise, 2d = leise), 0 Konsolenfehler.
- 2026-07-26 (Forts. 39): ECHTER FEHLER GEFUNDEN — der Wochenmeilenstein wurde
  ANGEZEIGT, aber NIE AUSGEZAHLT. „Tag 5 von sieben +240" stand jeden Tag da,
  und die 240 XP kamen nie an. Ein Belohnungssystem, das ein Versprechen
  taeglich macht und taeglich bricht, ist schlimmer als keines.
  (a) AUSZAHLUNG in rewardPatch(): bezahlt wird genau dann, wenn die Serie
  WIRKLICH weiterzaehlt (streak !== state.streak). advanceStreak ist fuer
  denselben Tag idempotent, derselbe Tag kann also nicht doppelt kassieren —
  auch nicht nach zehn weiteren Aufgaben. Der Bonus laeuft bewusst NICHT in die
  Tages-XP des Ziels: der Ring soll 300/300 zeigen und nicht 540/300, er misst
  das Erspielte, nicht die Folge davon.
  (b) ZWEITER FEHLER, beim Nachrechnen aufgefallen: die Anzeige war um einen Tag
  versetzt. streak.current ist der letzte GESICHERTE Tag; bei Serie 4 und
  offenem Tagesziel stand „Tag 4, +180" da, waehrend der heutige Abschluss Tag 5
  mit +240 auszahlt. NEU weekMilestoneFor(streak, goalDone) — solange das Ziel
  offen ist, nennt die Anzeige den Tag, den HEUTE bringt. Ein Test haelt fest,
  dass Anzeige und Auszahlung dieselbe Zahl liefern.
  Die Zeile zeigt jetzt ausserdem „✓ +240" statt nur „+240", sobald kassiert —
  die nackte Zahl war zweideutig.
  Tests: 375 gruen (10 neue), Lint 0 Fehler, Build ok, E2E: Serie 4 + offenes
  Ziel zeigt Tag 5 und +240, 0 Konsolenfehler.
- 2026-07-26 (Forts. 40): DREI KOPIEN DERSELBEN LOGIK, ALLE DREI FALSCH.
  Nach dem Wochenbonus-Fund habe ich die uebrigen Belohnungs-Versprechen
  durchgeprueft (Achievements: nur Abzeichen, kein XP-Versprechen — sauber;
  Auftrags-Bonus: zahlt, erreichbar). Dabei fiel auf, dass drei record*-Aktionen
  rewardPatch NICHT benutzten, sondern eine eigene Kopie hatten:
  - ENDLOS fuetterte den Loop GAR NICHT: kein Tagesziel, kein Truhen-Zaehler,
    keine Serie. Wer nur Endlos spielte, kam auf keinen Streak-Tag und auf keine
    Truhe. Das war der einzige der drei mit direkt spuerbarem Schaden.
  - KAMPAGNE hatte die Streak-Logik dupliziert und dadurch den neuen
    Wochenbonus nicht mitbekommen.
  - DAILY RUN rief advanceStreak direkt und lief damit an der dokumentierten
    Regel vorbei — und bekam ebenfalls keinen Wochenbonus.
    Genau davor warnt der Kommentar ueber rewardPatch seit Anfang an („damit
    wirklich JEDER Modus den Loop fuettert und nicht nur die, an die man gerade
    gedacht hat"). Die Duplikate WAREN der Fehler, deshalb ist die Konsolidierung
    die Korrektur und nicht bloss Aufraeumen: es gibt jetzt genau EINE Stelle, die
    die Serie weiterzaehlt und den Wochenmeilenstein auszahlt.
    rewardPatch nimmt dafuer Optionen: `stars`/`stats` (damit Kapitel- und
    Daily-Abzeichen im richtigen Kontext greifen) und `secureDay` — der EINE
    bewusste Sonderfall: der Daily Run sichert den Tag auch, wenn die zehn Pakete
    das Tagesziel knapp nicht reissen. Das Ding heisst „Daily".
    Tests: 381 gruen (6 neue, je einer pro Fehlverhalten), Lint 0 Fehler, Build ok,
    E2E: Kampagnenlevel 1 durchgespielt → xp 100, tasksSolved 1, dailyXp gesetzt,
    Serie bleibt korrekt bei 0 (100 < 300), 0 Konsolenfehler.
    (Nebenbei in eigener Sache: der beforeEach eines neuen Tests setzte stats
    nicht zurueck, wodurch dailiesPerfect von Test zu Test wanderte — gefixt.)
- 2026-07-26 (Forts. 41): LOCAL-IN IN DER ENGINE (#50, Teil 1 — Engine, ohne UI).
  Bisher stand in docs/ENGINE.md „Local-in-Traffic nicht modelliert —
  ausserhalb des Spielumfangs". Das war die falsche Entscheidung: sich aus einer
  FortiGate auszusperren ist die teuerste Erfahrung, die man an dem Geraet machen
  kann, und sie hat mit der Policy-Tabelle NICHTS zu tun.
  NEU src/engine/localIn.ts (pure, 27 Tests, 100 % Branch-Coverage; Engine
  gesamt 98,1 % — Gate ist 95 %). evaluate() erkennt an Iface.ip, dass ein Paket
  an die Firewall selbst geht, und delegiert. Der Forward-Pfad bleibt dabei
  BIT-IDENTISCH: ohne Interface-IPs kann kein Level in den neuen Zweig laufen,
  alle 70 bestehenden Level verhalten sich unveraendert.
  Das Verdict traegt dstintf: '' und matchedPolicyId: 0 — beides hat fuer diesen
  Verkehr keine Bedeutung, und ein Ziel-Interface zu behaupten waere eine Luege
  ueber seine Natur.
  DREI UNABHAENGIGE TORE, alle drei muessen zustimmen:
  1. allowaccess am Interface — der haeufigste Grund fuer „ich komme nicht auf
     die GUI", und er steht in KEINER Policy-Tabelle.
  2. Local-In-Policy — First Match, Felder wie in der Forward-Policy, aber ohne
     dstintf.
  3. trusthost des Admin-Kontos — nur fuer Dienste mit Login (https/ssh/http);
     ein passendes Konto genuegt; leeres trusthost heisst „von ueberall"
     (Auslieferungszustand UND Audit-Befund).
     DIE ASYMMETRIE, um die es geht: Local-In endet mit implizitem ACCEPT, nicht
     mit Implicit Deny. Eine leere Local-In-Tabelle sperrt nichts aus. Wer die
     beiden Tabellen verwechselt, sucht den Fehler in beide Richtungen falsch.
     Eigener Test dafuer, plus einer fuer den Aussperr-Klassiker: Dienst offen,
     keine Regel im Weg, und trotzdem kein Login, weil trusthost auf ein anderes
     Netz zeigt.
     Nebenbei gefunden: makeConfig() liess die neuen optionalen Felder fallen
     (sieben Tests schlugen deswegen fehl). localInPolicies/admins werden jetzt
     nur mitgeschrieben, wenn ein Level sie nutzt — „fehlt" und „ist leer" sollen
     in der Anzeige unterscheidbar bleiben.
     docs/ENGINE.md: eigener Abschnitt, und die veraltete Zeile aus der
     Vereinfachungs-Tabelle ersetzt.
     OFFEN (Teil 2): Workshop-Modus „Management-Zugriff" — Zugriff fuers Buero
     freischalten, ohne sich selbst auszusperren.
     Tests: 408 gruen, Lint 0 Fehler, Build ok.
