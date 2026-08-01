# syntax=docker/dockerfile:1
#
# Multi-stage Next.js portal image (standalone output).
# Build from repository root, e.g.:
#   docker build -f docker/next-portal.Dockerfile \
#     --build-arg APP_PACKAGE=@nutriagent/user-portal \
#     --build-arg APP_PATH=apps/user-portal \
#     --build-arg APP_PORT=3008 \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000 \
#     -t nutriagent-user-portal .

ARG APP_PACKAGE
ARG APP_PATH
ARG APP_PORT=3008
ARG NEXT_PUBLIC_API_URL=http://localhost:3000

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
ARG APP_PATH
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY ${APP_PATH}/package.json ./${APP_PATH}/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile || pnpm install

FROM base AS builder
ARG APP_PACKAGE
ARG APP_PATH
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prefer-offline || pnpm install --prefer-offline
RUN pnpm --filter @nutriagent/shared build
RUN pnpm --filter "${APP_PACKAGE}" build

FROM node:20-alpine AS runner
ARG APP_PATH
ARG APP_PORT
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${APP_PORT}
ENV HOSTNAME=0.0.0.0
ENV STANDALONE_SERVER=${APP_PATH}/server.js
COPY --from=builder /app/${APP_PATH}/public ./public
COPY --from=builder /app/${APP_PATH}/.next/standalone ./
COPY --from=builder /app/${APP_PATH}/.next/static ./${APP_PATH}/.next/static
# Non-musl sharp/libvips platform binary + source maps: unreachable at runtime on Alpine.
RUN find /app/node_modules -type f -name '*.map' -delete 2>/dev/null; \
    find /app/node_modules/.pnpm -maxdepth 1 -type d -name '@img+sharp-*' ! -name '*musl*' -exec rm -rf {} + 2>/dev/null; \
    true
USER node
EXPOSE ${APP_PORT}
HEALTHCHECK --interval=3s --timeout=2s --start-period=8s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1
CMD ["sh", "-c", "node \"$STANDALONE_SERVER\""]
