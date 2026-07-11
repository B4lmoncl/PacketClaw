# Stage 1: Build (Tests + Level-Validierung sind Teil des Builds —
# ein Image ohne gruene Suite existiert nicht)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run lint \
 && npm test \
 && npm run validate:levels \
 && npm run build

# Stage 2: Statisches Serving, non-root, Port 8080
FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/ >/dev/null || exit 1
