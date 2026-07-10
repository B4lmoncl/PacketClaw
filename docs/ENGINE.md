# Engine-Semantik

Die Engine (`src/engine/`) ist die Wahrheit des Spiels: pure TypeScript, deterministisch,
ohne UI-Abhängigkeiten, vollständig unit-getestet (>95 % Branch-Coverage, Property-Tests).
Jede didaktische Aussage im Spiel wird aus `Verdict.trace` generiert.

## Evaluationsreihenfolge

Für jedes Paket führt `evaluate(packet, config)` exakt diese Schritte aus:

1. **VIP/DNAT-Check.** Matcht `dstIp` (+ `protocol`/`extPort`, falls am VIP gesetzt) ein
   VIP-Objekt, wird die effektive Ziel-IP für das Routing die `mappedIp`. Für den
   Policy-Match ist die Destination ab jetzt **das VIP-Objekt**: Eine Policy matcht nur,
   wenn ihr `dstaddr` den VIP-Namen enthält.
2. **Routing.** Longest-Prefix-Match der effektiven Ziel-IP gegen die Routing-Tabelle des
   Levels bestimmt `dstintf`. Bei gleicher Präfixlänge gewinnt der erste Eintrag.
   Kein Match → `deny`, `matchedPolicyId: 0`, Trace-Schritt `no-route`.
3. **Top-down, First Match.** Policies in Listenreihenfolge. `enabled: false` wird
   übersprungen (Trace: `policy-skipped`). Die erste Policy, bei der **alle** Felder
   matchen, gewinnt; danach wird abgebrochen.
4. **Implicit Deny.** Matcht keine Policy: `deny`, `matchedPolicyId: 0`,
   Trace-Schritt `implicit-deny`.

## Feld-Matching

Innerhalb eines Feldes gilt **ODER** (über die Array-Einträge), zwischen Feldern **UND**.
Die Felder werden in fester Reihenfolge geprüft; das **erste** scheiternde Feld landet im
Trace (`policy-no-match` mit `failedField`):

`srcintf → dstintf → srcaddr → dstaddr → service → schedule`

- **srcintf/dstintf:** exakter Interface-Name, Zonen-Mitgliedschaft des Interfaces oder
  `"any"`. Zonen-Member sind Interface-IDs (lenient auch Namen).
- **srcaddr/dstaddr:** rekursive Gruppenauflösung (zyklensicher; Zyklen liefern die
  erreichbaren Objekte). `"all"` matcht jede IP. CIDR-Grenzen exakt: Netz- **und**
  Broadcast-Adresse gehören zum Subnetz-Match. Ranges sind inklusiv. Unbekannte Namen
  matchen nichts.
- **service:** rekursive Gruppenauflösung; `"ALL"` (und jedes Objekt mit
  `protocol: "any"`) matcht alles. tcp/udp: Protokoll UND `dstPort` in einer der Ranges;
  ohne `dstPorts` matcht jeder Port. icmp: Protokoll, plus `icmpType`, falls gesetzt.
- **schedule:** `work-hours` = Mo–Fr 08:00–17:59. Es zählt die **Wanduhrzeit aus dem
  ISO-String** (`YYYY-MM-DDTHH:mm…`); ein Zeitzonen-Suffix wird ignoriert — dadurch ist
  das Ergebnis auf jedem Client identisch. Fehlt der Timestamp, matchen
  work-hours-Policies nicht (der Level-Validator erzwingt Timestamps, sobald ein Level
  schedules nutzt).

## DNAT-Detailregeln

- `dstaddr: ["all"]` matcht DNAT-Traffic **nicht** — Policies für Portforwarding müssen
  das VIP-Objekt referenzieren. Das ist die klassische FortiOS-Lektion aus Kapitel 7.
- Eine Policy auf die **interne** IP (`mappedIp`) matcht DNAT-Traffic ebenfalls nicht.
- VIP-Namen in `dstaddr` zählen nur, wenn der VIP tatsächlich gematcht hat (richtige
  extIp/extPort/Protokoll-Kombination). Ein Paket auf `extIp` mit falschem Port wird ganz
  normal (ohne DNAT) geroutet und gematcht.
