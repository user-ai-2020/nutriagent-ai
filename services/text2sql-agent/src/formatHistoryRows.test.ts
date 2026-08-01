import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHistoryRows, formatMealDatetime, localizeMealType } from "./formatHistoryRows";

describe("localizeMealType", () => {
  it("maps English DB meal types into Hebrew labels", () => {
    assert.equal(localizeMealType("lunch", "he"), "ארוחת צהריים");
    assert.equal(localizeMealType("Dinner", "he"), "ארוחת ערב");
    assert.equal(localizeMealType("snack", "ru"), "Перекус");
    assert.equal(localizeMealType("breakfast", "en"), "Breakfast");
  });
});

describe("formatMealDatetime", () => {
  it("returns a locale-formatted non-empty label", () => {
    const label = formatMealDatetime("2026-07-30T14:37:00.000Z", "he");
    assert.ok(label.length > 4);
    assert.notEqual(label, "2026-07-30T14:37:00.000Z");
  });
});

describe("formatHistoryRows", () => {
  const rows = [
    {
      meal_datetime: "2026-07-30T14:37:00.000Z",
      meal_type: "lunch",
      food_type: "Nothing",
      estimated_quantity: "100g",
      calories: 100,
      protein: 0,
      fat: 0,
      carbs: 0,
    },
    {
      meal_datetime: "2026-07-30T17:09:00.000Z",
      meal_type: "dinner",
      food_type: "shakshuka with eggs and tomato sauce",
      estimated_quantity: "600g",
      calories: 108,
      protein: 0,
      fat: 0,
      carbs: 0,
    },
  ];

  it("localizes Hebrew headers, meal types, and kcal units", () => {
    const text = formatHistoryRows(rows, "he");
    assert.match(text, /נמצאו 1 ארוחות/);
    assert.match(text, /ארוחת ערב/);
    assert.match(text, /קק"ל/);
    assert.match(text, /סה"כ/);
    assert.doesNotMatch(text, /\blunch\b/i);
    assert.doesNotMatch(text, /\bdinner\b/i);
    assert.doesNotMatch(text, /\bkcal\b/i);
    assert.doesNotMatch(text, /Nothing|כלום/i);
  });

  it("localizes Russian headers and meal types", () => {
    const text = formatHistoryRows(rows, "ru");
    assert.match(text, /Найдено приёмов пищи: 1/);
    assert.match(text, /Ужин/);
    assert.match(text, /ккал/);
    assert.doesNotMatch(text, /Nothing/i);
  });

  it("omits placeholder food rows like Nothing from history", () => {
    const text = formatHistoryRows(rows, "en");
    assert.doesNotMatch(text, /Nothing/i);
    assert.match(text, /shakshuka/i);
    assert.match(text, /Found 1 logged meal/);
  });
});
