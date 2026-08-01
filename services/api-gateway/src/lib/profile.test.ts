import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toUserProfileData } from "./profile.js";

describe("toUserProfileData", () => {
  it("maps preferredLanguage when set to he or en", () => {
    const data = toUserProfileData({
      profileId: 1,
      userId: 1,
      dietGoals: {},
      healthRestrictions: [],
      allergies: [],
      dietType: null,
      weight: null,
      height: null,
      age: null,
      dailyStepsGoal: 8000,
      todaySteps: 0,
      preferredLanguage: "he",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(data?.preferredLanguage, "he");
  });

  it("omits invalid preferredLanguage values", () => {
    const data = toUserProfileData({
      profileId: 1,
      userId: 1,
      dietGoals: {},
      healthRestrictions: [],
      allergies: [],
      dietType: null,
      weight: null,
      height: null,
      age: null,
      dailyStepsGoal: 8000,
      todaySteps: 0,
      preferredLanguage: "fr",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(data?.preferredLanguage, undefined);
  });
});
