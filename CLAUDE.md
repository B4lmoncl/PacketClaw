# AetherGate — CLAUDE.md

## ⭐ OBERSTE DIREKTIVE (Prio 1 — Mission Statement, Nutzerwunsch 2026-07-11)

**AetherGate soll sich so nah wie möglich 1:1 wie ein echtes FortiGate-GUI
bedienen — mit allem, was dazugehört — und darüber werden Aufgaben spielerisch
gelöst. Zweck: Der Spieler lernt, mit echten FortiGates zu arbeiten.**

Konsequenzen für jede Design-Entscheidung:

1. **GUI-Nähe schlägt eigene Design-Ideen.** Policy-Tabelle, Adress-/Service-
   Objekte, Objekt-Hover/-Inspektion, Spaltenfilter, Forward-Traffic-Log,
   Routing, VIP/DNAT, Zonen — Bedienkonzepte, Begriffe und Abläufe orientieren
   sich am FortiGate-Original (FortiOS). Wer AetherGate kann, soll sich auf
   einer echten FortiGate sofort zurechtfinden.
2. **Fachliche Korrektheit ist nicht verhandelbar.** Die Engine
   (`src/engine/`) ist die einzige Quelle der Wahrheit; Verhalten folgt
   FortiOS-Semantik (First Match, Implicit Deny, VIP vor Routing/Policy,
   `dstaddr all` matcht kein DNAT usw. — siehe docs/ENGINE.md).
3. **Spielerische Schicht (QuestHall-Lore, XP, Achievements) ist Rahmen,
   niemals Ersatz** für die authentische Bedienung.
4. **Rechtlicher Rahmen bleibt:** keine Fortinet-Logos, -Markenzeichen oder
   kopierten Assets. Nachgebaut werden Bedienkonzepte, Workflows und
   Informationsarchitektur — als unabhängiges, herstellerneutral formuliertes
   Lernprojekt (Disclaimer im README bleibt bestehen).

## Projekt-Orientierung (für neue Sessions)

- **Was:** Browser-Lernspiel für Firewall-Policy-Logik. React + Vite + TS
  strict, Zustand, Tailwind (Tokens in `src/theme/tokens.ts`), i18n de/en
  (Default en), Express-Backend im selben Container (Accounts + Save-Sync,
  `server/`), Daten als JSON im Docker-Volume.
- **Wahrheit:** `src/engine/` (pure TS, >95 % Branch-Coverage-Gate).
  Level = Daten (`content/levels/`, Validator `npm run validate:levels`).
- **Deploy:** VPS ohne DNS — `git clone` + `docker compose up -d --build`,
  Port über `AETHERGATE_PORT` (Standard 8090), Bind über `AETHERGATE_BIND`.
  Details: docs/DEPLOY.md. Repo: **B4lmoncl/Automation-script** (einziges
  Remote `origin`, Arbeitsbranch `claude/packetclaw-setup-84nxyb`) — dieser
  Container wird aus genau diesem Repo gesynct. (Historie: früher wurde
  zusätzlich nach B4lmoncl/PacketClaw gespiegelt; der Spiegel wurde am
  2026-07-13 auf Nutzerwunsch entfernt, weil er nicht genutzt wird.)
- **Arbeitsweise (Nutzerwunsch):** kleine Schritte, nach jedem Schritt
  Commit + Push nach `origin` (Branch `claude/packetclaw-setup-84nxyb`);
  Todos/Task-Liste und PLAN.md-Status-Log aktuell halten, damit Folge-
  Sessions den Stand ohne Codebase-Lektüre kennen.
- **Checks vor jedem Commit:** `npm run lint` (ESLint + Prettier),
  `npx vitest run`, bei UI-Änderungen `npm run build` + Playwright-Smoke
  (Chromium: `/opt/pw-browsers/chromium`, Server: `node server/index.mjs`).
- **Plan/Status:** PLAN.md (Status-Log unten), ROADMAP.md, REJECTED.md.
