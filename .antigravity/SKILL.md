---
name: nutriagent-antigravity
description: >-
  NutriAgent Antigravity entrypoint — co-existence with Cursor, Manager review mode,
  Artifacts-required verification, and pointers to the canonical live-verify skill.
---

# Antigravity on NutriAgent AI (alongside Cursor)

## Critical: additive only

This project uses **Google Antigravity in addition to Cursor**, not instead of it.

- Same source tree, same git history, same Docker Compose stack
- **Do not delete or modify** Cursor config (`.cursor/`, `.cursorrules`, Cursor rules, etc.)
- Antigravity guidance lives here and under `.agents/skills/` — Cursor guidance stays where it is

## Canonical skill location (official Antigravity)

Per [Antigravity Skills docs](https://antigravity.google/docs/skills), workspace skills belong in:

```text
.agents/skills/<skill-name>/SKILL.md
```

**Canonical hard-won rules:** `.agents/skills/nutriagent-live-verify/SKILL.md`

Standing architecture + commands: repo-root `AGENTS.md`

This `.antigravity/SKILL.md` file is an extra entrypoint for agents that look under `.antigravity/`.
Prefer loading **`nutriagent-live-verify`** for verification work.

## Manager view / autonomy

Set agent mode to **Review-driven** or **Agent-assisted** — **not** full Autopilot.

Reasons from this project’s history:

- Prisma issues that needed live-container diagnosis
- Unsolicited admin-portal merge into user-portal (reverted; admin remains `apps/admin-portal` :3007)

Stop at checkpoints for human review — same discipline that worked well in Cursor.

## Artifacts (required)

On every Antigravity task, produce an Artifact with:

- A real **screenshot**, and/or
- A real **terminal transcript** (`curl`, `docker exec`, `docker compose logs`)

Descriptions of code edits alone are not acceptance.

## Hard-won rules (summary)

1. **Live container verification** — grep/curl inside the running service, not only host source.
2. **Evidence-gated “fixed”** — screenshot / curl / compiled-asset grep.
3. **Bounded timeouts** — OpenRouter / RAG must not exceed UI budgets (~15s historically vs ~90s RAG hang).
4. **Commit before rebuild** — uncommitted locale fixes vanished on image rebuild.
5. **No placeholder production data** — `"Nothing"` / `"unknown"` test rows must not become real meals.

Full procedure: `.agents/skills/nutriagent-live-verify/SKILL.md`.

## Models

No single required model. Gemini 3 Pro/Flash, Claude Sonnet, GPT-OSS, or Cursor — pick per task.

## Stack unchanged

Docker, Next.js, Express, Prisma, pnpm workspace — **no changes for Antigravity**. Terminal commands (`docker compose`, `pnpm`, `git`) should work in Antigravity’s integrated terminal the same as in Cursor when PATH/Corepack match on the host.
