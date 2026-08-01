import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestI18nInstance } from "@nutriagent/shared/locales/testI18n";

describe("admin-portal i18n (Task 7.4)", () => {
  it("changeLanguage updates admin shell labels", async () => {
    const i18n = await createTestI18nInstance();

    await i18n.changeLanguage("he");
    assert.equal(i18n.t("admin.portalTitle"), "פורטל ניהול");
    assert.equal(i18n.t("admin.users"), "משתמשים");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("admin.portalTitle"), "Admin Portal");
    assert.equal(i18n.t("admin.users"), "Users");
  });

  it("table column headers differ between Hebrew and English", async () => {
    const i18n = await createTestI18nInstance();
    const keys = ["admin.tableName", "admin.tableEmail", "admin.tableRole", "admin.tableStatus"] as const;

    for (const key of keys) {
      await i18n.changeLanguage("he");
      const heLabel = i18n.t(key);
      await i18n.changeLanguage("en");
      const enLabel = i18n.t(key);
      assert.notEqual(heLabel, enLabel, key);
    }
  });
});
