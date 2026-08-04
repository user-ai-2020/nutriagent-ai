#!/usr/bin/env bash
#
# Runs database work as a Cloud Run Job inside the VPC — necessary because the
# Cloud SQL instance has no public IP, so neither your laptop nor GitHub Actions
# can reach it directly.
#
# Usage:
#   ./infra/run-migrations.sh              # schema + LangGraph checkpoint tables
#   ./infra/run-migrations.sh seed         # demo users / roles / knowledge docs
#   ./infra/run-migrations.sh all          # migrate + seed + usda
#
# Creates the job on first run, then executes it. Idempotent.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nuitri-agent}"
REGION="${REGION:-me-west1}"
REPO="${REPO:-nutriagent}"
TAG="${IMAGE_TAG:-latest}"
RUN_SA="${RUN_SA:-nutriagent-run}@${PROJECT_ID}.iam.gserviceaccount.com"
CONNECTOR="${CONNECTOR:-nutriagent-conn}"
JOB="nutriagent-migrate"
COMMAND="${1:-migrate}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null

if gcloud run jobs describe "$JOB" --region="$REGION" >/dev/null 2>&1; then
  log "Updating job '$JOB'"
  ACTION=update
else
  log "Creating job '$JOB'"
  ACTION=create
fi

# max-retries=0: a half-applied migration needs a human, not a blind retry.
gcloud run jobs "$ACTION" "$JOB" \
  --image="${REGISTRY}/nutriagent-migrate:${TAG}" \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --vpc-connector="$CONNECTOR" \
  --vpc-egress=private-ranges-only \
  --cpu=1 --memory=1Gi \
  --max-retries=0 --task-timeout=900s \
  --set-secrets="DATABASE_URL=nutriagent-database-url:latest" \
  --args="$COMMAND" \
  --quiet

log "Executing '$COMMAND' (streaming; this blocks until it finishes)"
gcloud run jobs execute "$JOB" --region="$REGION" --wait

log "Done"
echo "Logs: gcloud run jobs executions list --job=$JOB --region=$REGION"
