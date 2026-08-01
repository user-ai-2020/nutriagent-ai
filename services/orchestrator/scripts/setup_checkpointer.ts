import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

async function setup() {
  console.log("Connecting to DB:", process.env.DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  const checkpointer = new PostgresSaver(pool);
  
  try {
    await checkpointer.setup();
    console.log("PostgresSaver checkpointer schema setup complete.");
  } catch (err) {
    console.error("Setup failed:", err);
  } finally {
    await pool.end();
  }
}

setup();
