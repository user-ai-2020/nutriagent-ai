/**
 * Builds the api-gateway required-env list (see docs/TASKS.md).
 * JWT_SECRET is always listed because `.env.example` ships a dev placeholder;
 * production deployments must override it.
 * GCS bucket is required only when meal images use GCS storage.
 */
export function getApiGatewayRequiredEnv(): string[] {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  if (process.env.MEAL_IMAGE_STORAGE === "gcs") {
    required.push("GCS_MEAL_IMAGES_BUCKET");
  }
  return required;
}
