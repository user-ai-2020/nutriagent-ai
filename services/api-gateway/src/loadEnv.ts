import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { validateRequiredEnv } from "@nutriagent/shared";
import { getApiGatewayRequiredEnv } from "./requiredEnv";

config({ path: path.resolve(__dirname, "../../../.env") });

validateRequiredEnv("api-gateway", getApiGatewayRequiredEnv());
