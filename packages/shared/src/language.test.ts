import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectTextLanguage,
  getDefaultResponseLanguage,
  normalizePreferredLanguage,
  resolveResponseLanguage,
  responseLanguageInstruction,
} from "./language.js";

describe("detectTextLanguage", () => {
  it("detects Hebrew from script", () => {
    assert.equal(detectTextLanguage("כמה חלבון מומלץ ביום?"), "he");
  });

  it("detects English from Latin text", () => {
    assert.equal(detectTextLanguage("How much protein per day?"), "en");
  });

  it("detects Russian from Cyrillic script", () => {
    assert.equal(detectTextLanguage("Привет, сколько белка мне нужно?"), "ru");
  });

  it("short-circuits to Hebrew on script before franc-min (single-word query)", () => {
    assert.equal(detectTextLanguage("חלבון?"), "he");
    assert.equal(resolveResponseLanguage("חלבון?", undefined), "he");
    assert.match(responseLanguageInstruction(resolveResponseLanguage("חלבון?", undefined)), /עברית/);
  });

  it("short-circuits to Russian on Cyrillic before franc-min", () => {
    assert.equal(detectTextLanguage("белок"), "ru");
  });
});

describe("resolveResponseLanguage", () => {
  it("prefers profile override over detection", () => {
    assert.equal(resolveResponseLanguage("How much protein?", "he"), "he");
    assert.equal(resolveResponseLanguage("כמה חלבון?", "en"), "en");
    assert.equal(resolveResponseLanguage("How much protein?", "ru"), "ru");
  });

  it("enforces Russian output preference even for English questions", () => {
    assert.equal(resolveResponseLanguage("How much protein do I need?", "ru"), "ru");
    assert.match(responseLanguageInstruction("ru"), /Russian|русск/i);
    assert.match(responseLanguageInstruction("ru"), /MUST respond ONLY/i);
  });

  it("falls back to detection when profile unset", () => {
    assert.equal(resolveResponseLanguage("How much protein?", undefined), "en");
  });
});

describe("responseLanguageInstruction", () => {
  it("returns Hebrew instruction for he", () => {
    assert.match(responseLanguageInstruction("he"), /עברית/);
    assert.match(responseLanguageInstruction("he"), /MUST respond ONLY/i);
  });

  it("returns English instruction for en", () => {
    assert.match(responseLanguageInstruction("en"), /English/i);
    assert.match(responseLanguageInstruction("en"), /MUST respond ONLY/i);
  });

  it("returns Russian instruction for ru", () => {
    assert.match(responseLanguageInstruction("ru"), /русск/i);
  });
});

describe("normalizePreferredLanguage", () => {
  it("accepts he, en, and ru only", () => {
    assert.equal(normalizePreferredLanguage("he"), "he");
    assert.equal(normalizePreferredLanguage("en"), "en");
    assert.equal(normalizePreferredLanguage("ru"), "ru");
    assert.equal(normalizePreferredLanguage("fr"), null);
    assert.equal(normalizePreferredLanguage(null), null);
  });
});

describe("getDefaultResponseLanguage", () => {
  it("defaults to English when env unset", () => {
    const prev = process.env.DEFAULT_RESPONSE_LANGUAGE;
    delete process.env.DEFAULT_RESPONSE_LANGUAGE;
    assert.equal(getDefaultResponseLanguage(), "en");
    process.env.DEFAULT_RESPONSE_LANGUAGE = prev;
  });
});
