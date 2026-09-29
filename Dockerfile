# syntax=docker/dockerfile:1
# Node 22 LTS (Node 20 salió de soporte en abril de 2026)
FROM node:22-alpine AS base
WORKDIR /usr/app
RUN apk add --no-cache tini chromium nss freetype harfbuzz ca-certificates ttf-freefont \
  && npm config set update-notifier false
# Puppeteer usa el Chromium del sistema; no descarga otro
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json ./

# Dependencias de producción, instaladas exactamente como dice el lock
FROM base AS deps
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Desarrollo local (docker-compose.yml)
FROM base AS development
ENV NODE_ENV=development
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Producción (Dokploy / ECS). Es la última etapa: si no se indica target, se construye esta.
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps --chown=node:node /usr/app/node_modules ./node_modules
COPY --chown=node:node . .
# El código queda de solo lectura para el usuario que corre la app
RUN chown -R root:root /usr/app/src /usr/app/migrations /usr/app/scripts /usr/app/server.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Aplica migraciones pendientes y arranca (ver scripts/start-prod.js)
CMD ["node", "scripts/start-prod.js"]
