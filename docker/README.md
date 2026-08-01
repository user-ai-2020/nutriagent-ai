# Docker images

Multi-stage Dockerfiles for NutriAgent services. **Build context is always the repository root.**

## Image naming (Docker Hub)

Images are published as:

```text
${DOCKERHUB_NAMESPACE}/nutriagent-<service>:<tag>
```

Set `DOCKERHUB_NAMESPACE` in `.env` (see `.env.example`) — never hardcode a username in Dockerfiles or compose files.

CI publishes `:latest` and a git-SHA tag on every push to `main` (see @.github/workflows/docker-publish.yml and [docs/DOCKER_HUB_SETUP.md](../docs/DOCKER_HUB_SETUP.md)).

| Service | Dockerfile | Default port |
|---------|------------|--------------|
| api-gateway | `services/api-gateway/Dockerfile` | 3000 |
| orchestrator | `services/orchestrator/Dockerfile` | 3001 |
| vision-agent | `services/vision-agent/Dockerfile` | 3002 |
| nutrition-agent | `services/nutrition-agent/Dockerfile` | 3003 |
| rag-agent | `services/rag-agent/Dockerfile` | 3004 |
| text2sql-agent | `services/text2sql-agent/Dockerfile` | 3005 |
| graphdb-agent | `services/graphdb-agent/Dockerfile` | 3006 |
| user-portal | `apps/user-portal/Dockerfile` | 3008 |
| admin-portal | `apps/admin-portal/Dockerfile` | 3007 |

Generic templates (same stages, explicit `--build-arg`s): `docker/node-service.Dockerfile`, `docker/next-portal.Dockerfile`.

## Build one service locally

```bash
docker build -f services/graphdb-agent/Dockerfile -t nutriagent-graphdb-agent .
docker build -f apps/user-portal/Dockerfile -t nutriagent-user-portal .
```

## Stages (Node services)

1. **deps** — workspace-aware `pnpm install` (layer-cached package.json copies)
2. **builder** — compile `@nutriagent/shared`, optional `@nutriagent/db`, then the service (`tsc`)
3. **deploy** — `pnpm deploy --filter <package> --prod` (production deps only, no devDependencies)
4. **runner** — `node:20-alpine`, non-root `node` user, runs compiled `dist/index.js`

Next.js portals use **standalone** output (`output: "standalone"` in `next.config.ts`) for a slim runtime image.

No secrets are baked into images; configuration comes from `.env` at `docker compose up` time.

The root [`.dockerignore`](../.dockerignore) keeps `node_modules`, `.env`, `.git`, build artifacts, tests, and docs out of the build context (~20 KB vs ~1.5 GB without it).

## Health checks & compose startup order (Task 8.3)

Each app image defines a Docker `HEALTHCHECK` that hits `GET /health` on `PORT` via **wget** (Task 9.3 — lighter than spawning Node each interval). Next.js portals expose `apps/*/src/app/health/route.ts`.

**Env validation before listen:** every backend service imports `./loadEnv` as its first statement in `src/index.ts`. That module runs synchronously and calls `validateRequiredEnv` before Express binds a port — so a container answering `/health` has already passed env validation (or exited).

**Compose `depends_on` (intentional graph, not full mesh):**

| Service | Waits for |
|---------|-----------|
| vision-agent, graphdb-agent | *(none)* |
| nutrition-agent, rag-agent, text2sql-agent | postgres |
| orchestrator | postgres + vision, nutrition, rag, graphdb, **text2sql** |
| api-gateway | postgres, redis, orchestrator |
| user-portal, admin-portal | api-gateway |

Orchestrator does **not** depend on api-gateway. Api-gateway does **not** depend on rag/text2sql/graphdb directly (those are reached via orchestrator).

## Default stack (Task 12)

A plain `docker compose up -d` starts **all 11 app services + 2 infra** — no `COMPOSE_PROFILES` flag:

