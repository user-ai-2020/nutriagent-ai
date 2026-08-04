# Infrastructure

GCP deployment for NutriAgent AI — Cloud Run (9 services + a migration job),
Cloud SQL (Postgres 16 + pgvector), Memorystore Redis, Cloud Storage, Secret
Manager, Artifact Registry.

```
infra/gcp-setup.sh                one-time: APIs, VPC, Cloud SQL, Redis, bucket, secrets, IAM
infra/deploy-services.sh          create/update the 9 Cloud Run services
infra/run-migrations.sh           schema + checkpoint tables + seed (Cloud Run Job)
docker/migrate.Dockerfile         image behind the migration job
.github/workflows/gcp-deploy.yml  build → push → migrate → roll out on every push
```

`infra/terraform/main.tf` is kept for reference but is **not** the deployment
path — the shell scripts above create the same resources with plain `gcloud`.

## Architecture on GCP

| Component | Service | Ingress |
|---|---|---|
| user-portal (3008), admin-portal (3007) | Cloud Run | public |
| api-gateway (3000) | Cloud Run | public |
| orchestrator, vision, nutrition, rag, text2sql, graphdb | Cloud Run | **internal only** |
| Postgres + pgvector | Cloud SQL | **private IP** (VPC connector) |
| Redis (audit cache) | Memorystore | private |
| Meal images | Cloud Storage | private + signed URLs |

The six agents are not publicly invokable — only the gateway and portals are.

## Cost

Always Free covers Cloud Run (2M req/month), Cloud Storage (5GB), Secret Manager
and Cloud Build. **Cloud SQL and Memorystore are not free** and bill from day one
(~$25–30/mo and ~$35/mo respectively); the $300 new-customer credit is what covers
them. (An earlier config claimed `db-f1-micro` was "free tier eligible" — it is not.)

To cut the Redis cost, delete the instance and drop `REDIS_URL` from the gateway:
`getRedis()` returns `null` when it is unset and audit writes fall back to
Postgres, which is the source of truth anyway.

---

## One-time setup

### 1. Prerequisites

`gcloud` installed and authenticated, billing enabled on the project.

```bash
gcloud auth login
gcloud config set project nuitri-agent
```

### 2. Provision infrastructure

One script creates everything: APIs, Artifact Registry, VPC + connector, private
Cloud SQL, Redis, bucket, Secret Manager entries, service accounts and IAM.
Re-runnable — every step checks for existing resources first.

```bash
chmod +x infra/*.sh

GITHUB_REPO=<owner>/<repo> \
OPENROUTER_API_KEY=sk-or-v1-... \
FDC_API_KEY=... \
  ./infra/gcp-setup.sh
```

The DB password and JWT secret are generated inside the script and written
straight to Secret Manager — they are never printed or stored locally. Passing
`GITHUB_REPO` also sets up Workload Identity Federation so CI can deploy without
a long-lived JSON key.

The script finishes by printing the three GitHub secrets to add under
**Settings → Secrets and variables → Actions**:

| Secret | Example |
|---|---|
| `GCP_PROJECT_ID` | `nuitri-agent` |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@nuitri-agent.iam.gserviceaccount.com` |
| `GCP_WIF_PROVIDER` | `projects/<NUM>/locations/global/workloadIdentityPools/github/providers/github` |

### 3. Build and push images

```bash
git push origin main
```

The **GCP Deploy** workflow builds all 10 images (9 services + `migrate`) and
pushes them to Artifact Registry. Watch it in the Actions tab.

To build one by hand instead:

```bash
gcloud auth configure-docker me-west1-docker.pkg.dev
docker build -f services/api-gateway/Dockerfile \
  -t me-west1-docker.pkg.dev/nuitri-agent/nutriagent/nutriagent-api-gateway:latest .
docker push me-west1-docker.pkg.dev/nuitri-agent/nutriagent/nutriagent-api-gateway:latest
```

### 4. Create the Cloud Run services

```bash
./infra/deploy-services.sh          # or: ./infra/deploy-services.sh <git-sha>
```

Deploys in dependency order — agents, then orchestrator, then gateway, then
portals — because each tier needs the previous tier's generated URL. Agents are
created with `--ingress=internal --no-allow-unauthenticated`, so they are not
reachable from the internet. Prints the portal URLs when it finishes.

Re-run this only when service *configuration* changes (env vars, memory,
ingress). Routine code deploys are handled by CI, which just swaps the image.

### 5. Migrate and seed

```bash
./infra/run-migrations.sh           # schema + LangGraph checkpoint tables
./infra/run-migrations.sh seed      # demo users / roles / knowledge docs
```

Runs as a Cloud Run Job **inside the VPC** — required because Cloud SQL has no
public IP, so neither your laptop nor GitHub Actions can reach it directly.

Uses `prisma migrate deploy` (never `migrate dev`): non-interactive, and it will
not offer to reset the database. It also creates the LangGraph checkpoint tables —
without them the vision interrupt/resume path fails at runtime.

### 6. USDA import (optional)

`local_foods` powers the "calories in X" fast path. The CSVs are ~36MB and are
excluded from the Docker build context, so import from your machine through the
Cloud SQL Auth Proxy:

```bash
cloud-sql-proxy nuitri-agent:me-west1:nutriagent-db --port 5433 &
DATABASE_URL="$(gcloud secrets versions access latest --secret=nutriagent-database-url \
  | sed 's/@[0-9.]*:/@127.0.0.1:/')" pnpm db:ingest:usda
```

Without it, nutrition lookups fall back to the live FDC API (needs `FDC_API_KEY`)
or skip entirely.

---

## Production checklist

- [x] `MEAL_IMAGE_STORAGE=gcs` — `local` is an unauthenticated public file route
- [x] `JWT_SECRET` from Secret Manager, not the `dev-secret-change-me` default
- [x] Cloud SQL private IP only (no `0.0.0.0/0`)
- [x] Agents on internal ingress
- [x] Bucket public-access-prevention enforced + signed URLs
- [x] Deletion protection on the database + daily backups
- [x] Language cookie gets `Secure` over HTTPS (both portals), still omitted on
      plain-HTTP localhost so local dev keeps working
- [ ] Custom domain + HTTPS load balancer (Cloud Run URLs are fine for a demo)
- [ ] Budget alert so the $300 credit does not run out unnoticed

## Rollback

Cloud Run keeps every revision:

```bash
gcloud run revisions list --service nutriagent-api-gateway --region me-west1
gcloud run services update-traffic nutriagent-api-gateway \
  --region me-west1 --to-revisions <REVISION>=100
```

Note that a schema migration is **not** rolled back by reverting a revision.

## Related docs

- Root [README](../README.md) — local development
- [`docs/TASKS.md`](../docs/TASKS.md) — environment variables reference
- [`docs/database-schema.md`](../docs/database-schema.md) — entity overview
