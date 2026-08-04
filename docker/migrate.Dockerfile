# syntax=docker/dockerfile:1
#
# One-shot image for schema migrations, LangGraph checkpoint tables, demo seed and
# the USDA import. Run as a Cloud Run Job inside the VPC — CI cannot reach the
# private-IP Cloud SQL instance directly.
#
# Build from the repository root:
#   docker build -f docker/migrate.Dockerfile -t nutriagent-migrate .
#
# The command is chosen at execution time, e.g.:
#   gcloud run jobs execute nutriagent-migrate --args=migrate
#   gcloud run jobs execute nutriagent-migrate --args=seed
#   gcloud run jobs execute nutriagent-migrate --args=usda

FROM node:20-alpine

RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Only what the migration tooling needs — no services.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY services/orchestrator/package.json ./services/orchestrator/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile || pnpm install

COPY packages ./packages
COPY services/orchestrator ./services/orchestrator

RUN pnpm --filter @nutriagent/shared build \
 && pnpm --filter @nutriagent/db generate \
 && pnpm --filter @nutriagent/db build

COPY docker/migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint.sh
RUN chmod +x /usr/local/bin/migrate-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/migrate-entrypoint.sh"]
CMD ["migrate"]
