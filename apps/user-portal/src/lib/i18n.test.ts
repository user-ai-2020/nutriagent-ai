import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestI18nInstance } from "@nutriagent/shared/locales/testI18n";

const NAV_TAB_KEYS = [
  "nav.chat",
  "nav.dashboard",
  "nav.summary",
  "nav.mealAnalysis",
  "nav.nutrients",
  "nav.settings",
] as const;

describe("user-portal i18n (Task 7.4)", () => {
  it("changeLanguage updates displayed strings, not just internal state", async () => {
    const i18n = await createTestI18nInstance();

    await i18n.changeLanguage("he");
    assert.equal(i18n.t("nav.chat"), "צ'אט");
    assert.equal(i18n.t("chat.analyzeMeal"), "נתח את הארוחה הזו");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("nav.chat"), "Chat");
    assert.equal(i18n.t("chat.analyzeMeal"), "Analyze this meal");
  });

  it("all six tab titles change when switching he ↔ en", async () => {
    const i18n = await createTestI18nInstance();

    for (const key of NAV_TAB_KEYS) {
      await i18n.changeLanguage("he");
      const heLabel = i18n.t(key);
      await i18n.changeLanguage("en");
      const enLabel = i18n.t(key);
      assert.notEqual(heLabel, enLabel, key);
    }
  });

  it("resolves known keys in Hebrew without returning raw key paths", async () => {
    const i18n = await createTestI18nInstance();
    await i18n.changeLanguage("he");

    for (const key of ["nav.chat", "auth.signIn", "chat.analyzeMeal"] as const) {
      const value = i18n.t(key);
      assert.notEqual(value, key, `${key} should not echo the raw key`);
      assert.match(value, /[\u0590-\u05FF]/, `${key} should resolve to Hebrew copy`);
    }
  });

  it("uses English fallbackLng when lookup key is absent from both bundles", async () => {
    const i18n = await createTestI18nInstance();
    await i18n.changeLanguage("he");
    const bogusKey = ["totally", "missing", "key"].join(".");
    const value = i18n.t(bogusKey);
    assert.equal(value, bogusKey, "i18next default for absent keys (caught by 7.3 lint in app code)");
  });
});
