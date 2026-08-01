# Infrastructure

GCP deployment configuration for NutriAgent AI.

## Terraform

```
infra/terraform/
└── main.tf    # Cloud Run, Cloud SQL, Memorystore (Redis)
```

```bash
cd infra/terraform
terraform init
terraform plan -var="project_id=YOUR_GCP_PROJECT"
terraform apply -var="project_id=YOUR_GCP_PROJECT"
```

## Deploy services

After infrastructure is up, deploy each microservice to Cloud Run (from repo root):

```bash
gcloud run deploy nutriagent-api-gateway --source services/api-gateway
gcloud run deploy nutriagent-orchestrator --source services/orchestrator
# … repeat for vision-agent, nutrition-agent, rag-agent, text2sql-agent, graphdb-agent
```

Portal apps (`apps/user-portal`, `apps/admin-portal`) and mobile are deployed separately (Cloud Run, Firebase, or Expo EAS as appropriate).

## Production env notes

- Set `MEAL_IMAGE_STORAGE=gcs` and GCS bucket vars (never `local` in prod) — see root README § Meal image storage
- Cloud SQL connection string → `DATABASE_URL` on each service
- Memorystore host → Redis URL for audit cache and session helpers

## Related docs

- Root README — **GCP Deployment**
- [`docs/architecture/`](../docs/architecture/) — original architecture PDFs
- [`docs/database-schema.md`](../docs/database-schema.md) — Postgres entity overview
