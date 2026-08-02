/**
 * Creates the LangGraph checkpoint tables (public.checkpoints, checkpoint_writes,
 * checkpoint_blobs, ...) used by the Vision branch's interrupt/resume flow.
 *
 * The orchestrator also does this on boot, but running it standalone lets you
 * provision the tables without rebuilding/restarting the service, and surfaces a
 * real error instead of a silent boot-time warning.
 *
 * Usage (from anywhere in the repo):
 *   pnpm --filter @nutriagent/orchestrator setup:checkpointer
 *
 * Env comes from the root .env via src/loadEnv (resolved from this file's path,
 * not the CWD). When running on the host rather than in a container,
 * DATABASE_URL must point at 127.0.0.1:5433 — not postgres:5432.
 */
import "../src/loadEnv";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

async function setup() {
  const connectionString = process.env.DATABASE_URL;
  // Mask credentials when echoing the target back.
  console.log("Connecting to:", connectionString?.replace(/:\/\/[^@]*@/, "://***@"));

  const pool = new pg.Pool({ connectionString });

  try {
    const checkpointer = new PostgresSaver(pool);
    await checkpointer.setup();

    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%'
       ORDER BY table_name`
    );

    if (rows.length === 0) {
      throw new Error("setup() succeeded but no checkpoint tables exist");
    }

    console.log("Checkpoint tables ready:");
    for (const row of rows) console.log(`  - public.${row.table_name}`);
  } finally {
    await pool.end();
  }
}

setup().catch((err) => {
  console.error("Failed to set up checkpoint tables:", err);
  process.exit(1);
});
