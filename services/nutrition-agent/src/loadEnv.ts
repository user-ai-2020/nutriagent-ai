import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { validateRequiredEnv } from "@nutriagent/shared";

config({ path: path.resolve(__dirname, "../../../.env") });

validateRequiredEnv("nutrition-agent", ["DATABASE_URL"]);
