/** @type {import('node:test').TestContext} */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "@nutriagent/shared";

describe("auth", () => {
  it("signs and verifies JWT", () => {
    process.env.JWT_SECRET = "test-secret";
    const token = signToken({ userId: 1, email: "test@test.com", role: "User" });
    const payload = verifyToken(token);
    assert.equal(payload.userId, 1);
    assert.equal(payload.email, "test@test.com");
  });
});
