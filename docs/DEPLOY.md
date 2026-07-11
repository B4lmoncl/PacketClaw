# Deploy

AetherGate läuft wie QuestHall: **ein Container**, gebaut direkt aus dem
Repo-Checkout, Daten in einem Docker-Volume. Kein Registry-Login, kein DNS
nötig.

## Schnellstart (root auf dem VPS, ohne DNS)

```bash
cd /opt && git clone https://github.com/B4lmoncl/PacketClaw.git aethergate
cd /opt/aethergate
printf 'AETHERGATE_BIND=0.0.0.0\nAETHERGATE_PORT=8090\n' > .env
docker compose up -d --build
docker compose ps   # STATUS: healthy?
```

Spiel: `http://<VPS-IP>:8090` · Falls ufw aktiv ist: `ufw allow 8090/tcp`

Ist das GitHub-Repo privat, braucht der Clone ein Token (Fine-grained PAT,
nur Contents:Read):
`git clone https://<TOKEN>@github.com/B4lmoncl/PacketClaw.git aethergate`
— oder das Repo auf public stellen (wie QuestHall), dann geht es ohne.

## Update

```bash
cd /opt/aethergate && git pull && docker compose up -d --build
```

Accounts/Spielstände liegen im Volume `aethergate-data` und überleben
Rebuilds, Container-Neuanlagen und Reboots (`restart: unless-stopped`).

## Was der Container macht

- Stage 1 baut das Frontend (`tsc -b` + vite) und validiert alle Level;
  die volle Testsuite läuft in der CI, nicht beim VPS-Build.
- Laufzeit: `node server/index.mjs` (non-root via su-exec) serviert `dist/`
  mit Security-Headern/CSP **und** die Account-API:
  `POST /api/auth/register|login|logout`, `GET|PUT /api/save` (Bearer-Token),
  `GET /api/health` (Healthcheck).
- Daten: `users.json`, `tokens.json`, `saves/<name>.json` in `/app/data`
  (atomare Writes). Passwörter als scrypt-Hash mit per-User-Salt.

## Backup

```bash
docker run --rm -v aethergate-data:/data -v /root:/backup alpine \
  tar czf /backup/aethergate-data-$(date +%F).tgz -C /data .
```

## Hinter Reverse Proxy (TLS, später)

`.env` löschen (Default-Bind `127.0.0.1:8090`) und im Host-nginx/Traefik/Caddy
auf `127.0.0.1:8090` proxien. Mit HTTPS funktioniert dann auch die
PWA-Installation/Offline-Fähigkeit (Service Worker brauchen einen
Secure Context — über plain HTTP + IP registriert der Browser keinen SW;
das Spiel läuft trotzdem vollständig).

Caddy-Beispiel (läuft auf dem VPS bereits):

```
aethergate.example.tld {
    reverse_proxy 127.0.0.1:8090
}
```

## Passwort-Realität ohne TLS

Über plain HTTP laufen Login-Passwörter unverschlüsselt durchs Netz.
Für ein Hobby-Spiel auf eigenem Server vertretbar — aber: dort **kein
Passwort verwenden, das woanders benutzt wird**. Wer das sauber will,
hängt Caddy davor (Abschnitt oben).
