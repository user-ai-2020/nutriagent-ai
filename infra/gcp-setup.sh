#!/usr/bin/env bash
#
# One-time GCP provisioning for NutriAgent AI.
#
# Creates everything the app needs: APIs, Artifact Registry, VPC + connector,
# private Cloud SQL (Postgres 16 + pgvector), Memorystore Redis, meal-image
# bucket, Secret Manager entries, service accounts and IAM. Deploys are handled
# separately by .github/workflows/gcp-deploy.yml.
#
# Safe to re-run: every step checks for existing resources first, so a failed run
# can simply be repeated.
#
# Usage:
#   chmod +x infra/gcp-setup.sh
#   ./infra/gcp-setup.sh
#
# Prerequisites: gcloud CLI, authenticated (`gcloud auth login`) and billing
# enabled on the project.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config — override via environment, e.g. REGION=europe-west1 ./infra/gcp-setup.sh
# ---------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-nuitri-agent}"
REGION="${REGION:-me-west1}"           # Tel Aviv
REPO="${REPO:-nutriagent}"             # Artifact Registry repository
DB_INSTANCE="${DB_INSTANCE:-nutriagent-db}"
# db-f1-micro (~0.6GB) is too small for pgvector HNSW indexes over 1024-dim
# embeddings plus the LangGraph checkpointer. This is the practical floor.
DB_TIER="${DB_TIER:-db-g1-small}"
REDIS_INSTANCE="${REDIS_INSTANCE:-nutriagent-redis}"
BUCKET="${BUCKET:-${PROJECT_ID}-meal-images}"
VPC="${VPC:-nutriagent-vpc}"
CONNECTOR="${CONNECTOR:-nutriagent-conn}"
RUN_SA="${RUN_SA:-nutriagent-run}"
DEPLOY_SA="${DEPLOY_SA:-github-deployer}"
GITHUB_REPO="${GITHUB_REPO:-}"          # e.g. myuser/nutriagent — needed for CI auth

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
have() { eval "$1" >/dev/null 2>&1; }

gcloud config set project "$PROJECT_ID" >/dev/null
log "Project: $PROJECT_ID   Region: $REGION"

# ---------------------------------------------------------------------------
log "Enabling APIs (takes a minute the first time)"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  servicenetworking.googleapis.com \
  compute.googleapis.com \
  iamcredentials.googleapis.com \
  --quiet

# ---------------------------------------------------------------------------
log "Artifact Registry"
if have "gcloud artifacts repositories describe $REPO --location=$REGION"; then
  info "repository '$REPO' already exists"
else
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location="$REGION" \
    --description="NutriAgent service images"
fi
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
info "registry: $REGISTRY"

# ---------------------------------------------------------------------------
log "VPC + private services access"
if have "gcloud compute networks describe $VPC"; then
  info "network '$VPC' already exists"
else
  gcloud compute networks create "$VPC" --subnet-mode=auto
fi

# Reserved range that Cloud SQL's private IP is allocated from.
if have "gcloud compute addresses describe nutriagent-private-ip --global"; then
  info "private IP range already reserved"
else
  gcloud compute addresses create nutriagent-private-ip \
    --global --purpose=VPC_PEERING --prefix-length=16 --network="$VPC"
fi

if gcloud services vpc-peerings list --network="$VPC" 2>/dev/null | grep -q servicenetworking; then
  info "VPC peering already established"
else
  gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges=nutriagent-private-ip --network="$VPC"
fi

# Cloud Run reaches the private database/Redis through this connector.
if have "gcloud compute networks vpc-access connectors describe $CONNECTOR --region=$REGION"; then
  info "connector '$CONNECTOR' already exists"
else
  gcloud compute networks vpc-access connectors create "$CONNECTOR" \
    --region="$REGION" --network="$VPC" --range=10.8.0.0/28
fi

# ---------------------------------------------------------------------------
log "Secrets"
create_secret() { # name, value
  if have "gcloud secrets describe $1"; then
    info "secret '$1' exists — leaving current value"
  else
    printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic
    info "created '$1'"
  fi
}

# Generated once and never printed; read back later only via Secret Manager.
DB_PASSWORD="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 32)"

create_secret nutriagent-db-password "$DB_PASSWORD"
create_secret nutriagent-jwt-secret "$JWT_SECRET"
create_secret nutriagent-openrouter-key "${OPENROUTER_API_KEY:-}"
create_secret nutriagent-fdc-key "${FDC_API_KEY:-}"

# If the secret already existed, use the stored password for the DB user below.
DB_PASSWORD="$(gcloud secrets versions access latest --secret=nutriagent-db-password)"

# ---------------------------------------------------------------------------
log "Cloud SQL (Postgres 16 + pgvector, private IP only)"
if have "gcloud sql instances describe $DB_INSTANCE"; then
  info "instance '$DB_INSTANCE' already exists"
