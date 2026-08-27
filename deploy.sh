#!/usr/bin/env bash
#
# One-command deployment onto a fresh Ubuntu VM (Compute Engine).
#
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Run WITHOUT sudo — the script elevates only where needed and adds your user to
# the docker group itself.
#
# What it does:
#   1. installs Docker Engine + compose plugin if missing
#   2. adds swap (the portals need headroom the VM's RAM alone doesn't give)
#   3. checks .env exists and has the keys that matter
#   4. prunes unused Docker images/build cache (keeps volumes — Postgres safe)
#   5. pulls images, runs migrations, starts the stack
#   6. seeds demo users on first run
#   7. prunes again after pull so old :latest layers do not accumulate
#
# Safe to re-run: it is the normal way to deploy a new version.

set -euo pipefail

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
SWAP_SIZE="${SWAP_SIZE:-2G}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
log "Checking memory"
TOTAL_MB=$(free -m | awk '/^Mem:/{print $2}')
info "${TOTAL_MB} MB RAM detected"
if [ "$TOTAL_MB" -lt 3500 ]; then
  echo
  echo "  WARNING: this stack needs ~4 GB (11 containers)."
  echo "  e2-micro (1 GB) and e2-small (2 GB) will OOM under load."
  echo "  Recommended: e2-medium (4 GB). Continuing anyway in 10s — Ctrl+C to stop."
  sleep 10
fi

# ---------------------------------------------------------------------------
log "Swap"
# Docker builds and Next.js SSR spike well above steady-state usage; swap turns
# an OOM-kill into a slowdown.
if swapon --show | grep -q .; then
  info "swap already active"
else
  sudo fallocate -l "$SWAP_SIZE" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  info "added ${SWAP_SIZE} swap"
fi

# ---------------------------------------------------------------------------
log "Docker"
if command -v docker >/dev/null 2>&1; then
  info "docker already installed: $(docker --version)"
else
  info "installing Docker Engine (a few minutes)"
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
fi

# Lets this user run docker without sudo. Needs a new login shell to take effect,
# so the rest of the script falls back to sudo when the group isn't active yet.
if ! groups | grep -q docker; then
  sudo usermod -aG docker "$USER"
  info "added $USER to the docker group (re-login for it to apply)"
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

sudo systemctl enable --now docker >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
log "Configuration"
[ -f .env ] || die ".env not found. Run: cp .env.production.example .env && vi .env"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

[ -n "${DOCKERHUB_NAMESPACE:-}" ] || die "DOCKERHUB_NAMESPACE is not set in .env — needed to pull the images."
[ -n "${JWT_SECRET:-}" ] && [ "${JWT_SECRET}" != "dev-secret-change-me" ] \
  || die "JWT_SECRET is unset or still the dev default. Generate one: openssl rand -hex 32"

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  info "OPENROUTER_API_KEY empty — the app will run in mock mode (sample data)."
fi

# ---------------------------------------------------------------------------
docker_cleanup() {
  # Repeated `compose pull` on a 20 GB VM leaves old image layers behind until the
  # disk hits 99%. Never pass --volumes — that would wipe Postgres data.
  info "disk before: $(df -h / | awk 'NR==2{print $4 " free (" $5 " used)"}')"
  $DOCKER system df 2>/dev/null | sed 's/^/    /' || true
  $DOCKER system prune -a -f
  $DOCKER builder prune -a -f 2>/dev/null || true
  info "disk after:  $(df -h / | awk 'NR==2{print $4 " free (" $5 " used)"}')"
}

if [ "${SKIP_DOCKER_PRUNE:-}" != "1" ]; then
  log "Reclaiming disk space (unused Docker images + build cache)"
  info "Postgres volumes are kept — set SKIP_DOCKER_PRUNE=1 to skip"
  docker_cleanup
else
  log "Skipping Docker prune (SKIP_DOCKER_PRUNE=1)"
fi

# ---------------------------------------------------------------------------
log "Pulling images"
$DOCKER compose $COMPOSE_FILES pull --quiet

log "Starting database"
$DOCKER compose $COMPOSE_FILES up -d postgres redis

log "Applying migrations + LangGraph checkpoint tables"
# `migrate` exits 0 when finished; the app services wait on it.
$DOCKER compose $COMPOSE_FILES up --exit-code-from migrate migrate \
  || die "Migrations failed — see: docker compose $COMPOSE_FILES logs migrate"

# Seed only once: the marker avoids re-running on every deploy. The seed itself
# is idempotent, but skipping it keeps redeploys fast.
if [ ! -f .seeded ]; then
  log "Seeding demo data (first run only)"
  $DOCKER compose $COMPOSE_FILES run --rm migrate seed && touch .seeded
fi

log "Starting all services"
$DOCKER compose $COMPOSE_FILES up -d

if [ "${SKIP_DOCKER_PRUNE:-}" != "1" ]; then
  log "Removing superseded image layers from this deploy"
  docker_cleanup
fi

# ---------------------------------------------------------------------------
log "Waiting for health checks"
for _ in $(seq 1 30); do
  UNHEALTHY=$($DOCKER compose $COMPOSE_FILES ps --format json 2>/dev/null \
    | grep -c '"Health":"starting"' || true)
  [ "${UNHEALTHY:-0}" -eq 0 ] && break
  sleep 5
done

$DOCKER compose $COMPOSE_FILES ps

EXTERNAL_IP=$(curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null \
  || echo "<VM-EXTERNAL-IP>")

cat <<EOF

$(printf '\033[1;32m==> Deployed\033[0m')

  User portal:   http://${EXTERNAL_IP}:3008
  Admin portal:  http://${EXTERNAL_IP}:3007
  API health:    http://${EXTERNAL_IP}:3000/health

  Login:  user@nutriagent.ai / user123
          admin@nutriagent.ai / admin123

  Logs:    docker compose $COMPOSE_FILES logs -f api-gateway
  Restart: docker compose $COMPOSE_FILES restart <service>
  Stop:    docker compose $COMPOSE_FILES down

  Change the demo passwords before sharing this URL — ports 3000/3007/3008 are
  open to the internet and there is no HTTPS in front of them yet.

EOF
