# NutriAgent AI — Agent Standing Instructions

> **Tooling co-existence:** This repo is developed with **both Cursor and Google Antigravity**.
> Antigravity reads `AGENTS.md` and `.agents/skills/*/SKILL.md`. Cursor keeps its own rules/config.
> **Never delete, replace, or "clean up" Cursor configuration** (`.cursor/`, `.cursorrules`, etc.)
> to make room for Antigravity — the two toolchains share the same source, git history, and Docker stack.

## Architecture (one sentence)

pnpm monorepo: **3 apps** + **6 AI/agent services** + **API gateway** + shared packages, orchestrated via Docker Compose (Postgres/pgVector + Redis).

### Apps (3)

| App | Path | Port |
|---|---|---|
| User Portal (Next.js) | `apps/user-portal` | **3008** |
| Admin Portal (Next.js) | `apps/admin-portal` | **3007** |
| Mobile (Expo) | `apps/mobile` | 8081 |

### Backend services (7 Node processes)

| Service | Path | Port |
|---|---|---|
| API Gateway | `services/api-gateway` | 3000 |
| Orchestrator | `services/orchestrator` | 3001 |
| Vision Agent | `services/vision-agent` | 3002 |
| Nutrition Agent | `services/nutrition-agent` | 3003 |
| RAG Agent | `services/rag-agent` | 3004 |
| Text2SQL Agent | `services/text2sql-agent` | 3005 |
| GraphDB Agent | `services/graphdb-agent` | 3006 |

### Shared packages

- `packages/db` — Prisma schema, migrations, seed
- `packages/shared` — types, auth cookie helpers, locales, storage

### Compose files

| File | Role |
|---|---|
| `docker-compose.yml` | Default stack (pull Hub images / full tester stack) |
| `docker-compose.dev.yml` | Overlay: build all app images from source |
| `docker/` | Dockerfiles, resource notes (`docker/README.md`) |

Deep feature docs: `docs/TASKS.md`. Human quick-start: `README.md`.

## Essential commands

```bash
# Tester / grader stack
cp .env.tester.example .env   # set DOCKERHUB_NAMESPACE + OPENROUTER_API_KEY
docker compose up -d

# Developer: build from source
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Local Node (optional)
pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed
```

Windows note: enable Corepack/`pnpm` on PATH the same way as Cursor (Task 13). Antigravity’s integrated terminal on the same machine inherits the same PATH.

Demo: `user@nutriagent.ai` / `user123` (3008); `admin@nutriagent.ai` / `admin123` (3007).

## Non-negotiable verification rules

Full playbook: skill **`nutriagent-live-verify`** (`.agents/skills/nutriagent-live-verify/SKILL.md`). Mirror also at `.antigravity/SKILL.md`.

1. **Verify against a live container**, not only source or host build logs (Prisma client, RTL CSS, locale JSON in `.next` — bugs that only show after `docker exec` / `grep` inside the running image).
2. **“Fixed” requires direct evidence** — screenshot, real `curl` output, or grep of the compiled artifact in the live container. “I changed the code” is not proof.
3. **Timeouts:** no unbounded external calls (OpenRouter, RAG web-fallback) may block the UI. Bound agent/RAG latency below frontend timeouts (historical bug: ~90s RAG vs ~15s UI).
4. **Commit before rebuild** — uncommitted locale/config changes do not survive image rebuilds. Important fixes must be in git.
5. **No test placeholders as production data** — strings like `"Nothing"` / `"unknown"` from no-food-detection tests must not be persisted as real meals.

## Antigravity operating mode (Manager / autonomy)

- Prefer **Review-driven** or **Agent-assisted** — **not** full Autopilot.
- Stop for human review at checkpoints (same approval culture that worked in Cursor).
- History shows why: Prisma regressions and an unsolicited admin-portal merge happened under too much autonomy.
- For every Antigravity task, request an **Artifact** with a real screenshot and/or terminal transcript — complements Cursor checkpoints; does not replace them.

## Models

No single “official” model for the repo. Use Gemini / Claude / GPT-OSS (or Cursor) per task convenience. Keep Cursor and Antigravity both valid on this tree.

## Do not

- Do not delete or rewrite Cursor-only config to “migrate” the project.
- Do not change Docker / Next / Express / Prisma “for Antigravity” — the app stack stays as-is.
- Do not claim a UI or i18n fix without live-container evidence.
