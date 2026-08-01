import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestI18nInstance } from "@nutriagent/shared/locales/testI18n";

describe("mobile i18n (Task 7.4)", () => {
  it("changeLanguage updates tab titles and chat CTAs", async () => {
    const i18n = await createTestI18nInstance();

    await i18n.changeLanguage("he");
    assert.equal(i18n.t("nav.settings"), "הגדרות");
    assert.equal(i18n.t("chat.quickReplyEatNow"), "מה כדאי לי לאכול עכשיו?");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("nav.settings"), "Settings");
    assert.equal(i18n.t("chat.quickReplyEatNow"), "What should I eat now?");
  });

  it("RTL reload alert strings are localized before reload flow", async () => {
    const i18n = await createTestI18nInstance();

    await i18n.changeLanguage("he");
    assert.match(i18n.t("system.rtlReloadTitle"), /[\u0590-\u05FF]/);
    assert.match(i18n.t("system.rtlReloadMessage"), /[\u0590-\u05FF]/);

    await i18n.changeLanguage("en");
    assert.match(i18n.t("system.rtlReloadTitle"), /Restart required/i);
  });
});
