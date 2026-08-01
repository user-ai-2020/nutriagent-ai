import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mealImageStorageKey } from "@nutriagent/shared";

describe("meal image storage keys", () => {
  it("builds stable per-user object keys", () => {
    assert.equal(mealImageStorageKey(7, "abc123"), "users/7/images/abc123.jpg");
  });
});
