# Deployment-Konzept (VPS, neben QuestHall)

**Ziel:** AetherGate läuft als Container auf demselben VPS wie QuestHall, hinter dem
vorhandenen Host-Reverse-Proxy — gleiche Konventionen wie QuestHalls compose-Setup
(localhost-Port-Bindung, `restart: unless-stopped`, Healthcheck, non-root).

## Architektur

- **Statische SPA, kein Backend.** Savegames liegen im Browser (localStorage). Der
  Container ist stateless — kein Volume, keine Secrets, keine API-Keys.
- **Image:** Multi-Stage-Build — Stage 1 `node:22-alpine` (npm ci → test →
  validate:levels → build), Stage 2 `nginxinc/nginx-unprivileged:alpine`, lauscht auf
  **8080**, läuft non-root.
- **nginx-Config im Image:** SPA-Fallback (`try_files $uri /index.html`), gzip,
  Assets `immutable`-Cache, `index.html` no-cache, Security-Header
  (X-Content-Type-Options, Referrer-Policy, CSP für Offline-SPA ohne externe Quellen —
  Fonts sind lokal gebundelt).
- **Registry:** CI baut bei Tag `v*` und pusht nach `ghcr.io/b4lmoncl/packetclaw`
  (`latest` + Versionstag). Der VPS pullt nur.

## compose.yml (Phase 5, Konvention wie QuestHall)

```yaml
services:
  aethergate:
    image: ghcr.io/b4lmoncl/packetclaw:latest
    container_name: aethergate
    restart: unless-stopped
    ports:
      - '127.0.0.1:${AETHERGATE_PORT:-8090}:8080' # nur localhost — TLS macht der Host-Proxy
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:8080/']
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    # --- Alternative: Traefik statt Host-nginx (auskommentiert) ---
    # labels:
    #   - traefik.enable=true
    #   - traefik.http.routers.aethergate.rule=Host(`aethergate.example.tld`)
    #   - traefik.http.routers.aethergate.tls.certresolver=le
    #   - traefik.http.services.aethergate.loadbalancer.server.port=8080
```

## Host-Reverse-Proxy (Beispiel nginx auf dem VPS)

```nginx
server {
    server_name aethergate.example.tld;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # TLS via certbot wie bei QuestHall
}
```

## Deploy in 3 Befehlen (auf dem VPS)

```bash
curl -fsSLO https://raw.githubusercontent.com/B4lmoncl/PacketClaw/main/compose.yml
AETHERGATE_PORT=8090 docker compose up -d
docker compose ps   # healthy?
```

Update: `docker compose pull && docker compose up -d`.

## Abgrenzung zu QuestHall

|                       | QuestHall             | AetherGate       |
| --------------------- | --------------------- | ---------------- |
| Backend               | Express + JSON-Volume | keins (statisch) |
| Port intern           | 3001                  | 8080             |
| Port Host (Vorschlag) | 127.0.0.1:3001        | 127.0.0.1:8090   |
| Volumes               | quest-data            | keine            |
| Secrets               | API_KEYS etc.         | keine            |

Beide hängen am selben Host-Proxy; eigene Subdomain pro App.
