import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localizeFoodDisplayName, localizeMealTitle } from "./foodDisplayName";

describe("localizeFoodDisplayName", () => {
  it("leaves English unchanged", () => {
    assert.equal(localizeFoodDisplayName("penne pasta with tomato sauce", "en"), "penne pasta with tomato sauce");
  });

  it("translates full dish phrases to Russian", () => {
    assert.equal(
      localizeFoodDisplayName("penne pasta with tomato sauce", "ru"),
      "пенне в томатном соусе"
    );
  });

  it("translates shakshuka and bread", () => {
    assert.equal(localizeFoodDisplayName("shakshuka", "ru"), "шакшука");
    assert.equal(localizeFoodDisplayName("bread", "he"), "לחם");
  });

  it("translates cherry tomatoes and parsley", () => {
    assert.equal(localizeFoodDisplayName("cherry tomatoes", "ru"), "помидоры черри");
    assert.equal(localizeFoodDisplayName("parsley", "he"), "פטרוזיליה");
  });

  it("localizes multi-item titles", () => {
    const title = localizeMealTitle(["shakshuka", "bread"], "ru");
    assert.equal(title, "шакшука, хлеб");
  });
});
