# 🦞 PacketClaw

**Firewall-Policy-Puzzle-Game.** Trainiere First-Match-Logik, Regelreihenfolge, Adress-/Service-Objekte, Zonen, SNAT und VIPs/DNAT — als Spiel, im Browser, offline-fähig.

> **Disclaimer:** Unabhängiges Lernprojekt, inspiriert von Konzepten stateful arbeitender Firewalls (u. a. FortiOS). Nicht mit Fortinet affiliiert. Keine Fortinet-Logos, -Marken oder GUI-Nachbauten.

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
