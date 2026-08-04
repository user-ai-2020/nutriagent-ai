# Deploying NutriAgent to a Google Cloud VM

Single Compute Engine VM running the whole stack with Docker Compose. Simpler and
cheaper than Cloud Run for a course demo — one machine, one `deploy.sh`.

For the Cloud Run alternative (autoscaling, private Cloud SQL, internal service
ingress) see [`infra/README.md`](../infra/README.md).

---

## Before you start: machine size

This is the one place the common "free tier e2-micro" guide does not transfer.
That guide assumes 2 containers; NutriAgent runs **11**.

| Container | Memory limit |
|---|---|
| postgres | 1024 MB |
| redis | 64 MB |
| vision-agent | 256 MB |
| graphdb-agent | 128 MB |
| nutrition-agent | 256 MB |
| rag-agent | 384 MB |
| text2sql-agent | 256 MB |
| orchestrator | 384 MB |
| api-gateway | 384 MB |
| user-portal | 384 MB |
| admin-portal | 384 MB |
| **Total** | **≈ 3.8 GB** (+ ~250 MB OS) |

| Machine | RAM | Verdict |
|---|---|---|
| e2-micro | 1 GB | **Will not start** — free tier, but far too small |
| e2-small | 2 GB | OOM-kills under load even with swap |
| **e2-medium** | **4 GB** | **Recommended** — ~$27/mo, the $300 credit covers ~11 months |

`deploy.sh` warns and pauses if it detects under 3.5 GB, and adds 2 GB of swap
either way, since Docker builds and Next.js SSR spike above steady state.

**Want to stay on free-tier e2-micro?** Not possible with the full stack. You
would have to drop the admin portal, Redis, and at least three agents — which
removes most of what the project demonstrates. Paying ~$27/mo from the credit is
the better trade.

---

## Stage 1 — Prepare the code (already done)

The repository is container-ready:

- `Dockerfile` per service (`services/*/Dockerfile`, `apps/*/Dockerfile`)
- `docker-compose.yml` + `docker-compose.prod.yml` (restart policies, DB not exposed)
- `deploy.sh` — installs Docker, adds swap, migrates, seeds, starts
- `.env.production.example` — every variable with safe defaults
- `.env` and `.seeded` are in `.gitignore`, so no secret reaches GitHub

Two notes specific to this project versus the generic guide:

- **No Playwright/Chromium install.** Meal photos go to vision models over the
  OpenRouter API; nothing renders a browser server-side.
- **Services already bind `0.0.0.0`.** Express defaults to all interfaces, and the
  Next.js containers set `HOSTNAME=0.0.0.0`. No change needed.

---

## Stage 2 — GCP project and billing

Use a **separate Google account** for the project if you want to isolate billing
from your personal cards.

1. Create/select a project (e.g. `nuitri-agent`) at <https://console.cloud.google.com>.
2. Enable billing and accept the **$300 / 90-day free trial**. Google authorises
   and refunds ~$1 to verify the card; nothing is charged until you manually
   upgrade to a paid account.
3. To share access: **IAM & Admin → IAM → + GRANT ACCESS**, add your main Gmail,
   role **Basic → Owner**, Save.

Set a **budget alert** (Billing → Budgets & alerts, e.g. $50) so the credit does
not drain unnoticed.

---

## Stage 3 — Create the VM and firewall

### VM

**Compute Engine → VM instances → Create instance**

| Field | Value |
|---|---|
| Name | `nutriagent-prod` |
| Region | `me-west1` (Tel Aviv) or `us-central1` |
| Series / Machine type | **E2 / e2-medium** (4 GB) |
| Boot disk | **Ubuntu 22.04 LTS**, **20 GB** |
| Network tags | `nutriagent` |

Use full Ubuntu LTS rather than Ubuntu Minimal — Minimal omits tooling you will
want when debugging, and the disk saving is irrelevant at 20 GB. 20 GB rather
than 10: Docker images for 9 Node services plus Postgres data fill 10 GB quickly.

### Firewall

**VPC network → Firewall → Create firewall rule**

| Field | Value |
|---|---|
| Name | `allow-nutriagent-ports` |
| Targets | Specified target tags |
| Target tags | `nutriagent` |
| Source IPv4 ranges | `0.0.0.0/0` |
| Protocols and ports | TCP `3000, 3007, 3008` |

