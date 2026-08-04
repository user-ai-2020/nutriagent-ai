#!/bin/sh
# Entrypoint for the migration Cloud Run Job.
#
#   migrate  (default) apply pending Prisma migrations + create LangGraph
#                      checkpoint tables. Safe to re-run; both are idempotent.
#   seed               demo users/roles/knowledge docs (idempotent upserts)
#   usda               import USDA Foundation Foods into local_foods
#   all                migrate + seed + usda
#
# DATABASE_URL is injected by Terraform from Secret Manager.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set — the job cannot reach the database." >&2
  exit 1
fi

run_migrate() {
  echo "==> Applying Prisma migrations"
  # `migrate deploy`, never `migrate dev`: non-interactive, and it will not offer
  # to reset the database.
  pnpm --filter @nutriagent/db migrate:deploy

  echo "==> Ensuring LangGraph checkpoint tables"
  # Vision interrupt/resume fails at runtime without these.
  pnpm --filter @nutriagent/orchestrator setup:checkpointer
}

run_seed() {
  echo "==> Seeding demo data"
  pnpm --filter @nutriagent/db seed
}

run_usda() {
  echo "==> Importing USDA Foundation Foods"
  if [ ! -d "$USDA_DIR" ]; then
    echo "SKIP: USDA_DIR ('$USDA_DIR') not found — mount the extracted CSVs to import." >&2
    return 0
  fi
  pnpm --filter @nutriagent/db ingest:usda
}

case "${1:-migrate}" in
  migrate) run_migrate ;;
  seed)    run_seed ;;
  usda)    run_usda ;;
  all)     run_migrate; run_seed; run_usda ;;
  *)
    echo "Unknown command '$1'. Use: migrate | seed | usda | all" >&2
    exit 1
    ;;
esac

echo "==> Done"
