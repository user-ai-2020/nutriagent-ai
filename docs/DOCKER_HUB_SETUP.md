# Docker Hub setup (Task 8.5)

CI publishes pre-built app images on every push to `main`. Consumers pull them via `docker compose up` (see README Quick Start).

## 1. Docker Hub account or organization

1. Create a [Docker Hub](https://hub.docker.com/) account, or use an existing org.
2. Note the **namespace** (username or org name). This becomes `DOCKERHUB_NAMESPACE` in your local `.env`.

Image names match @docker-compose.yml:

```text
<namespace>/nutriagent-<service>:<tag>
```

Nine repositories are created automatically on first push (e.g. `nutriagent-rag-agent`, `nutriagent-api-gateway`, …).

## 2. Access token (not account password)

Docker Hub recommends access tokens for CI:

1. Docker Hub → **Account Settings** → **Security** → **New Access Token**
2. Description: e.g. `nutriagent-github-actions`
3. Permissions: **Read, Write, Delete** (write for push; delete optional but useful for cache tags)
4. Copy the token — it is shown once.

## 3. GitHub repository secrets

In the GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub namespace (username or org) |
| `DOCKERHUB_TOKEN` | The access token from step 2 |

Do not commit these values. The workflow @.github/workflows/docker-publish.yml references them only via `${{ secrets.* }}`.

## 4. Local `.env` for pulling

After the first successful CI run on `main`:

```bash
cp .env.example .env
# set DOCKERHUB_NAMESPACE to the same namespace as DOCKERHUB_USERNAME
# optionally pin a release: IMAGE_TAG=<7-char git SHA from CI>
docker compose up -d
```

## 5. What CI publishes

Workflow: @.github/workflows/docker-publish.yml

- **Trigger:** push to `main` only (not pull requests)
- **Parallel matrix:** all 9 app services build concurrently
- **Tags per service:** `:latest` and `:<short-git-sha>` (7 characters)
- **Registry cache:** `:<service>:buildcache` on the same Docker Hub repo (internal CI cache tag)

## 6. Verify after setup

1. Merge or push to `main` with secrets configured.
2. Check **Actions** → **Docker Publish** — 9 matrix jobs should succeed.
3. On Docker Hub, confirm images such as `nutriagent-rag-agent:latest` and `nutriagent-rag-agent:<sha>`.
4. Locally: set `DOCKERHUB_NAMESPACE`, run `docker compose pull` then `docker compose up -d`.

**Note:** Task 8.4 verified the pull path against a local `registry:2` container. Real Docker Hub behavior (auth, rate limits, manifest handling) is only confirmed after this setup.
