import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  htmlDirection,
  languageFromCookieValue,
  normalizePreferredLanguage,
} from "./languageCookie.ts";

describe("languageCookie (SSR helpers)", () => {
  it("maps cookie values to lang and dir for server layout", () => {
    assert.equal(languageFromCookieValue("he"), "he");
    assert.equal(htmlDirection("he"), "rtl");
    assert.equal(languageFromCookieValue("en"), "en");
    assert.equal(htmlDirection("en"), "ltr");
    assert.equal(languageFromCookieValue("ru"), "ru");
    assert.equal(htmlDirection("ru"), "ltr");
    assert.equal(languageFromCookieValue(undefined), "en");
    assert.equal(normalizePreferredLanguage("fr"), null);
    assert.equal(normalizePreferredLanguage("ru"), "ru");
  });
});
