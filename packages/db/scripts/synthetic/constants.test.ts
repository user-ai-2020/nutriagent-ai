import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStepsByDate } from "./constants";

describe("parseStepsByDate", () => {
  it("extracts YYYY-MM-DD keys from dietGoals.stepsByDate", () => {
    const out = parseStepsByDate({
      dailyCalories: 2000,
      stepsByDate: {
        "2026-07-01": 8200,
        "2026-07-02": "9100",
        bad: 100,
        "not-a-date": 50,
      },
    });
    assert.deepEqual(out, { "2026-07-01": 8200, "2026-07-02": 9100 });
  });

  it("returns empty object when stepsByDate is missing", () => {
    assert.deepEqual(parseStepsByDate({ dailyCalories: 2000 }), {});
    assert.deepEqual(parseStepsByDate(null), {});
  });
});
