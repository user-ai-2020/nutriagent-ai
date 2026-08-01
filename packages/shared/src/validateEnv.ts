/**
 * Returns true when an env var is unset or blank (whitespace-only).
 */
function isEnvMissing(key: string): boolean {
  const value = process.env[key];
  return value === undefined || value.trim() === "";
}

/**
 * Validates that every listed env var is set and non-empty.
 * Logs each missing variable individually, then exits before the service starts.
 */
export function validateRequiredEnv(serviceName: string, required: string[]): void {
  const missing = required.filter(isEnvMissing);
  if (missing.length === 0) return;

  console.error(`[${serviceName}] Missing required environment variables:`);
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
  console.error("Refusing to start. See .env.example for the full list.");
  process.exit(1);
}
