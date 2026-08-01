import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enTranslations } from "./en";
import { heTranslations } from "./he";
import { ruTranslations } from "./ru";
import { leafKeys } from "./keyPaths";

type LocaleTree = Record<string, unknown>;

function translationAt(tree: LocaleTree, dottedKey: string): string {
  const parts = dottedKey.split(".");
  let node: unknown = tree;
  for (const part of parts) {
    assert.ok(node && typeof node === "object", `missing segment ${part} in ${dottedKey}`);
    node = (node as LocaleTree)[part];
  }
  assert.equal(typeof node, "string", `expected string at ${dottedKey}`);
  return node as string;
}

/** Six primary tab titles (full labels). */
const NAV_TAB_KEYS = [
  "nav.chat",
  "nav.dashboard",
  "nav.summary",
  "nav.mealAnalysis",
  "nav.nutrients",
  "nav.settings",
] as const;

/** Primary CTA / quick-reply strings called out in Task 7.2. */
const PRIMARY_CTA_KEYS = [
  "chat.analyzeMeal",
  "chat.quickReplyEatNow",
  "chat.quickReplyYesterday",
  "chat.placeholder",
  "auth.signIn",
  "settings.title",
] as const;

describe("UI locale content (Task 7.4)", () => {
  it("Hebrew and English differ for all six nav tab titles", () => {
    for (const key of NAV_TAB_KEYS) {
      const en = translationAt(enTranslations as LocaleTree, key);
      const he = translationAt(heTranslations as LocaleTree, key);
      assert.notEqual(en, he, `${key} should differ between locales`);
      assert.match(he, /[\u0590-\u05FF]/, `${key} Hebrew value should contain Hebrew script`);
    }
  });

  it("Russian nav titles use Cyrillic and differ from English", () => {
    for (const key of NAV_TAB_KEYS) {
      const en = translationAt(enTranslations as LocaleTree, key);
      const ru = translationAt(ruTranslations as LocaleTree, key);
      assert.notEqual(en, ru, `${key} should differ between en and ru`);
      assert.match(ru, /[\u0400-\u04FF]/, `${key} Russian value should contain Cyrillic`);
    }
  });

  it("Hebrew and English differ for primary CTA and form strings", () => {
    for (const key of PRIMARY_CTA_KEYS) {
      const en = translationAt(enTranslations as LocaleTree, key);
      const he = translationAt(heTranslations as LocaleTree, key);
      assert.notEqual(en, he, `${key} should differ between locales`);
    }
  });

  it("admin portal table headers are translated in Hebrew", () => {
    for (const key of [
      "admin.tableName",
      "admin.tableEmail",
      "admin.tableRole",
      "admin.tableStatus",
    ] as const) {
      const he = translationAt(heTranslations as LocaleTree, key);
      assert.match(he, /[\u0590-\u05FF]/, `${key} should be Hebrew`);
    }
  });

  it("every leaf key has non-empty strings in en, he, and ru", () => {
    const keys = leafKeys(enTranslations as LocaleTree);
    for (const key of keys) {
      const en = translationAt(enTranslations as LocaleTree, key);
      const he = translationAt(heTranslations as LocaleTree, key);
      const ru = translationAt(ruTranslations as LocaleTree, key);
      assert.ok(en.trim().length > 0, `${key} en is empty`);
      assert.ok(he.trim().length > 0, `${key} he is empty`);
      assert.ok(ru.trim().length > 0, `${key} ru is empty`);
    }
  });
});
