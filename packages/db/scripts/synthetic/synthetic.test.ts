import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SeedCliError, parseSeedCliArgs } from "./cli";
import { computeDateRange, generateSyntheticDays, selectBlowoutDayIndices } from "./generator";
import { createRng, fakeSha256Hex } from "./rng";

describe("parseSeedCliArgs", () => {
  it("defaults days=30 and seed=42026", () => {
    const opts = parseSeedCliArgs([]);
    assert.equal(opts.days, 30);
    assert.equal(opts.seed, 42_026);
    assert.equal(opts.userId, undefined);
  });

  it("parses explicit flags", () => {
    const opts = parseSeedCliArgs(["--userId", "3", "--days", "14", "--seed", "99"]);
    assert.equal(opts.userId, 3);
    assert.equal(opts.days, 14);
    assert.equal(opts.seed, 99);
  });

  it("rejects non-existent-style invalid userId", () => {
    assert.throws(() => parseSeedCliArgs(["--userId", "0"]), SeedCliError);
    assert.throws(() => parseSeedCliArgs(["--userId", "-1"]), SeedCliError);
  });

  it("rejects negative or zero days", () => {
    assert.throws(() => parseSeedCliArgs(["--days", "0"]), SeedCliError);
    assert.throws(() => parseSeedCliArgs(["--days", "-5"]), SeedCliError);
  });

  it("rejects days above 366", () => {
    assert.throws(() => parseSeedCliArgs(["--days", "400"]), SeedCliError);
  });
});

describe("createRng determinism", () => {
  it("same seed produces same sequence", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    assert.deepEqual(seqA, seqB);
  });

  it("different seeds diverge", () => {
    const a = createRng(1);
    const b = createRng(2);
    assert.notEqual(a(), b());
  });
});

describe("generateSyntheticDays", () => {
  const fixedNow = new Date("2026-07-26T12:00:00.000Z");

  it("is deterministic for the same seed", () => {
    const first = generateSyntheticDays({ userId: 1, days: 30, seed: 777, now: fixedNow });
    const second = generateSyntheticDays({ userId: 1, days: 30, seed: 777, now: fixedNow });
    assert.equal(first.length, 30);
    assert.deepEqual(
      first.map((d) => ({ dateKey: d.dateKey, totalCalories: d.totalCalories, isBlowout: d.isBlowout })),
      second.map((d) => ({ dateKey: d.dateKey, totalCalories: d.totalCalories, isBlowout: d.isBlowout }))
    );
  });

  it("marks ~20% of days as blowouts", () => {
    const days = generateSyntheticDays({ userId: 1, days: 30, seed: 42, now: fixedNow });
    const blowouts = days.filter((d) => d.isBlowout).length;
    assert.equal(blowouts, 6);
  });

  it("blowout days exceed normal calorie budgets on average", () => {
    const days = generateSyntheticDays({ userId: 1, days: 30, seed: 99, now: fixedNow });
    const normal = days.filter((d) => !d.isBlowout);
    const blowout = days.filter((d) => d.isBlowout);
    const avgNormal = normal.reduce((s, d) => s + d.totalCalories, 0) / normal.length;
    const avgBlowout = blowout.reduce((s, d) => s + d.totalCalories, 0) / blowout.length;
    assert.ok(avgBlowout > avgNormal * 1.2);
  });

  it("daily calorie budgets vary day-to-day", () => {
    const days = generateSyntheticDays({ userId: 1, days: 30, seed: 55, now: fixedNow });
    const budgets = new Set(days.map((d) => d.dailyCalorieBudget));
    assert.ok(budgets.size > 5);
  });

  it("creates 3-4 meals per day with plausible MealImage metadata", () => {
    const days = generateSyntheticDays({ userId: 7, days: 7, seed: 1, now: fixedNow });
    for (const day of days) {
      assert.ok(day.meals.length >= 3 && day.meals.length <= 4);
      assert.ok(day.steps > 0);
      for (const meal of day.meals) {
        if (meal.image) {
          assert.match(meal.image.storageKey, /^users\/7\/images\/[a-z0-9]+\.jpg$/);
          assert.equal(meal.image.width, 512);
          assert.equal(meal.image.contentHash.length, 64);
          assert.ok(meal.image.recognizedAt >= meal.image.capturedAt);
          assert.match(meal.image.visionModelVersion ?? "", /rerank/i);
        }
      }
    }
  });

  it("computeDateRange covers exactly the requested number of calendar days", () => {
    const days = generateSyntheticDays({ userId: 1, days: 30, seed: 1, now: fixedNow });
    assert.equal(days.length, 30);
    const { start } = computeDateRange(30, fixedNow);
    assert.equal(days[0]!.dateKey, start.toISOString().slice(0, 10));
  });
});

describe("selectBlowoutDayIndices", () => {
  it("is stable for a fixed seed", () => {
    const a = [...selectBlowoutDayIndices(30, 500)].sort();
    const b = [...selectBlowoutDayIndices(30, 500)].sort();
    assert.deepEqual(a, b);
  });
});

describe("fakeSha256Hex", () => {
  it("returns 64 hex chars deterministically", () => {
    const rng = createRng(9);
    assert.match(fakeSha256Hex(rng), /^[0-9a-f]{64}$/);
  });
});
