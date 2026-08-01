# @nutriagent/shared

Shared library consumed by all services and apps via workspace dependency `"@nutriagent/shared": "workspace:*"`.

Build before running services that import from `dist/`:

```bash
corepack pnpm --filter @nutriagent/shared build
```

## Layout

```
packages/shared/src/
├── types.ts              # Vision, RAG, fusion, API DTOs
├── auth.ts               # JWT helpers
├── audit.ts              # Audit log types
├── openrouter.ts         # OpenRouter chat + Cohere rerank client
├── llm-config.ts         # Model ID resolution from env
├── rag-config.ts         # RAG search thresholds
├── food-match.ts         # isSameFoodItem — vision cluster identity
├── image-processing.ts   # Meal photo resize/JPEG pipeline
├── storage/imageStorage.ts
├── language.ts           # preferredLanguage helpers (not SSR dir)
└── locales/              # Static UI i18n (Task 7)
    ├── en.ts / he.ts     # Translation bundles (same key paths)
    ├── validateUsage.ts  # Missing-key scanner
    └── lintUsageCli.ts   # Exit 1 on missing keys (runs on build)
```

## i18n (Task 7)

| Command | Purpose |
|---------|---------|
| `pnpm lint:i18n` | Scan apps for missing translation keys |
| `pnpm test:i18n` | Locale content + per-app language-switch tests |
| `pnpm check:i18n` | Build shared (includes lint) |

Contributor guide: root README §7.5.

## Tests

```bash
corepack pnpm --filter @nutriagent/shared test
```

Covers `food-match`, locale content/usage, language helpers, image storage.

## Related docs

- [`docs/README.md`](../../docs/README.md) — specs and design reference
- [`packages/db/README.md`](../db/README.md) — database package
- Root README — Tasks 6–7 (language preference, static UI strings)
