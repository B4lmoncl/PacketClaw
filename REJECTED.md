# REJECTED — bewusst NICHT in v1

Diese Liste ist verbindlich. Nichts davon wird in v1 gebaut, auch nicht „nur kurz".
Neue verworfene Ideen werden hier ergänzt (mit Datum und Ein-Satz-Begründung).

## Aus dem Briefing

- **Kein Backend, keine Accounts, keine Datenbank.** Persistenz rein via localStorage + Savegame-Export/Import als JSON.
- **Kein Multiplayer, kein Online-Leaderboard.**
- **Keine echten Netzwerkzugriffe, kein Scanning, keine Offensive-Tools.** Alles ist Simulation gegen die eigene Engine.
- **Kein IPv6 in v1.** Engine kapselt IP-Logik in `src/engine/ip.ts`, damit IPv6 später nachrüstbar ist (Adressen als Intervalle über abstrakter Vergleichslogik).
- **Keine UTM-/Security-Profiles-Simulation** (AV/IPS/WebFilter) als Spielmechanik.
- **Keine Policy Routes, kein SD-WAN, kein Central NAT.**
- **Kein Tracking, keine Analytics, keine Werbung.**
- **Keine nativen Apps / kein Electron.** PWA reicht.

## Unterwegs verworfen

- _2026-07-10:_ **IP-Pools für SNAT** — v1 hat nur das `nat`-Flag (Egress-Interface-IP); Pools bringen didaktisch wenig vor Kapitel 6+ und verkomplizieren das Verdict-UI.
- _2026-07-10:_ **src-Port-Matching in Services** — reale Firewalls matchen praktisch immer auf dst-Port; src-Port-Matching wäre eine Falle ohne Lerneffekt.
- _2026-07-10:_ **`match-vip`-Sonderfall bei Deny-Policies** — FortiOS-Detailtiefe, die den didaktischen Kern (Policies matchen VIP-Traffic über das VIP-Objekt) verwässert. Als Vereinfachung in docs/ENGINE.md dokumentiert.
- _2026-07-10:_ **Session-Tabelle/Verbindungs-Simulation** — Stateful-Prinzip wird didaktisch vermittelt (nur Initiator-Pakete werden bewertet), nicht simuliert.

## Revidiert

- **„Kein Backend / keine Accounts" (v1)** — am 2026-07-11 auf Nutzerwunsch
  revidiert: Logins + serverseitiger Spielstand „wie bei QuestHall".
  Umsetzung bewusst minimal: ein Express-Prozess im selben Container,
  JSON-Dateien im Volume, scrypt + Bearer-Token. Kein OAuth, keine DB,
  kein E-Mail-Flow — das bleibt abgelehnt, solange es niemand braucht.
