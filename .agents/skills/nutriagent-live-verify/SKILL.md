---
name: nutriagent-live-verify
description: >-
  Hard-won NutriAgent verification and safety rules. Use whenever fixing bugs,
  claiming a fix, changing locales/i18n/RTL, Prisma, Docker images, RAG/timeouts,
  meal history, or any UI that runs in compose — requires live-container evidence
  and Artifacts, not source-only edits.
---

# NutriAgent live verification playbook

This skill encodes lessons learned the hard way on this monorepo. Apply it on every
fix/claim that touches Dockerized apps or AI agent latency.

## Co-existence with Cursor

Antigravity and Cursor share this repo. Do **not** delete or replace Cursor rules
(`.cursor/`, `.cursorrules`, etc.). This skill is additive.

## 1. Always verify against a live container

Source greps and local `pnpm build` logs are **necessary but not sufficient**.

Bugs that only appeared after inspecting the **running** image/container:

- Prisma client / generated artifacts out of sync with what the container actually ships
- RTL / locale strings missing from the **compiled** `.next` (or equivalent) inside the container
- Env defaults differing between host `.env` and compose service env

**Do this:**

```bash
docker compose ps
docker compose logs <service> --tail 100
docker exec <container> sh -c "grep -R <needle> /app/... || true"
```

Prefer evidence from the container filesystem and HTTP responses from published ports
(3000, 3007, 3008, agents 3001–3006).

## 2. “Fixed” requires direct evidence

Allowed proof (attach as Antigravity **Artifact** when available):

- Screenshot of the live UI (correct language, layout, no placeholder meals)
- Real terminal transcript: `curl` / `Invoke-WebRequest` response body/status
- `docker exec` + `grep` hitting the **built** asset inside the container

**Not** allowed as sole proof:

- “I edited the file”
- “Build succeeded”
- “Typecheck passed” without runtime confirmation for UI/i18n/data bugs

## 3. Timeout policy (external calls must be bounded)

No OpenRouter / RAG web-fallback / long agent chain may block the UI without a clear bound.

Historical failure mode: RAG path ~**90s** while frontend aborted around ~**15s** → broken UX
with “still working” on the server.

When changing agent HTTP clients or orchestrator fan-out:

- Set explicit timeouts shorter than the calling UI/API budget
- Prefer fail-soft (partial answer / clear error) over hanging
- Document the bound in the PR/task notes if you change it

## 4. Commit important changes before rebuild

Locale / copy / config edits that were only on disk (not in git) **did not survive** image rebuilds.

Before `docker compose ... --build` that is meant to ship a fix:

1. Confirm the change is staged/committed (or at least will be in the build context intentionally)
2. Rebuild
3. Re-verify inside the **new** container

## 5. Test placeholders are not production meals

No-food-detection and similar tests produced food rows like `"Nothing"`, `"unknown"`,
`"no food items visible"`, with bogus nutrition (e.g. 100/5/3/12). Those were once
saved as real meals and inflated day totals (e.g. 3712 → 3612 after cleanup).

Rules:

- Do not persist placeholder / no-food detection strings as user meal history
- Keep test fixtures out of the seeded “real user” path unless clearly labeled and disposable
- Prefer orchestrator filters (`isPlaceholderFoodType` / empty-meal → no-food response, no save)
- History formatters must omit placeholders so chat never presents them as food

## 6. Autonomy mode

Use **Review-driven** or **Agent-assisted**, not full Autopilot.

Stop for human review at checkpoints. Past Autopilot-style runs caused:

- Prisma-related regressions
- Unsolicited merging of admin UI into the user portal (reverted; admin stays on **3007**)

## 7. Artifacts every Antigravity task

For each task completion package, include at least one Artifact:

- Screenshot **or**
- Terminal transcript with real output

This **adds** to the existing Cursor checkpoint review culture — it does not replace it.

## Quick acceptance checklist

- [ ] Change present in git (or explicitly justified ephemeral experiment)
- [ ] Live container / published port checked
- [ ] Evidence attached (screenshot or curl/grep transcript)
- [ ] No unbounded external call introduced
- [ ] No placeholder meal data written as production history
- [ ] Human review stop if the change spans portals, auth, Prisma, or compose
