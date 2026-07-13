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

## Recherche 2026-07-13 — Abgleich mit FCP/NSE4-Blueprint (FortiGate 7.6 Administrator)

Quellen: offizielle Exam Description (FortiGate 7.6 Administrator), FortiOS-7.6-
Admin-Guide (Firewall policy), Fortinet-Community (Hit Count/Unused Policies,
Debug-Flow-Workflows). Ziel unverändert: was ein FortiGate-Admin KÖNNEN muss,
wird spielbar. Kandidaten nach Lernwert sortiert:

1. **Hit-Count-/Unused-Policy-Workflow (GUI, sofort):** FortiOS zeigt pro Policy
   Hits/Last-Used; Admins finden damit tote Regeln. → Hit-Spalte in der
   Policy-Tabelle (Incident: aus Log-Paketen; Sandbox: gefeuerte Pakete),
   Audit-Aufgaben "räume Regeln mit 0 Hits auf".
2. **CLI-Brücke (sofort):** GUI↔CLI ist Prüfungs- und Alltagsstoff. Read-only-
   Panel `show firewall policy` in FortiOS-Syntax unter der Tabelle — man sieht
   live, wie die GUI-Regeln im CLI aussehen. Später: `get router info
routing-table all`, `diagnose sys session list`.
3. **Debug-Flow-Modus (mittel):** `diagnose debug flow` ist DAS Trouble-
   shooting-Werkzeug (trace: "find a route", "match policy id X", "denied").
   Die Descent-Animation ist die visuelle Entsprechung — zusätzlich die echten
   Trace-Zeilen (vereinfacht) als Text ausgeben und in Incident-Leveln Fragen
   dazu stellen ("in welcher Zeile stirbt das Paket?").
4. **SNAT/DNAT-Werkstatt (v1.1):** Exam-Domain "Configure SNAT and DNAT
   options": IP-Pools, VIP-Portforward, Hairpin. Aufgabentyp: "Paket muss als
   IP X am Ziel ankommen — konfiguriere NAT richtig."
5. **Routing-Modus (v1.1/v1.2):** statische Routen editieren, LPM-Entscheid
   sichtbar machen (Routing Monitor als Spielfeld); Fallen: fehlende
   Rückroute, falsches dstintf → Policy matcht nie.
6. **Session-Tabelle lesen (v1.2):** nach ACCEPT entsteht eine Session;
   vereinfachte `diagnose sys session list`-Ansicht + Fragen (Timeout,
   Richtung, NAT-Spalten).
7. **Firewall-Auth/FSSO (v1.2+):** Exam-Domain; braucht User/Gruppen im
   Policy-Modell (users[]-Feld + Auth-Zustand am Paket).
8. **Content Inspection (v1.1, schon geplant):** cert vs. deep inspection,
   WebFilter/AppControl/AV-Flags — deckt die Exam-Domain "Content Inspection".
9. **Cert-Trainer-Quiz (Kandidat):** Multiple-Choice-Runden aus EIGENEN, aus
   der Engine abgeleiteten Fragen (keine kopierten Dumps — rechtlicher
   Rahmen!), als Daily-Ergänzung.
10. **HA/FGCP (v1.2, schon geplant):** Exam-Domain "Configure an FGCP HA
    cluster" — deckt sich mit dem Topologie-Kapitel.

## Prinzip

Neue Ideen: erst hierher, dann priorisieren. Nichts davon blockiert v1.
Verworfenes (auch für später) steht mit Begründung in REJECTED.md.
