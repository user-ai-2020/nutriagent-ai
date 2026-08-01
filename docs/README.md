# NutriAgent AI — documentation

Reference material for the monorepo. **Runnable code** lives under [`apps/`](../apps/), [`services/`](../services/), and [`packages/`](../packages/). Setup, tasks, and deployment are documented in the root [`README.md`](../README.md).

## Contents

| Path | Contents |
|------|----------|
| [`architecture/`](architecture/) | Original product specs (PDF) |
| [`design-handoff/`](design-handoff/) | Broadsheet HTML prototype + handoff README (**design reference only — not shipped**) |
| [`database-schema.md`](database-schema.md) | ERD overview, entity list, indexes, audit strategy |
| [`reranker-fusion-fix-design.md`](reranker-fusion-fix-design.md) | Vision reranker cluster-first fusion design |

### `architecture/`

| File | Description |
|------|-------------|
| `NutriAgent_AI_Cursor_Spec.pdf` | Full Cursor build spec (tasks, agents, UX) |
| `NutriAgent_AI_Clinical_Architecture*.pdf` | Clinical / knowledge-graph architecture |

### `design-handoff/`

HTML prototype of the Broadsheet UI (login, onboarding, chat, dashboard, admin). Open `NutriAgent AI.dc.html` in a browser with `support.js` alongside. See [`design-handoff/README.md`](design-handoff/README.md) for screen-by-screen fidelity notes.

Production CSS lives in `apps/user-portal/src/app/broadsheet.css` and `apps/admin-portal/src/app/broadsheet.css`.

## Moved from root (folder cleanup)

| Old path | New path |
|----------|----------|
| `architectureNuitriAgent/` | `docs/architecture/` |
| `design_handoff_nutriagent/` | `docs/design-handoff/` |
| `db/README.md` | `docs/database-schema.md` |

Live Prisma schema and migrations remain in [`packages/db/`](../packages/db/).

## Related READMEs

- [`packages/db/README.md`](../packages/db/README.md) — migrations and seeds
- [`packages/shared/README.md`](../packages/shared/README.md) — shared library and i18n bundles
- [`scripts/README.md`](../scripts/README.md) — dev scripts and SSR RTL verify
- [`infra/README.md`](../infra/README.md) — GCP Terraform
