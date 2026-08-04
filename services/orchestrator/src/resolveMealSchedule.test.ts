import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMealSchedule } from "./utils";

describe("resolveMealSchedule", () => {
  it("defaults to now + hour-based meal type", () => {
    const { mealDatetime, mealType } = resolveMealSchedule();
    assert.ok(mealDatetime instanceof Date);
    assert.ok(["breakfast", "lunch", "dinner", "snack"].includes(mealType));
  });

  it("uses explicit mealType over inference", () => {
    const { mealType } = resolveMealSchedule({
      mealDatetime: "2026-08-03T20:00:00.000Z",
      mealType: "breakfast",
    });
    assert.equal(mealType, "breakfast");
  });

  it("parses ISO mealDatetime", () => {
    const { mealDatetime } = resolveMealSchedule({
      mealDatetime: "2026-08-01T13:30:00.000Z",
    });
    assert.equal(mealDatetime.toISOString(), "2026-08-01T13:30:00.000Z");
  });
});
