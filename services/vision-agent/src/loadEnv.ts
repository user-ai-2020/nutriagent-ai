import "dotenv/config";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(__dirname, "../../../.env") });

// OPENROUTER_API_KEY optional (mock mode). No DATABASE_URL — service does not use Prisma at runtime.
