import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { enTranslations } from "./en";
import { heTranslations } from "./he";
import { ruTranslations } from "./ru";
import { leafKeys } from "./keyPaths";
import { formatI18nUsageReport, translationKeyIssues, validateI18nUsage } from "./validateUsage";

describe("UI locale files (Task 7.1)", () => {
  it("en, he, and ru share the same translation key paths", () => {
    const enKeys = leafKeys(enTranslations as Record<string, unknown>);
    assert.deepEqual(enKeys, leafKeys(heTranslations as Record<string, unknown>));
    assert.deepEqual(enKeys, leafKeys(ruTranslations as Record<string, unknown>));
  });
});

describe("UI locale usage (Task 7.3)", () => {
  it("every t() / i18n.t() key in apps exists in en.ts and he.ts", () => {
    const repoRoot = path.resolve(__dirname, "../../../..");
    const report = validateI18nUsage(repoRoot);

    assert.equal(
      report.ok,
      true,
      report.ok ? undefined : `\n${formatI18nUsageReport(report)}\n`
    );
  });

  it("flags keys absent from en.ts or he.ts", () => {
    const missing = translationKeyIssues("this.key.is.not.in.locale.files");
    assert.equal(missing.length, 1);
    assert.equal(missing[0]!.reason, "missing-from-en");

    assert.deepEqual(translationKeyIssues("common.loading"), []);
  });
});
