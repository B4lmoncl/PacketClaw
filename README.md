# 🦞 AetherGate

**Firewall-Policy-Puzzle-Game.** Trainiere First-Match-Logik, Regelreihenfolge, Adress-/Service-Objekte, Zonen, SNAT und VIPs/DNAT — als Spiel, im Browser, offline-fähig.

Du bist **Torwächter des Venennetzes** im Turm von Aethermoor (der Welt von [QuestHall](https://github.com/B4lmoncl/QuestHall)): Entscheide, welcher Aetherstrom die Tore passieren darf. An deiner Seite: **Snipp, der Torwächter-Krebs**. Die Fachlichkeit darunter ist echt — Policies, Zonen, NAT, Implicit Deny.

> **Disclaimer:** Unabhängiges Lernprojekt, inspiriert von Konzepten stateful arbeitender Firewalls (u. a. FortiOS). Nicht mit Fortinet affiliiert. Keine Fortinet-Logos, -Marken oder GUI-Nachbauten.
>
> _Arbeitstitel bis zur Namensentscheidung: PacketClaw — technische IDs (Repo, Paketname, Savegame-Key) behalten diesen Namen bis v1.0._

## Was ist das?

Eine deterministische Policy-Engine (pure TypeScript, vollständig getestet) plus vier Spielmodi darüber:

- **Verdict** — Paket ansehen, ACCEPT/DENY + matchende Policy-ID tippen. Schnell, touch-first.
- **Architect** — Ticket lesen, Regelwerk aus Objektbibliothek bauen; unsichtbare Testsuite prüft.
- **Audit** — gewachsene Regelwerke entrümpeln: Shadowing, Redundanz, Any-Any härten.
- **Incident** — Forward-Log lesen, schuldige Policy finden, Fix anwenden.

Dazu: **Daily Run** (seeded, für alle gleich), **Sandbox**, Kampagne mit 8 Kapiteln / 80+ Leveln, XP/Sterne/Ränge/Achievements. Nach jeder Antwort erklärt der **Packet Descent** (animierter Match-Trace) warum — direkt aus der Engine, nicht handgeschrieben.

## Status

In Entwicklung. Fortschritt und Architektur: [PLAN.md](PLAN.md) · bewusst weggelassen: [REJECTED.md](REJECTED.md) · Engine-Semantik: [docs/ENGINE.md](docs/ENGINE.md)

## Entwicklung

```bash
npm ci
npm run dev        # Dev-Server
npm test           # Engine- und UI-Tests (vitest)
npm run lint       # ESLint + Prettier-Check
```

## Lizenz

[MIT](LICENSE)