else
  # --no-assign-ip keeps it off the public internet; reachable only via the VPC.
  gcloud sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 \
    --tier="$DB_TIER" \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-auto-increase \
    --network="projects/${PROJECT_ID}/global/networks/${VPC}" \
    --no-assign-ip \
    --database-flags=cloudsql.enable_pgvector=on \
    --backup-start-time=03:00
  gcloud sql instances patch "$DB_INSTANCE" --deletion-protection --quiet
fi

have "gcloud sql databases describe nutriagent --instance=$DB_INSTANCE" \
  && info "database 'nutriagent' exists" \
  || gcloud sql databases create nutriagent --instance="$DB_INSTANCE"

if have "gcloud sql users list --instance=$DB_INSTANCE --filter=name:nutriagent --format='value(name)' | grep -q nutriagent"; then
  info "user 'nutriagent' exists — resetting password to match Secret Manager"
  gcloud sql users set-password nutriagent --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
else
  gcloud sql users create nutriagent --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
fi

DB_PRIVATE_IP="$(gcloud sql instances describe "$DB_INSTANCE" \
  --format='value(ipAddresses.filter("type:PRIVATE").extract("ipAddress").flatten())')"
DATABASE_URL="postgresql://nutriagent:${DB_PASSWORD}@${DB_PRIVATE_IP}:5432/nutriagent?connection_limit=3"
create_secret nutriagent-database-url "$DATABASE_URL"
info "private IP: $DB_PRIVATE_IP"

# ---------------------------------------------------------------------------
log "Memorystore Redis"
if have "gcloud redis instances describe $REDIS_INSTANCE --region=$REGION"; then
  info "instance '$REDIS_INSTANCE' already exists"
else
  gcloud redis instances create "$REDIS_INSTANCE" \
    --size=1 --region="$REGION" --network="$VPC" --tier=basic
fi
REDIS_HOST="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format='value(host)')"
REDIS_PORT="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format='value(port)')"
REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"
info "$REDIS_URL"

# ---------------------------------------------------------------------------
log "Meal image bucket (private, signed URLs only)"
if have "gcloud storage buckets describe gs://$BUCKET"; then
  info "bucket already exists"
else
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

# ---------------------------------------------------------------------------
log "Service account for Cloud Run"
RUN_SA_EMAIL="${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
have "gcloud iam service-accounts describe $RUN_SA_EMAIL" \
  || gcloud iam service-accounts create "$RUN_SA" --display-name="NutriAgent Cloud Run"

for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUN_SA_EMAIL}" --role="$ROLE" --quiet >/dev/null
done

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:${RUN_SA_EMAIL}" --role=roles/storage.objectAdmin --quiet >/dev/null

# Required to mint signed URLs for private meal images.
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA_EMAIL" \
  --member="serviceAccount:${RUN_SA_EMAIL}" \
  --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null
info "$RUN_SA_EMAIL ready"

# ---------------------------------------------------------------------------
log "GitHub Actions deployer (Workload Identity Federation)"
DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
have "gcloud iam service-accounts describe $DEPLOY_SA_EMAIL" \
  || gcloud iam service-accounts create "$DEPLOY_SA" --display-name="GitHub Actions deployer"

for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" --role="$ROLE" --quiet >/dev/null
done

if [ -z "$GITHUB_REPO" ]; then
  info "GITHUB_REPO not set — skipping WIF pool. Re-run with:"
  info "  GITHUB_REPO=owner/repo ./infra/gcp-setup.sh"
else
  PROJECT_NUM="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  have "gcloud iam workload-identity-pools describe github --location=global" \
    || gcloud iam workload-identity-pools create github --location=global \
         --display-name="GitHub Actions"

  # attribute-condition pins this to your repo — without it any GitHub repo could
  # impersonate the deployer service account.
  have "gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github" \
    || gcloud iam workload-identity-pools providers create-oidc github \
         --location=global --workload-identity-pool=github \
         --issuer-uri="https://token.actions.githubusercontent.com" \
         --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
         --attribute-condition="assertion.repository=='${GITHUB_REPO}'"

  gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
    --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}" \
    --quiet >/dev/null

  WIF_PROVIDER="projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github/providers/github"
fi

# ---------------------------------------------------------------------------
log "Done — infrastructure ready"

cat <<EOF

Add these GitHub repository secrets (Settings → Secrets and variables → Actions):

  GCP_PROJECT_ID       ${PROJECT_ID}
  GCP_SERVICE_ACCOUNT  ${DEPLOY_SA_EMAIL}
  GCP_WIF_PROVIDER     ${WIF_PROVIDER:-<re-run with GITHUB_REPO=owner/repo>}

Values the Cloud Run services need (deploy-services.sh reads them automatically):

  REGISTRY      ${REGISTRY}
  REDIS_URL     ${REDIS_URL}
  BUCKET        ${BUCKET}
  DATABASE_URL  stored in Secret Manager as 'nutriagent-database-url'

Next:
  1. git push  (CI builds + pushes all images)
  2. ./infra/deploy-services.sh      create the Cloud Run services
  3. ./infra/run-migrations.sh       schema + checkpoint tables + seed

EOF