- `Verdict.dnat` (Ziel `mappedIp:mappedPort`) wird nur bei **ACCEPT** gesetzt.

## SNAT

`nat: true` + ACCEPT ⇒ `natApplied: true` (Source-NAT auf die Egress-Interface-IP).
Bei DENY ist das Flag wirkungslos. Keine IP-Pools in v1.

## Stateful-Prinzip (didaktisch)

Die Engine bewertet ausschließlich **Verbindungs-Initiatoren**. Antwortverkehr einer
akzeptierten Session braucht keine eigene Regel — das Spiel lehrt das explizit, simuliert
aber keine Session-Tabelle. Kapitel 5 nutzt die überflüssige „Rückregel" als Falle.

## Analysefunktionen (Audit-Modus)

- `findShadowedPolicies(config)`: Eine Policy gilt als shadowed, wenn **eine** frühere
  enabled Policy ihre Match-Menge vollständig abdeckt. Der Vergleich läuft Feld für Feld
  (hinreichend, weil die Engine Felder unabhängig per UND prüft): Interface-Mengen
  (closed-world über die deklarierten Interfaces), Adress-Intervalle (Vereinigung),
  VIP-Atome (getrennt von Intervallen — `"all"` deckt VIPs nicht ab), Service-Mengen pro
  Protokoll (Portintervall-Vereinigung; benachbarte Ranges verschmelzen), Schedules
  (`always` ⊇ `work-hours`). Kombinationen mehrerer früherer Policies werden bewusst
  nicht betrachtet; Policies mit leerer Match-Menge werden nicht gemeldet (konservativ).
- `findRedundantPolicies(config, packets)`: entfernbar ohne beobachtbare
  Verhaltensänderung (action, dstintf, NAT/DNAT) gegen die gegebene Testpaket-Suite.
- `findOverbroadPolicies(config, suite)`: Accept-Policies mit `all`/`ALL`/`any`, für die
  es engere Objekte aus der Bibliothek gibt, sodass die komplette Suite (must-pass UND
  must-block) grün bleibt. Konservativ: ohne must-pass-Treffer keine Empfehlung.

## Bewusste Vereinfachungen gegenüber realem FortiOS

| Vereinfachung                                              | Begründung                                               |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| Kein src-Port-Matching in Services                         | praktisch immer dst-Port; kein Lerneffekt                |
| Kein `match-vip`-Sonderfall bei Deny-Policies              | Detailtiefe verwässert die VIP-Lektion                   |
| Keine Session-Tabelle / kein Antwortverkehr                | Stateful-Prinzip wird gelehrt, nicht simuliert           |
| IPv4 only                                                  | v1-Scope; IP-Logik ist in `ip.ts` gekapselt (Intervalle) |
| SNAT nur als Flag (keine IP-Pools)                         | didaktisch ausreichend für LAN→WAN vs. LAN→DMZ           |
| Kein Central NAT, keine Policy Routes, kein SD-WAN         | REJECTED.md                                              |
| Schedules nur `always`/`work-hours`                        | genug für die Schedule-Lektion                           |
| `dstintf` rein aus der Routing-Tabelle                     | keine connected/static-Unterscheidung nötig              |
| Ein VIP pro extIp/Port-Kombi (erster gewinnt)              | Level definieren eindeutige VIPs (Validator)             |
| Local-in-Traffic (Ziel = Firewall selbst) nicht modelliert | außerhalb des Spielumfangs                               |

## Determinismus

- Kein `Math.random` in Engine oder Generatoren — ausschließlich `createRng(seed)`
  (mulberry32, String-Seeds via xmur3).
- `evaluate()` ist eine reine Funktion: gleiches Paket + gleiche Config ⇒ identisches
  Verdict inkl. Trace (per Property-Test abgesichert).
