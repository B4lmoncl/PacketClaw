# Roadmap

v1 liefert den polierten Kern (siehe PLAN.md). Alles hier ist **bewusst nach v1
verschoben** — Wünsche und Ideen landen hier statt den Kern zu verwässern.

## v1.1 — Security Profiles & Inspection (Nutzerwunsch 2026-07-10)

Ein eigenes Kapitel „Security Profiles" mit neuem Aufgabentyp **Inspection-Entscheid**:

- **Certificate Inspection vs. Deep Inspection (SSL/TLS):** Wann reicht
  Zertifikats-Inspektion (SNI/CN-basiertes Filtering, kein Aufbrechen der Verschlüsselung),
  wann braucht es Deep Inspection (AV/IPS/DLP im TLS-Stream) — und was sind die Kosten
  (CA-Verteilung an Clients, Certificate Pinning bricht, Datenschutz/Betriebsrat,
  Performance)? Aufgabenformat: Szenario-Karten („Banking-App im Gast-WLAN",
  „Malware-Schutz für Downloads im LAN") → Entscheidung + Debrief.
- **AV/IPS/WebFilter/AppControl als Profil-Flags** auf Accept-Policies: didaktisch
  („Flow vs. Proxy-Inspection", „IPS nur wo Initiator extern"), nicht als
  Traffic-Simulation. Audit-Aufgaben: „Policy akzeptiert Internet-Traffic ohne IPS".
- Engine-Erweiterung: `Policy.profiles?: { av?, ips?, webfilter?, sslInspection?: 'none' | 'cert' | 'deep' }`
  plus Analysefunktion `findUninspectedPolicies()`.

## v1.2 — Topologie & Platzierung (Nutzerwunsch 2026-07-10)

Neues Meta-Konzept: Nicht nur „matcht die Regel?", sondern **„auf welcher Box gehört die
Regel hin — und warum?"**

- **Perimeter- vs. interne Firewall:** Zwei-Firewall-Topologien (Perimeter am WAN,
  interne FW vor Server-Segmenten). Neuer Aufgabentyp **Placement**: Ticket +
  Topologie-Diagramm mit ZWEI Policy-Tabellen → Spieler entscheidet, auf welcher
  Firewall die Regel landet (und baut sie dort). Debrief erklärt die Kriterien:
  Blast-Radius, Log-Sichtbarkeit, Asymmetrie, „block as close to the source as
  possible" vs. „enforce at the perimeter". Engine kann das heute schon fast:
  zwei NetworkConfigs + verkettete Evaluation (Egress FW1 = Ingress FW2).
- **HA-Cluster (Active/Passive):** Didaktik-Kapitel: Cluster = EINE logische Firewall
  (synchronisierte Config + Session-Sync); Klassiker-Fallen als Incident-Level:
  Config-Sync kaputt (Regel nur auf einem Node → Verhalten hängt am Failover),
  asymmetrisches Routing über beide Nodes, Session-Pickup nach Failover
  („warum überlebte der Download den Failover, die VPN-Session aber nicht?").
  Level-Format: `nodes: [NetworkConfig, NetworkConfig]` + aktiver Node als Zustand.
- **Routing vertieft:** Routen als editierbare Objekte in Audit/Incident-Leveln
  (falsche/fehlende Route als Root Cause — die Engine nutzt LPM ja bereits),
  statische Route vs. Policy-Entscheidung, geplantes Kapitel „Wege durch den Turm":
  Default-Route-Fallen, überlappende Präfixe, Blackhole-Routen.

## v1.x — weitere Kandidaten

- **DNS-Kapitel:** DNS als Service vertiefen (UDP/TCP 53, DoT 853/DoH 443 als
  Erkennungsproblem), interner Resolver vs. direkte Auflösung, DNS-basierte Fallen in
  Incident-Leveln.
- **IP-Pools für SNAT** (Overload/One-to-One) als Kapitel-6-Erweiterung.
- **Central NAT** als Alternative zur Policy-NAT-Denkweise (Vergleichs-Lektion).
- **IPv6** (Engine ist auf Intervall-Logik vorbereitet, `src/engine/ip.ts` kapselt v4).
- **Hairpin-NAT / VIP aus dem LAN** als eigenes Gemein-Level in Kapitel 7.
- **Level-Editor** in der Sandbox (eigene Level als JSON exportieren/teilen).
- **Mehr Schedules** (recurring/one-shot, Feiertage) für Audit-Fallen.
- **Wöchentliche Challenge** (7-Level-Serie mit festem Seed) zusätzlich zum Daily Run.
- **Lokalisierte Sprachausbaustufen** (en-Feinschliff, ggf. fr/es).

## Prinzip

Neue Ideen: erst hierher, dann priorisieren. Nichts davon blockiert v1.
Verworfenes (auch für später) steht mit Begründung in REJECTED.md.
