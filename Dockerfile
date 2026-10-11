# Multi-arch (built on the GX10 itself, linux/arm64). Plan §3 "Native vs. Docker".
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
# The help page bundles D's crisis resources (web/src/safety/crisisResources.ts).
COPY config /app/config
RUN npm run build

FROM node:22-bookworm-slim AS server
# Toolchain for native dependencies when their prebuilt binaries are unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages packages
RUN npm run build && npm prune --omit=dev

# Dev mode only (docker-compose.dev.yml): the repo is bind-mounted and
# node_modules live in named volumes, so nothing here is baked into the demo image.
FROM node:22-bookworm-slim AS dev
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/node_modules /app/packages/core/node_modules /app/packages/server/node_modules /app/web/node_modules \
  && chown -R node:node /app
USER node
WORKDIR /app

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=127.0.0.1 PORT=8000 INNERCOVE_ROOT=/app WEB_DIST=web/dist
WORKDIR /app
COPY package.json ./
COPY --from=server /app/node_modules node_modules
COPY --from=server /app/packages packages
COPY --from=web /app/web/dist web/dist
COPY config config
COPY docs/prep/system-prompt.txt docs/prep/demo-persona.json docs/prep/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["node", "packages/server/dist/main.js"]
