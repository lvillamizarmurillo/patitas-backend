# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /usr/app
RUN apk add --no-cache tini
COPY package*.json ./

# Dependencias de producción
FROM base AS deps
RUN npm ci --omit=dev

# Desarrollo (docker compose lo usa con bind mount)
FROM base AS development
ENV NODE_ENV=development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Producción (lo que sube a ECR)
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /usr/app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]