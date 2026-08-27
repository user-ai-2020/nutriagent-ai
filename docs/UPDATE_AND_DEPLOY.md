# Updating the code and getting it onto the GCP VM

This is the loop you'll repeat every time something changes: edit locally → push to
GitHub → CI builds new Docker images → pull those images onto the VM and restart.
Four stages, each on a different machine. Knowing which machine you're on for each
step is the whole trick.

```
Your PC  →  GitHub (main)  →  GitHub Actions (builds images)  →  Docker Hub  →  GCP VM (pulls + restarts)
 edit          push               ~8–12 min, automatic            stores          git pull && ./deploy.sh
```

---

## Stage 1 — Edit and commit (your PC)

In the project folder (`C:\Users\nik\Desktop\nikol\COURSE_JOHN_BRYCE\NuitriAgent AI`), a normal PowerShell terminal:

```powershell
git add -A
git commit -m "describe what changed"
git push
```

**Two things that have bitten us in this exact repo, both fixed the same way:**

- **`fatal: Unable to create '.../.git/index.lock': File exists.`**
  Some other process (usually an IDE's git panel, or a crashed `git` command) is
  holding a stale lock. Close VS Code / GitHub Desktop / any other tool touching
  this repo, then:
  ```powershell
  Remove-Item ".git\index.lock" -Force
  git status   # should now run cleanly
  ```
  Re-run `git add` / `git commit` / `git push` after that.

- **`warning: LF will be replaced by CRLF...`**
  Harmless. Windows line-ending normalization, not a real change. Ignore it.

**Confirm the push actually landed** before moving on — `git push` should end with
something like:
```
   b3bbcab..b01f58c  main -> main
```
If it instead says `Everything up-to-date`, nothing was pushed — check `git log -1`
and `git status` first.

---

## Stage 2 — CI builds new images (automatic, ~8–12 minutes)

Every push to `main` triggers **Docker Publish**
(`.github/workflows/docker-publish.yml`), a 10-job matrix that rebuilds all 9 app
images plus the `migrate` image and pushes them to Docker Hub as `:latest`.

Watch it here: <https://github.com/user-ai-2020/nutriagent-ai/actions>

Don't skip this — if you deploy to the VM before this finishes, the VM will pull
the *previous* `:latest` image, and your change won't actually be live even though
`git pull` succeeded. Wait for the green checkmark.

---

## Stage 3 — Deploy to the VM

Get into the VM. Easiest path is Cloud Shell, which has `gcloud` pre-authenticated:

```bash
gcloud compute ssh nutriagent-prod --zone=me-west1-a --project=nuitri-agent
```

Once you're on the VM:

```bash
cd ~/nutriagent
git pull
./deploy.sh
```

- `git pull` updates the *compose files and scripts* on the VM (these are read
  from disk, not pulled from Docker Hub — matters if you changed
  `docker-compose.prod.yml`, `deploy.sh`, migrations, etc.)
- `./deploy.sh` pulls the fresh `:latest` images from Docker Hub, runs any new
  database migrations, and restarts the stack.
- `./deploy.sh` also **prunes unused Docker images and build cache** before and
  after the pull so a 20 GB boot disk does not fill up over repeated deploys
  (Postgres volumes are never removed). Skip with `SKIP_DOCKER_PRUNE=1 ./deploy.sh`.

Run it **without `sudo`** — it elevates only where it needs to.

### Free disk space on the VM

Automatic prune in `./deploy.sh` handles normal updates. If `./deploy.sh` still
fails while pulling with:

```text
failed to copy: ... no space left on device
```

the boot disk is full. Nine app images plus Postgres layers add up quickly; every CI
push to `main` leaves old `:latest` layers behind unless you prune them.

**Check:**

```bash
df -h /
docker system df
```

On a tight 20 GB disk you'll often see `/` at **99%** and several GB listed as
**Reclaimable** under Images. Docker stores most data under `/var/lib/containerd`
(not `/var/lib/docker`), so `du -sh /var/lib/docker` may show almost nothing — that
is normal.

**Fix (keeps Postgres data — do not pass `--volumes`):**

```bash
cd ~/nutriagent

docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker system prune -a -f
docker builder prune -a -f

df -h /
docker system df
```

You want **at least 3–4 GB free** before pulling again. A successful prune often
reclaims **8–12 GB**. Then:

```bash
./deploy.sh
```

**`docker system prune` looks stuck?** On a 99%-full disk it can run **5–15 minutes**
with no output. Don't Ctrl+C immediately — open a second SSH session and watch
`df -h /` until `Avail` grows. If nothing changes for 20+ minutes, Ctrl+C and
remove NutriAgent images directly:

```bash
docker images 'userai124356/nutriagent-*' -q | xargs -r docker rmi -f
docker system prune -f
df -h /
```

**Longer-term:** resize the boot disk to **30 GB** in the GCP console (stop VM →
edit disk → start VM → `sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1`).
See [docs/DEPLOY_VM.md](DEPLOY_VM.md) for VM sizing notes.

---

## Stage 4 — Verify

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Every service should read `healthy`. If you changed something in `migrate`
(a new Prisma migration, an RLS grant, etc.), check it actually ran:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs migrate
```

Then check the actual app:

| | |
|---|---|
| User app | http://34.165.44.201:3008 |
| Admin app | http://34.165.44.201:3007 |
| API health | http://34.165.44.201:3000/health |

Log in (`user@nutriagent.ai` / `user123`) and exercise whatever you just changed.

---

## Quick reference (once you've done it once)

```powershell
# 1. Your PC
git add -A && git commit -m "..." && git push

# 2. Wait for green checkmark:
#    https://github.com/user-ai-2020/nutriagent-ai/actions

# 3. On the VM (via Cloud Shell: gcloud compute ssh nutriagent-prod --zone=me-west1-a)
cd ~/nutriagent && git pull && ./deploy.sh   # deploy.sh prunes old Docker layers automatically

# 4. Verify
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

---

## If something's wrong and you need to debug on the VM

```bash
D="-f docker-compose.yml -f docker-compose.prod.yml"
docker compose $D ps                          # what's unhealthy?
docker compose $D logs --tail=60 <service>     # e.g. api-gateway, orchestrator, text2sql-agent
docker compose $D exec postgres psql -U nutriagent -d nutriagent   # inspect the DB directly
```

Full deployment reference (VM sizing, firewall, secrets, free-tier notes):
[docs/DEPLOY_VM.md](DEPLOY_VM.md).
