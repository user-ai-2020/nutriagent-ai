import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchCitationId, resolveCitationDisplay, CITATION_SOURCES } from "./citation-sources";

describe("citation localization", () => {
  const t = (key: string) => {
    const map: Record<string, string> = {
      "chat.sourceLabels.israelFoodUnion": "Israeli Food Union / MOH",
      "chat.sourceLabels.balancedSnacksMoh": "Balanced snacks — Food Union / MOH",
      "chat.sourceLabels.driWho": "DRI / WHO",
    };
    return map[key] ?? key;
  };

  it("maps Hebrew seed title to MOH source label + URL", () => {
    const r = resolveCitationDisplay(
      { title: "ארוחות ביניים מאוזנות — איחוד המזון / משרד הבריאות", url: "" },
      t
    );
    assert.equal(r.label, "Balanced snacks — Food Union / MOH");
    assert.ok(r.url?.includes("health.gov.il"));
  });

  it("maps id strings to localized labels with optional URL", () => {
    const r = resolveCitationDisplay(CITATION_SOURCES.DRI_WHO, t);
    assert.equal(r.label, "DRI / WHO");
    assert.ok(r.url?.includes("who.int"));
  });

  it("matchCitationId detects food-union titles", () => {
    assert.equal(
      matchCitationId("ארוחות ביניים מאוזנות — איחוד המזון / משרד הבריאות"),
      CITATION_SOURCES.ISRAEL_FOOD_UNION
    );
  });
});