Ports map to: `3000` API gateway, `3007` admin portal, `3008` user portal.

**Do not open 5433 or 6379.** `docker-compose.prod.yml` removes the host port
bindings for Postgres and Redis so they stay on the internal Docker network.

Copy the VM's **External IP** from the instances list — you need it in Stage 6.

---

## Stage 4 — Push the code to GitHub

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

Make the repository **Private**.

Then create a token for the VM to clone with: **Settings → Developer settings →
Personal access tokens → Tokens (classic) → Generate new token**, scope **`repo`**
only. Copy the `ghp_…` value.

CI (`.github/workflows/docker-publish.yml`) builds and pushes all 9 images to
Docker Hub on every push to `main`. Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
as repository secrets — the VM pulls those images rather than building locally,
which matters because building the Next.js portals on 4 GB can OOM.

---

## Stage 5 — Connect and clone

Click **SSH** next to the VM in the console.

```bash
sudo apt-get update && sudo apt-get install -y git vim
git clone https://github.com/<you>/<repo>.git ~/nutriagent
cd ~/nutriagent
```

When prompted: username = your GitHub username, password = the `ghp_…` token
(pasted characters stay invisible — that is normal).

---

## Stage 6 — Configure secrets

```bash
cp .env.production.example .env
openssl rand -hex 32     # copy the output for JWT_SECRET
vi .env
```

In `vi`: press `i` to edit, make the changes, press `Esc`, type `:wq`, Enter.

Set at minimum:

| Variable | Value |
|---|---|
| `DOCKERHUB_NAMESPACE` | your Docker Hub username |
| `JWT_SECRET` | the `openssl` output — deployment aborts on the dev default |
| `OPENROUTER_API_KEY` | your key, or leave empty for mock mode |
| `CORS_ORIGIN` | replace `<VM-EXTERNAL-IP>` with the real IP |
| `MEAL_IMAGE_PUBLIC_BASE_URL` | same IP |

---

## Stage 7 — Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

Run it **without `sudo`** — it elevates only where needed and adds your user to
the `docker` group itself.

It will: check RAM, add 2 GB swap, install Docker, validate `.env`, pull images,
run migrations **and create the LangGraph checkpoint tables**, seed demo users on
first run, then start everything. First run takes 10–20 minutes, mostly pulling.

The checkpoint tables matter: without them the vision interrupt/resume path fails
at runtime with `relation "public.checkpoints" does not exist`.

---

## Stage 8 — Verify

Open `http://<EXTERNAL_IP>:3008` and sign in with `user@nutriagent.ai` / `user123`.

Quick checks:

```bash
curl http://<EXTERNAL_IP>:3000/health          # {"status":"ok","service":"api-gateway"}
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

All containers should read `healthy`. Then in the UI: send a chat message, upload
a meal photo, and confirm the Dashboard renders.

There is no `/docs` Swagger page — this is an Express API, not FastAPI. `/health`
is the equivalent liveness check.

---

## Day-to-day

```bash
cd ~/nutriagent
git pull && ./deploy.sh          # deploy a new version

D="-f docker-compose.yml -f docker-compose.prod.yml"
docker compose $D logs -f api-gateway
docker compose $D restart orchestrator
docker compose $D ps
docker compose $D down           # stop everything
```

Database access (no public port):

```bash
docker compose $D exec postgres psql -U nutriagent -d nutriagent
```

USDA import for the `local_foods` fast path:

```bash
docker compose $D run --rm migrate usda
```

---

## Before sharing the URL

- [ ] **Change the demo passwords** — `user123` / `admin123` are public knowledge
- [ ] Ports 3000/3007/3008 are open to `0.0.0.0/0` with **no HTTPS**; traffic,
      including logins, is plaintext. Fine for a class demo, not for real users
- [ ] `MEAL_IMAGE_STORAGE=local` serves uploads over an unauthenticated route —
      switch to `gcs` for anything beyond a demo
- [ ] Set the billing budget alert
- [ ] Stop the VM when idle (`gcloud compute instances stop nutriagent-prod`) —
      billing is per-second while running

For HTTPS and a custom domain, put Caddy or nginx in front of the portals; that is
also what would let the language cookie's `Secure` flag take effect.
