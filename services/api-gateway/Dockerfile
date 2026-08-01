# syntax=docker/dockerfile:1
# Build from repository root:
#   docker build -f services/api-gateway/Dockerfile -t nutriagent-api-gateway .

ARG SERVICE_PACKAGE=@nutriagent/api-gateway
ARG SERVICE_PATH=services/api-gateway
ARG SERVICE_PORT=3000
ARG WITH_DB=true

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Shared layer: root + workspace-wide packages only (no service package.json yet).
# Byte-identical across all backend Dockerfiles, so BuildKit's local build cache (and the
# pnpm store cache mount) is reused across service builds instead of reinstalling per service.
FROM base AS deps-shared
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile || pnpm install

FROM deps-shared AS deps
ARG SERVICE_PATH
COPY ${SERVICE_PATH}/package.json ./${SERVICE_PATH}/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile || pnpm install

FROM base AS builder
ARG SERVICE_PACKAGE
ARG SERVICE_PATH
ARG WITH_DB
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prefer-offline || pnpm install --prefer-offline
RUN pnpm --filter @nutriagent/shared build
RUN if [ "$WITH_DB" = "true" ]; then \
      pnpm --filter @nutriagent/db generate && pnpm --filter @nutriagent/db build; \
    fi
RUN pnpm --filter "${SERVICE_PACKAGE}" build

FROM base AS deploy
ARG SERVICE_PACKAGE
ARG WITH_DB
COPY --from=builder /app .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm deploy --filter "${SERVICE_PACKAGE}" --prod /prod/app
RUN if [ "$WITH_DB" = "true" ]; then \
      ENGINE=$(find /app/node_modules/.pnpm -type f -path '*/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node' 2>/dev/null | head -1); \
      if [ -z "$ENGINE" ]; then \
        echo "ERROR: Prisma query engine not found in builder — run prisma generate first" >&2; exit 1; \
      fi; \
      PRISMA_SRC=$(dirname "$ENGINE"); \
      find /prod/app/node_modules \( -type d -o -type l \) -path '*/@prisma/client' ! -path '*/@prisma/client/*' -print0 | \
        while IFS= read -r -d '' client_pkg; do \
          dest="$(dirname "$(dirname "$client_pkg")")/.prisma/client"; \
          mkdir -p "$dest" && cp -rf "$PRISMA_SRC"/. "$dest"/; \
        done; \
      DB_CLIENT=$(find /prod/app/node_modules -path '*/@nutriagent/db/dist/client.js' 2>/dev/null | head -1); \
      if [ -z "$DB_CLIENT" ]; then \
        echo "ERROR: @nutriagent/db dist/client.js not found in prod image" >&2; exit 1; \
      fi; \
      node -e "const {createRequire}=require('module'); createRequire(process.argv[1])('@prisma/client'); console.log('prisma require smoke test: OK');" "$DB_CLIENT"; \
      PROD_ENGINE=$(find /prod/app/node_modules -type f -path '*/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node' 2>/dev/null | head -1); \
      if [ -z "$PROD_ENGINE" ]; then \
        echo "ERROR: Prisma query engine missing from prod image after copy" >&2; exit 1; \
      fi; \
      rm -rf /prod/app/node_modules/.pnpm/@prisma+engines@* \
             /prod/app/node_modules/.pnpm/@prisma+fetch-engine@* \
             /prod/app/node_modules/.pnpm/@prisma+get-platform@* \
             /prod/app/node_modules/.pnpm/@prisma+engines-version@* \
             /prod/app/node_modules/.pnpm/@prisma+config@* \
             /prod/app/node_modules/.pnpm/prisma@* 2>/dev/null; \
      true; \
    fi
# Generic runtime trims (verified none are require()'d at runtime — see docker/README.md):
#  - source maps: dev-only debugging aid, never loaded by the running app
#  - non-musl sharp/libvips platform binaries: this image only ever runs on Alpine (musl)
#  - node-sql-parser's umd/build dirs: browser bundles, unreachable via its "main": "index.js"
RUN find /prod/app/node_modules -type f -name '*.map' -delete 2>/dev/null; \
    find /prod/app/node_modules/.pnpm -maxdepth 1 -type d -name '@img+sharp-*' ! -name '*musl*' -exec rm -rf {} + 2>/dev/null; \
    rm -rf /prod/app/node_modules/.pnpm/node-sql-parser@*/node_modules/node-sql-parser/umd \
           /prod/app/node_modules/.pnpm/node-sql-parser@*/node_modules/node-sql-parser/build 2>/dev/null; \
    true
# Dev artifacts copied by pnpm deploy must not ship root-owned (node user cannot write meal photos).
RUN rm -rf /prod/app/storage /prod/app/uploads

FROM node:20-alpine AS runner
ARG SERVICE_PORT
RUN apk add --no-cache wget su-exec
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${SERVICE_PORT}
ENV API_PORT=${SERVICE_PORT}
COPY docker/api-gateway-entrypoint.sh /usr/local/bin/api-gateway-entrypoint.sh
RUN chmod +x /usr/local/bin/api-gateway-entrypoint.sh
COPY --from=deploy /prod/app .
RUN mkdir -p /app/storage/meal-images /app/uploads \
    && chown -R node:node /app/storage /app/uploads
EXPOSE ${SERVICE_PORT}
HEALTHCHECK --interval=3s --timeout=2s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/usr/local/bin/api-gateway-entrypoint.sh"]
CMD ["node", "dist/index.js"]
