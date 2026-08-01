# @nutriagent/db

Postgres schema, Prisma client, migrations, and seed scripts for NutriAgent AI.

## Commands (from repo root)

```bash
pnpm db:generate              # prisma generate
pnpm db:migrate               # prisma migrate deploy
pnpm db:seed                  # base seed (roles, admin user)
pnpm db:seed:demo             # 30-day synthetic meal history for user@nutriagent.ai
pnpm db:backfill:daily-steps  # backfill DailySteps rows for existing users
```

Filter form: `corepack pnpm --filter @nutriagent/db exec prisma …`

## Layout

```
packages/db/
├── prisma/
│   ├── schema.prisma         # Source of truth for tables and relations
│   ├── migrations/           # Applied via db:migrate
│   └── seed.ts               # Base seed
├── scripts/
│   ├── seedSyntheticMonth.ts # Demo meal history (db:seed:demo)
│   └── synthetic/            # Generator + tests
└── README.md
```

## ERD reference

Human-readable entity diagram and audit strategy: [`docs/database-schema.md`](../../docs/database-schema.md).

Prisma schema is authoritative when the two diverge.

## Local database

Docker Compose at repo root exposes Postgres on **5433** (see root README). Typical `DATABASE_URL`:

```
postgresql://nutriagent:nutriagent@localhost:5433/nutriagent
```

## Related docs

- Root README — Quick Start §3 (setup database)
- [`docs/database-schema.md`](../../docs/database-schema.md) — ERD
- [`packages/shared/README.md`](../shared/README.md) — shared types consumed by services
