#!/usr/bin/env bash
#
# Creates/updates the Cloud Run services. Run once after infra/gcp-setup.sh and
# after CI has pushed images; re-run whenever service *configuration* changes
# (env vars, memory, ingress). Routine code deploys are handled by
# .github/workflows/gcp-deploy.yml, which only swaps the image.
#
# Usage:
#   ./infra/deploy-services.sh [IMAGE_TAG]     # default: latest
#
# Ordering matters: agents first, then the orchestrator that calls them, then the
# gateway, then the portals — each needs the previous tier's URL.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nuitri-agent}"
REGION="${REGION:-me-west1}"
REPO="${REPO:-nutriagent}"
TAG="${1:-latest}"
RUN_SA="${RUN_SA:-nutriagent-run}@${PROJECT_ID}.iam.gserviceaccount.com"
CONNECTOR="${CONNECTOR:-nutriagent-conn}"
BUCKET="${BUCKET:-${PROJECT_ID}-meal-images}"
REDIS_INSTANCE="${REDIS_INSTANCE:-nutriagent-redis}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null

REDIS_HOST="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format='value(host)')"
REDIS_PORT="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format='value(port)')"
REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"

# Secrets are referenced by name, never interpolated into the command line —
# keeps them out of shell history and Cloud Run's plaintext env.
SECRET_ENVS="DATABASE_URL=nutriagent-database-url:latest,JWT_SECRET=nutriagent-jwt-secret:latest,OPENROUTER_API_KEY=nutriagent-openrouter-key:latest,FDC_API_KEY=nutriagent-fdc-key:latest"

# deploy_backend <name> <port> <cpu> <memory>
# Internal ingress: these are called by the gateway/orchestrator, never by users.
deploy_backend() {
  local name=$1 port=$2 cpu=$3 mem=$4
  log "Deploying $name (internal)"
  gcloud run deploy "nutriagent-${name}" \
    --image="${REGISTRY}/nutriagent-${name}:${TAG}" \
    --region="$REGION" \
    --service-account="$RUN_SA" \
    --ingress=internal \
    --no-allow-unauthenticated \
    --vpc-connector="$CONNECTOR" \
    --vpc-egress=private-ranges-only \
    --port="$port" --cpu="$cpu" --memory="$mem" \
    --min-instances=0 --max-instances=3 \
    --set-env-vars="PORT=${port}" \
    --set-secrets="$SECRET_ENVS" \
    --quiet
}

service_url() { gcloud run services describe "nutriagent-$1" --region="$REGION" --format='value(status.url)'; }

# --- tier 1: leaf agents -----------------------------------------------------
deploy_backend graphdb-agent   3006 0.5 256Mi
deploy_backend nutrition-agent 3003 0.5 512Mi
deploy_backend vision-agent    3002 1   512Mi
deploy_backend rag-agent       3004 1   1Gi
deploy_backend text2sql-agent  3005 0.5 512Mi

VISION_URL=$(service_url vision-agent)
NUTRITION_URL=$(service_url nutrition-agent)
RAG_URL=$(service_url rag-agent)
TEXT2SQL_URL=$(service_url text2sql-agent)
GRAPHDB_URL=$(service_url graphdb-agent)

# --- tier 2: orchestrator (needs every agent URL) ----------------------------
log "Deploying orchestrator (internal)"
gcloud run deploy nutriagent-orchestrator \
  --image="${REGISTRY}/nutriagent-orchestrator:${TAG}" \
  --region="$REGION" --service-account="$RUN_SA" \
  --ingress=internal --no-allow-unauthenticated \
  --vpc-connector="$CONNECTOR" --vpc-egress=private-ranges-only \
  --port=3001 --cpu=1 --memory=1Gi --min-instances=0 --max-instances=3 \
  --set-env-vars="PORT=3001,VISION_AGENT_URL=${VISION_URL},NUTRITION_AGENT_URL=${NUTRITION_URL},RAG_AGENT_URL=${RAG_URL},TEXT2SQL_AGENT_URL=${TEXT2SQL_URL},GRAPHDB_AGENT_URL=${GRAPHDB_URL}" \
  --set-secrets="$SECRET_ENVS" \
  --quiet

ORCHESTRATOR_URL=$(service_url orchestrator)

# --- tier 3: API gateway (public) --------------------------------------------
log "Deploying api-gateway (public)"
gcloud run deploy nutriagent-api-gateway \
  --image="${REGISTRY}/nutriagent-api-gateway:${TAG}" \
  --region="$REGION" --service-account="$RUN_SA" \
  --ingress=all --allow-unauthenticated \
  --vpc-connector="$CONNECTOR" --vpc-egress=private-ranges-only \
  --port=3000 --cpu=1 --memory=1Gi --min-instances=0 --max-instances=5 \
  --set-env-vars="API_PORT=3000,REDIS_URL=${REDIS_URL},MEAL_IMAGE_STORAGE=gcs,GCS_MEAL_IMAGES_BUCKET=${BUCKET},ORCHESTRATOR_URL=${ORCHESTRATOR_URL},VISION_AGENT_URL=${VISION_URL},NUTRITION_AGENT_URL=${NUTRITION_URL},RAG_AGENT_URL=${RAG_URL},TEXT2SQL_AGENT_URL=${TEXT2SQL_URL},GRAPHDB_AGENT_URL=${GRAPHDB_URL}" \
  --set-secrets="$SECRET_ENVS" \
  --quiet

GATEWAY_URL=$(service_url api-gateway)

# --- tier 4: portals (public) ------------------------------------------------
# The browser calls the portal's own /api/* routes; Next.js middleware proxies to
# the gateway server-side, so requests stay same-origin and no CORS_ORIGIN is
# needed. Set it on the gateway only if something calls it cross-origin.
for portal in user-portal:3008 admin-portal:3007; do
  name="${portal%%:*}"; port="${portal##*:}"
  log "Deploying $name (public)"
  gcloud run deploy "nutriagent-${name}" \
    --image="${REGISTRY}/nutriagent-${name}:${TAG}" \
    --region="$REGION" --service-account="$RUN_SA" \
    --ingress=all --allow-unauthenticated \
    --port="$port" --cpu=1 --memory=512Mi --min-instances=0 --max-instances=3 \
    --set-env-vars="PORT=${port},API_PROXY_TARGET=${GATEWAY_URL}" \
    --quiet
done

log "Deployed"
cat <<EOF

  User portal:   $(service_url user-portal)
  Admin portal:  $(service_url admin-portal)
  API gateway:   ${GATEWAY_URL}

  Agents are internal-only and not reachable from the internet.

Next: ./infra/run-migrations.sh
EOF
