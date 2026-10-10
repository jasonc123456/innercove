# Multi-arch (built on the GX10 itself, linux/arm64). Plan §3 "Native vs. Docker".
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json tsconfig.base.json ./
COPY packages packages
COPY core core
COPY server server
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=127.0.0.1 PORT=8000 WEB_DIST=/app/web/dist
WORKDIR /app
COPY package.json ./
COPY --from=server /app/node_modules node_modules
COPY --from=server /app/dist dist
COPY --from=server /app/packages packages
COPY --from=web /app/web/dist web/dist
COPY docs/prep/system-prompt.txt docs/prep/system-prompt.txt
USER node
CMD ["node", "dist/server/main.js"]
