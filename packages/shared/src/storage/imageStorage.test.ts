import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MEAL_IMAGE_SIGNED_URL_DEFAULT_SECONDS,
  MEAL_IMAGE_SIGNED_URL_MAX_SECONDS,
  MEAL_IMAGE_SIGNED_URL_MIN_SECONDS,
  resolveMealImageSignedUrlTtl,
} from "./imageStorage";

describe("resolveMealImageSignedUrlTtl", () => {
  it("defaults to 30 minutes", () => {
    delete process.env.MEAL_IMAGE_SIGNED_URL_TTL_SECONDS;
    assert.equal(resolveMealImageSignedUrlTtl(), MEAL_IMAGE_SIGNED_URL_DEFAULT_SECONDS);
    assert.equal(MEAL_IMAGE_SIGNED_URL_DEFAULT_SECONDS, 30 * 60);
  });

  it("clamps TTL to 15–60 minutes", () => {
    delete process.env.MEAL_IMAGE_SIGNED_URL_TTL_SECONDS;
    assert.equal(resolveMealImageSignedUrlTtl(60), MEAL_IMAGE_SIGNED_URL_MIN_SECONDS);
    assert.equal(resolveMealImageSignedUrlTtl(99999), MEAL_IMAGE_SIGNED_URL_MAX_SECONDS);
    assert.equal(MEAL_IMAGE_SIGNED_URL_MIN_SECONDS, 15 * 60);
    assert.equal(MEAL_IMAGE_SIGNED_URL_MAX_SECONDS, 60 * 60);
  });

  it("reads MEAL_IMAGE_SIGNED_URL_TTL_SECONDS from env when set", () => {
    process.env.MEAL_IMAGE_SIGNED_URL_TTL_SECONDS = "2700";
    assert.equal(resolveMealImageSignedUrlTtl(), 2700);
    delete process.env.MEAL_IMAGE_SIGNED_URL_TTL_SECONDS;
  });
});

describe("meal image storage keys", () => {
  it("scopes object keys per user so identical bytes never share a path", async () => {
    const { mealImageStorageKey } = await import("./imageStorage");
    assert.notEqual(mealImageStorageKey(1, "img_a"), mealImageStorageKey(2, "img_a"));
  });
});
