# Stage 1: Frontend bauen (Typecheck via tsc -b ist Teil von npm run build;
# Level-Validierung läuft mit — die volle Testsuite läuft in der CI, nicht
# beim VPS-Build, damit `docker compose up --build` schnell bleibt)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run validate:levels && npm run build

# Stage 2: nur Produktions-Dependencies (express & Co. für den Server)
FROM node:22-alpine AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 3: Laufzeit — EIN Node-Prozess serviert Spiel (dist/) und Account-API
# (QuestHall-Muster: non-root via entrypoint + su-exec, Daten in /app/data)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=8080
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir -p /app/data \
 && addgroup -S appgroup && adduser -S appuser -G appgroup \
 && apk add --no-cache su-exec \
 && chown -R appuser:appgroup /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server/index.mjs"]
