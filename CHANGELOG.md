# Changelog

## v1.0.0 — 2026-07-11

Erste Vollversion. AetherGate (Arbeitstitel PacketClaw) ist ein browserbasiertes
Lernspiel für Firewall-Policy-Logik — unabhängig, herstellerneutral, inspiriert
von FortiOS-Konzepten.

### Engine

- Deterministische Policy-Engine (pure TypeScript, keine UI-Abhängigkeiten):
  First Match top-down, Implicit Deny (Policy 0), Feld-Matching mit ODER/UND-Semantik,
  Zonen, rekursive zyklensichere Adress-/Service-Gruppen, inklusive CIDR-Grenzen,
  Longest-Prefix-Routing bestimmt dstintf, work-hours-Schedules (deterministische
  Wanduhrzeit), SNAT-Flag, VIP/DNAT vor Routing und Policy-Match
- DNAT-Didaktik: `dstaddr "all"` matcht keinen DNAT-Traffic; Policies matchen über
  das VIP-Objekt, nicht die interne IP
- Analysefunktionen: findShadowedPolicies (konservative Mengenlogik),
  findRedundantPolicies (verhaltensgleich gegen Testsuite), findOverbroadPolicies
- Suite-Erwartungen inkl. `expectNat` („vergessenes NAT")
- 159 Tests, >96 % Branch-Coverage auf der Engine, fast-check-Property-Tests,
  seedbarer mulberry32-RNG (kein Math.random)

### Spiel

- 4 Modi: Verdict (Packet Descent + Debrief aus dem Engine-Trace, Timer ab
  Kapitel 3), Architect, Audit (find-shadowed / fix-order / harden-any /
  remove-redundant), Incident (Engine-generierter Forward-Traffic-Log)
- Kampagne: 80 CI-validierte Level über 8 Kapitel inkl. Boss-Level
- Daily Run (Datum als Seed, Share-Text via Clipboard), Sandbox mit JSON-Export/Import
- Gamification: XP + Combo (Cap ×3,0), Sterne (gelöst / fehlerfrei / Modus-Kriterium),
  10 Ränge, 26 Achievements mit Rarity, Daily-Streak mit Freeze-Token
- Interaktives Onboarding (3 Minuten, skippbar), Profil, Settings
  (Sound, Reduced Motion, Scanlines, Sprache, Save-Export/Import, Reset)
- Web-Audio-Sounds (selbst generiert), Touch-first (390 px einhändig),
  A11y (Tastatur, Fokus, AA), i18n de/en
- PWA: installierbar, vollständig offline, kein Tracking, kein Laufzeit-Traffic

### Betrieb

- Multi-Stage-Dockerfile (Tests + Level-Validierung im Build), non-root nginx auf 8080
- SPA-nginx-Config mit gzip, immutable Asset-Caching, Security-Headern und CSP
  ohne externe Quellen
- compose.yml (localhost-Bindung hinter Host-Reverse-Proxy, Healthcheck,
  Traefik-Beispiel), CI mit ghcr-Push bei `v*`-Tags
