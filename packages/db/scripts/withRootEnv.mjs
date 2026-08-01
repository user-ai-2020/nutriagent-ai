#!/usr/bin/env node
// Loads the monorepo root .env, then runs the given command with it in the
// environment. Needed because Prisma CLI (generate/migrate/db seed) only
// auto-loads a .env next to schema.prisma — it never looks at the repo root,
// unlike the running services (see services/*/src/loadEnv.ts for the same
// pattern applied there).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/withRootEnv.mjs <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
