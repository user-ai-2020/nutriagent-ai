# Scripts

Helper scripts for local development and regression checks. All commands assume the **repo root** as the working directory unless noted.

| Script | Purpose |
|--------|---------|
| [`run.ps1`](run.ps1) | Build `@nutriagent/shared` + `@nutriagent/db`, start Docker, launch all services (Windows PowerShell) |
| [`start-all.bat`](start-all.bat) | Double-click / cmd wrapper that invokes `run.ps1` |
| [`verify-portal-ssr-rtl.mjs`](verify-portal-ssr-rtl.mjs) | SSR `lang`/`dir` regression for user + admin portals |

## `run.ps1` / `start-all.bat`

Windows-only convenience launcher. Resolves the project root from this folder (`$PSScriptRoot/..`), loads `.env`, builds shared packages, runs `docker compose up -d`, then starts each service in its own window.

Prefer individual `pnpm dev:*` commands (see root README) when you only need a subset of services.

## SSR RTL verify

Used by Task 7.4.2 — ensures Hebrew/English cookie preference still sets `lang` and `dir` on the **server-rendered** HTML (not overridden by client i18n).

```bash
# Build both portals, start production servers, then:
pnpm verify:ssr-rtl

# Custom ports (defaults: user 3008, admin 3007):
USER_PORTAL_URL=http://localhost:3012 ADMIN_PORTAL_URL=http://localhost:3011 pnpm verify:ssr-rtl
```

## Related docs

- Root setup: [`../README.md`](../README.md)
- i18n contributor guide: root README §7.5
- Portal SSR helpers: `apps/*/src/lib/languageCookie.ts`