| Service | Port | Notes |
|---------|------|-------|
| user-portal | 3008 | All users |
| admin-portal | 3007 | **Role-gated** at login + JWT (Admin only) — not hidden behind a compose profile |
| text2sql-agent | 3005 | Powers meal history chat ("What did I eat yesterday?") |

**Optional profile:** `monitor` adds `diagnostic-monitor` (port 3099) — on-demand checks via `scripts/diagnostics.mjs` (no automatic interval runs).

**Mobile / Expo:** not offered as a Compose service. Use **`pnpm dev:mobile`** on the host.

## Resource limits (Task 10 → Task 12 re-measure)

Task 10 baseline (tester profile, 9 app containers): ~257 MiB idle RSS; compose memory ceiling ≈ **2.6 GiB**.

Task 12 default (11 app containers, includes text2sql + admin-portal): re-measure after `docker compose up -d`:

```bash
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"
```

Expected incremental cost vs Task 10 tester profile: **text2sql-agent ~20–30 MiB**, **admin-portal ~35 MiB** idle (from Task 10 notes). Full default ceiling ≈ **3.2 GiB** (sum of limits unchanged from old `full` profile).

| Tier | Services | Memory limit | CPU limit | Notes |
|------|----------|--------------|-----------|-------|
| postgres | postgres | 512M | 1.0 | `shared_buffers=128MB`, `max_connections=40` |
| redis | redis | 64M | 0.25 | `maxmemory 64mb`, `allkeys-lru` (audit log cache only) |
| xs | graphdb-agent | 128M | 0.25 | Smallest agent (~14 MiB idle) |
| sm | vision, nutrition, text2sql | 256M | 0.5 | ~20–30 MiB idle |
| md | rag, orchestrator, api-gateway | 384M | 0.5 | Peak ~41 MiB orchestrator under chat |
| portal | user-portal, admin-portal | 384M | 0.5 | Next.js ~35 MiB idle |

**Compose memory ceiling (sum of limits):** default stack ≈ **3.2 GiB** (all services always on).

**Light DB pool:** `DATABASE_URL` includes `connection_limit=3` per Prisma service (5 services → ≤15 connections; postgres `max_connections=40`).

**Node heap:** `NODE_OPTIONS=--max-old-space-size=N` per tier (128–384 MB) in compose `environment` — no code changes.

## Ongoing diagnostics (Task 11/12)

Functional monitoring lives in `scripts/diagnostics.mjs` — **not** inside the 9 backend services.

| Command | Purpose |
|---------|---------|
| `node scripts/diagnostics.mjs --once` | Single functional sweep; exit 1 if unhealthy |
| `node scripts/diagnostics.mjs --serve` | HTTP server only — run checks with `POST :3099/diagnostics/run` |
| `GET :3099/diagnostics/status` | Last completed report (null until first run) |
| `COMPOSE_PROFILES=monitor docker compose up -d diagnostic-monitor` | Idle monitor in Docker; POST to run |

Checks: postgres via real API query, redis via audit-log path, gateway health/DB, vision mock (no image), graphdb, admin 403 guard. **No OpenRouter / LLM calls.** Requires **2 consecutive failures** (`DIAGNOSTIC_FAILURE_THRESHOLD`) before flagging. HTTP requests abort after `DIAGNOSTIC_FETCH_TIMEOUT_MS` (default 10000). Set `DIAGNOSTIC_DISABLED=true` to no-op runs.

Unit tests: `node --test scripts/diagnosticChecks.test.mjs`

## Compose: pull vs build (Task 8.4)

| Command | When to use |
|---------|-------------|
| `docker compose up -d` | Pull pre-built images from Docker Hub (`DOCKERHUB_NAMESPACE` / `IMAGE_TAG` in `.env`) |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d` | Build all app services from source (`pull_policy: build` in the dev override) |

Base file @docker-compose.yml defines `image:` + runtime config only. @docker-compose.dev.yml adds `build:` blocks for local development.

**Default stack:** all services including text2sql-agent and admin-portal — see [Default stack (Task 12)](#default-stack-task-12). Admin access is JWT role-based, not compose-gated.
