import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { validateRequiredEnv } from "@nutriagent/shared";
import { getApiGatewayRequiredEnv } from "./requiredEnv";

function withMockedExit(run: () => void): { exit: ReturnType<typeof mock.fn>; errors: string[] } {
  const exit = mock.fn((_code?: number) => {
    throw new Error("exit");
  });
  const errors: string[] = [];
  const errorSpy = mock.method(console, "error", (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });

  const prevExit = process.exit;
  (process as NodeJS.Process & { exit: typeof exit }).exit = exit;

  try {
    run();
  } finally {
    process.exit = prevExit;
    errorSpy.mock.restore();
  }

  return { exit, errors };
}

describe("getApiGatewayRequiredEnv", () => {
  it("requires GCS bucket only when MEAL_IMAGE_STORAGE=gcs", () => {
    const prevStorage = process.env.MEAL_IMAGE_STORAGE;
    const prevBucket = process.env.GCS_MEAL_IMAGES_BUCKET;

    process.env.MEAL_IMAGE_STORAGE = "local";
    assert.deepEqual(getApiGatewayRequiredEnv(), ["DATABASE_URL", "JWT_SECRET"]);

    process.env.MEAL_IMAGE_STORAGE = "gcs";
    assert.deepEqual(getApiGatewayRequiredEnv(), [
      "DATABASE_URL",
      "JWT_SECRET",
      "GCS_MEAL_IMAGES_BUCKET",
    ]);

    if (prevStorage === undefined) delete process.env.MEAL_IMAGE_STORAGE;
    else process.env.MEAL_IMAGE_STORAGE = prevStorage;
    if (prevBucket === undefined) delete process.env.GCS_MEAL_IMAGES_BUCKET;
    else process.env.GCS_MEAL_IMAGES_BUCKET = prevBucket;
  });
});

describe("api-gateway env validation (meal image storage modes)", () => {
  it("local mode passes without GCS_MEAL_IMAGES_BUCKET", () => {
    const prev = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      MEAL_IMAGE_STORAGE: process.env.MEAL_IMAGE_STORAGE,
      GCS_MEAL_IMAGES_BUCKET: process.env.GCS_MEAL_IMAGES_BUCKET,
    };

    process.env.DATABASE_URL = "postgresql://test";
    process.env.JWT_SECRET = "dev-secret-change-me";
    process.env.MEAL_IMAGE_STORAGE = "local";
    delete process.env.GCS_MEAL_IMAGES_BUCKET;

    assert.doesNotThrow(() =>
      validateRequiredEnv("api-gateway", getApiGatewayRequiredEnv())
    );

    Object.assign(process.env, prev);
    if (prev.GCS_MEAL_IMAGES_BUCKET === undefined) delete process.env.GCS_MEAL_IMAGES_BUCKET;
  });

  it("gcs mode fails naming GCS_MEAL_IMAGES_BUCKET when bucket is unset", () => {
    const prev = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      MEAL_IMAGE_STORAGE: process.env.MEAL_IMAGE_STORAGE,
      GCS_MEAL_IMAGES_BUCKET: process.env.GCS_MEAL_IMAGES_BUCKET,
    };

    process.env.DATABASE_URL = "postgresql://test";
    process.env.JWT_SECRET = "dev-secret-change-me";
    process.env.MEAL_IMAGE_STORAGE = "gcs";
    delete process.env.GCS_MEAL_IMAGES_BUCKET;

    const { exit, errors } = withMockedExit(() => {
      assert.throws(
        () => validateRequiredEnv("api-gateway", getApiGatewayRequiredEnv()),
        /exit/
      );
    });

    assert.equal(exit.mock.callCount(), 1);
    assert.equal(exit.mock.calls[0]?.arguments?.[0], 1);
    assert.ok(errors.some((m) => m.includes("- GCS_MEAL_IMAGES_BUCKET")));
    assert.ok(!errors.some((m) => m.includes("- DATABASE_URL")));
    assert.ok(!errors.some((m) => m.includes("- JWT_SECRET")));

    Object.assign(process.env, prev);
    if (prev.GCS_MEAL_IMAGES_BUCKET === undefined) delete process.env.GCS_MEAL_IMAGES_BUCKET;
  });
});
