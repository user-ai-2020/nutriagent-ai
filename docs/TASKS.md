# Technical Reference

Full detail behind every feature. If you just want to run the app, see the [main README](../README.md).

## Contents

- [Environment variables](#environment-variables)
- [Task 1 — Meal image storage](#task-1--meal-image-storage)
- [Task 2 — Text2SQL agent](#task-2--text2sql-agent)
- [Task 3 — Synthetic demo data](#task-3--synthetic-demo-data)
- [Task 3.1 — Daily steps table](#task-31--daily-steps-table)
- [Task 4 — RAG pipeline](#task-4--rag-pipeline)
- [Task 5 — Hebrew language support](#task-5--hebrew-language-support)
- [Task 6 — User language preference](#task-6--user-language-preference)
- [Task 7 — Static UI translation](#task-7--static-ui-translation)
- [Vision reranker fusion](#vision-reranker-fusion)

---

## Environment variables

Copy the template, then edit for your machine: `cp .env.example .env`. All services read the root `.env`.

### Database & cache

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | `postgresql://nutriagent:nutriagent@localhost:5433/nutriagent` locally |
| `REDIS_URL` | No | — | `redis://localhost:6379`; Redis features skip if unset |

### Auth

| Variable | Required | Default |
|---|---|---|
| `JWT_SECRET` | Prod | `dev-secret-change-me` |
| `JWT_EXPIRES_IN` | No | `7d` |

### OpenRouter / LLM

| Variable | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | No key = mock mode, sample data |
| `OPENROUTER_MODEL` | `openai/gpt-4o` | Chat/completion |
| `OPENROUTER_VISION_MODEL` | `openai/gpt-4o` | Meal photo recognition |
| `OPENROUTER_RERANK_MODEL` | `cohere/rerank-4-fast` | RAG + vision fusion |

### Service URLs (local dev)

| Variable | Default |
|---|---|
| `ORCHESTRATOR_URL` | `http://localhost:3001` |
| `VISION_AGENT_URL` | `http://localhost:3002` |
| `NUTRITION_AGENT_URL` | `http://localhost:3003` |
| `RAG_AGENT_URL` | `http://localhost:3004` |
| `TEXT2SQL_AGENT_URL` | `http://localhost:3005` |
| `GRAPHDB_AGENT_URL` | `http://localhost:3006` |

### Meal image storage

| Variable | Default | Notes |
|---|---|---|
| `MEAL_IMAGE_STORAGE` | `local` | `local` (dev) or `gcs` (prod) — **never `local` in production** |
| `MEAL_IMAGE_STORAGE_PATH` | `storage/meal-images` | Dev only |
| `GCS_MEAL_IMAGES_BUCKET` | — | Required in prod; set by Terraform |
| `MEAL_IMAGE_SIGNED_URL_TTL_SECONDS` | `1800` | Clamped 900–3600 (15–60 min) |

### RAG agent

| Variable | Default | Notes |
|---|---|---|
| `EMBEDDING_MODEL` | `intfloat/multilingual-e5-large` | Hebrew + English |
| `EMBEDDING_DIMENSIONS` | `1024` | Must match the model — see [caveat](#embedding-dimension-is-fixed) |
| `DEFAULT_RESPONSE_LANGUAGE` | `he` | Fallback when no user preference |
| `RAG_CACHE_DAYS` | `7` | Scraped content cache |
| `RAG_SCRAPE_RATE_LIMIT_PER_MIN` | `10` | Per domain |
| `RAG_PIPELINE_TIMEOUT_MS` | `90000` | Full `/query` wall clock |
| `RAG_FETCH_TIMEOUT_MS` | `15000` | Per HTTP fetch |
| `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_CX` | — | Missing either → falls back to DuckDuckGo HTML search |

### Text2SQL

| Variable | Default |
|---|---|
| `TEXT2SQL_MAX_ROWS` | `500` |
| `TEXT2SQL_TIMEOUT_MS` | `5000` |
| `TEXT2SQL_DEBUG_SQL` | `false` |

### Client apps

| Variable | Default |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` (user-portal, admin-portal) |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` (mobile) |

---

## Task 1 — Meal image storage

Photos are never stored full-size. On upload: resize to **512px** long edge, JPEG ~78%, sha256 hash for dedup. File goes to object storage (local disk in dev, GCS in prod); only metadata lives in Postgres (`meal_images` table).

| Mode | Files go to | URLs |
|---|---|---|
| Local (dev) | `services/api-gateway/storage/meal-images/` | Unauthenticated static route — dev only |
| Production (`gcs`) | Private GCS bucket | Signed URLs, 15–60 min TTL |

**Don't deploy with `MEAL_IMAGE_STORAGE=local`** — it's an unauthenticated public file route.

**Security:** per-user storage paths (no cross-user file collisions), `content_hash` indexed but not unique, re-recognize endpoint checks `meal.userId === currentUserId` before load/mutate (IDOR-safe).

Re-run recognition on a stored thumbnail:
```http
POST /api/meals/:mealId/images/:imageId/re-recognize
```

Optional GCS retention: set `meal_image_retention_days` in Terraform (default 365, `0` disables).

---

## Task 2 — Text2SQL agent

Natural-language history questions → `services/text2sql-agent` (port 3005).

**Pipeline:** LLM generates SELECT-only SQL from an allowlisted schema → `validateSQL` (node-sql-parser) blocks DML/DDL, enforces table whitelist, auto-injects `user_id` (parenthesized so `OR`-injection can't bypass it), caps `LIMIT` at 500 → `executeSQL` runs with a server-side `statement_timeout` → second LLM call turns rows into a natural-language answer.

```http
POST http://localhost:3005/query
{ "userId": 1, "question": "How many calories did I eat this week?", "includeSql": false }
```

**Guarantees:** read-only only; user-scoped (server-injected, not LLM-controlled); table whitelist enforced even inside subqueries/JOINs/UNIONs; bounded (500 rows, 5s timeout); every query audited.

```bash
corepack pnpm --filter @nutriagent/text2sql-agent test
```

---

## Task 3 — Synthetic demo data

`pnpm db:seed:demo` generates realistic meal history for dashboard/Text2SQL testing (requires `pnpm db:seed` first).

```bash
pnpm db:seed:demo
pnpm db:seed:demo -- --days 14 --seed 99 --userId 2
```

| Flag | Default | Validation |
|---|---|---|
| `--userId` | `user@nutriagent.ai` | Must exist |
| `--days` | `30` | Positive, max 366 |
| `--seed` | `42026` | Same seed → identical data (deterministic) |

**Idempotent** — re-running deletes only that user's `source = 'synthetic-demo'` rows in the date range first, from both `meals` and `daily_steps`.

**Heads up:** seeded `MealImage` rows have plausible metadata but **no real file behind them** — re-recognize/thumbnails will fail on demo data unless you upload real photos.

---

## Task 3.1 — Daily steps table

Step history lives in `daily_steps` (unique on `user_id, date`), queryable by Text2SQL and the dashboard.

```bash
pnpm db:migrate
pnpm db:backfill:daily-steps   # idempotent — migrates old profile.dietGoals.stepsByDate JSON into the table
```

**Assumption:** `db:seed:demo` should only target demo/dev users — running it on a user who already has real (`source != 'synthetic-demo'`) step data in the same date range would overwrite it.

---

## Task 4 — RAG pipeline

### Schema

`rag_documents` (source metadata, status: `pending`/`ready`/`failed`) + `rag_chunks` (text + `embedding vector(1024)` + `tsv tsvector`), with an HNSW index on the vector column and GIN on the tsvector.

<a id="embedding-dimension-is-fixed"></a>
**⚠️ The embedding dimension (1024) is fixed at the DB level.** Changing `EMBEDDING_DIMENSIONS` in `.env` does not resize the column — mismatches fail at insert time. Changing embedding models to a different dimension requires a new migration (`ALTER COLUMN ... TYPE vector(N)`) *and* re-embedding every existing chunk.

### Hybrid search

One SQL query fuses vector similarity (cosine) and keyword search (`ts_rank`) via RRF for *ranking*, but the **80% match gate uses absolute signal strength**, not rank — `100 × (1 - (1-v)(1-k))`, so a strong vector match isn't penalized by a weak keyword score, but two weak signals don't compound into a false-positive high score.

### Fallback loop

```json
POST /query  { "question": "כמה חלבון מומלץ ביום?" }
```

1. Embed question → hybrid search
2. `matchScore >= 80` → answer with citations, done
3. Otherwise, web fallback (max 2 rounds): search whitelisted domains only → fetch full articles (not snippets) → respect robots.txt + rate limits → chunk/embed/store → re-search
4. Still below 80% → answer with a disclaimer + partial sources

**Trusted search:** PubMed via official E-utilities API always; NIH/CDC/WHO/Nutrition.gov via Google Custom Search API when `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_CX` are set, otherwise an unofficial DuckDuckGo HTML fallback (logs one warning per process, degrades gracefully if DDG's markup changes).

**Orchestrator routing:** only `nutrition_advice` uses the full `/query` pipeline (with fallback); other intents use the faster `/retrieve` (hybrid search only, no live scraping mid-conversation).

**Timeouts:** `RAG_PIPELINE_TIMEOUT_MS` (whole request) and `RAG_FETCH_TIMEOUT_MS` (per fetch) — exceeding the pipeline timeout currently returns a raw HTTP 500 (known polish item: should return the same weak-match disclaimer instead).

---

## Task 5 — Hebrew language support

| Area | How |
|---|---|
| Embeddings | `intfloat/multilingual-e5-large` — same model for queries and stored chunks |
| Full-text search | `to_tsvector('simple', ...)` — no Hebrew stemmer, but works for token matching |
| Chunking | Whitespace-aware splitting — doesn't break mid-word on Hebrew or Latin text |
| Response language | Hebrew-script detection **always wins** over statistical detection (`franc-min`) for short queries; `preferredLanguage` profile override |
| System prompts | RAG, Text2SQL, and Nutrition agents all explicitly instructed to answer in the detected/preferred language |

---

## Task 6 — User language preference

Lets users persist Hebrew or English for AI responses, with real UI direction (RTL) to match — not just translated text in an LTR container.

- **Schema:** `user_profiles.preferred_language` (nullable `he`/`en`)
- **API:** `PATCH /api/users/me/language` — JWT-scoped only (never trusts a `userId` in the body), strict validation, upserts the profile
- **Toggles:** Settings tab (mobile), Settings page (user portal), sidebar (admin portal)
- **RTL:**
  - Mobile: `I18nManager.forceRTL()` — requires an app reload, so the toggle shows a confirmation alert first
  - Web (both Next.js apps): **cookie-based SSR** — the server reads the `preferredLanguage` cookie and sets `<html lang dir>` on the *first* response, so there's no flash of the wrong direction before hydration
- **Production note:** add the `Secure` flag to the language cookie when serving over HTTPS (dev uses plain `SameSite=Lax`)

Verify the SSR direction fix is working:
```bash
curl -s -H "Cookie: preferredLanguage=he" http://localhost:3008/ | head -c 200
# expect: <html lang="he" dir="rtl" ...
```

---

## Task 7 — Static UI translation

Task 6 built the *mechanism* for choosing a language; Task 7 translates the actual hardcoded UI text (tab names, buttons, system messages) using `react-i18next`, sharing locale files from `packages/shared/src/locales/{en,he}.ts`.

- **Missing-key protection:** a lint step fails the build if any `t('key')` call references a key missing from either locale file — you get a build error, not a raw `t('key')` string shown to a user.
- **RTL stays owned by Task 6** — i18n only swaps text content; document direction still comes from the cookie/`I18nManager`, never from the translation library. This is checked on every change via an automated script:
  ```bash
  pnpm verify:ssr-rtl
  ```
- **Coverage today:** nav tabs, chat, auth, settings, summary, meal analysis, admin shell/users, mobile tabs/auth. Dashboard and nutrients pages still show English body copy (tab titles only are translated) — tracked as a follow-up, not silently incomplete.

**Adding a new string:** add the same key to both `en.ts` and `he.ts`, use `t("your.key")` in code, then run `pnpm lint:i18n && pnpm test:i18n` before opening a PR.

---

## Vision reranker fusion

When a meal photo goes through 3 vision models, the reranker decides the final item list and hands it to the nutrition agent.

- **Cluster-first:** candidate labels are grouped by food identity *before* ranking (fixed a bug where e.g. "blueberries on pancakes" falsely matched "pancakes" via substring overlap)
- **Portion fusion:** median gram estimate across agreeing models (resists outliers better than a mean)
- **Canonical label:** highest Cohere relevance score within a cluster, not just whichever source model was most confident in its own guess
- **`fusionMethod` on the response** (`full` / `cluster_no_rerank` / `single_model_fallback` / `empty_pool_fallback`) — the UI shows a "consensus unavailable" badge whenever a result wasn't a genuine multi-model fusion, so it's never presented as more reliable than it is

---

## Backlog

- **Orchestrator meal path HTTP 500 on empty vision output** (surfaced during Task 10 load testing): when vision returns no identifiable items (e.g. trivial/unrecognizable test image), `POST /process` returns 500 instead of a graceful empty/low-confidence response — investigate graceful degradation (outside Task 10 scope).

