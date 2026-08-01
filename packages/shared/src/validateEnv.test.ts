import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { validateRequiredEnv } from "./validateEnv";

describe("validateRequiredEnv", () => {
  it("does nothing when all required vars are set", () => {
    const prev = process.env.TEST_VALIDATE_ENV_OK;
    process.env.TEST_VALIDATE_ENV_OK = "value";
    assert.doesNotThrow(() => validateRequiredEnv("test-service", ["TEST_VALIDATE_ENV_OK"]));
    if (prev === undefined) delete process.env.TEST_VALIDATE_ENV_OK;
    else process.env.TEST_VALIDATE_ENV_OK = prev;
  });

  it("does nothing for an empty required list", () => {
    assert.doesNotThrow(() => validateRequiredEnv("test-service", []));
  });

  it("exits with code 1 and lists each missing var individually", () => {
    // Stub process.exit so the test runner is not killed (real exit would terminate the suite).
    const exit = mock.fn((_code?: number) => {
      throw new Error("exit");
    });
    const error = mock.method(console, "error", () => {});

    const prevExit = process.exit;
    const prevA = process.env.TEST_VALIDATE_MISSING_A;
    const prevB = process.env.TEST_VALIDATE_MISSING_B;
    delete process.env.TEST_VALIDATE_MISSING_A;
    delete process.env.TEST_VALIDATE_MISSING_B;
    process.env.TEST_VALIDATE_MISSING_B = "   ";

    (process as NodeJS.Process & { exit: typeof exit }).exit = exit;

    assert.throws(
      () => validateRequiredEnv("api-gateway", ["TEST_VALIDATE_MISSING_A", "TEST_VALIDATE_MISSING_B"]),
      /exit/
    );

    assert.equal(exit.mock.callCount(), 1);
    assert.equal(exit.mock.calls[0]?.arguments?.[0], 1);

    const messages = error.mock.calls.map((call) => String(call.arguments[0]));
    assert.ok(messages.some((m) => m.includes("[api-gateway] Missing required environment variables:")));
    assert.ok(messages.some((m) => m.includes("- TEST_VALIDATE_MISSING_A")));
    assert.ok(messages.some((m) => m.includes("- TEST_VALIDATE_MISSING_B")));
    assert.ok(messages.some((m) => m.includes("Refusing to start")));

    process.exit = prevExit;
    error.mock.restore();
    if (prevA === undefined) delete process.env.TEST_VALIDATE_MISSING_A;
    else process.env.TEST_VALIDATE_MISSING_A = prevA;
    if (prevB === undefined) delete process.env.TEST_VALIDATE_MISSING_B;
    else process.env.TEST_VALIDATE_MISSING_B = prevB;
  });
});
