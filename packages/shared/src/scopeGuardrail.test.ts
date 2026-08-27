import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClearlyOutOfScope,
  isScopeRefusalReply,
  outOfScopeReply,
  scopeGuardrailInstruction,
} from "./scopeGuardrail.js";

describe("isClearlyOutOfScope", () => {
  it("keeps nutrition and health questions in scope", () => {
    assert.equal(isClearlyOutOfScope("How much protein should I eat?"), false);
    assert.equal(isClearlyOutOfScope("what is a keto diet"), false);
    assert.equal(isClearlyOutOfScope("כמה קלוריות בארוחה"), false);
    assert.equal(isClearlyOutOfScope("Сколько белка мне нужно?"), false);
    assert.equal(isClearlyOutOfScope("What should I eat now?"), false);
    assert.equal(isClearlyOutOfScope("hi"), false);
  });

  it("refuses obvious off-topic questions", () => {
    assert.equal(isClearlyOutOfScope("write python code for a website"), true);
    assert.equal(isClearlyOutOfScope("what's the weather today"), true);
    assert.equal(isClearlyOutOfScope("who won the election"), true);
    assert.equal(isClearlyOutOfScope("כתוב קוד בפייתון"), true);
    assert.equal(isClearlyOutOfScope("מה מזג האוויר היום"), true);
    assert.equal(isClearlyOutOfScope("напиши код на python"), true);
    assert.equal(isClearlyOutOfScope("какая погода завтра"), true);
    assert.equal(isClearlyOutOfScope("should I buy bitcoin"), true);
    assert.equal(isClearlyOutOfScope("what is the wether?"), true);
    assert.equal(isClearlyOutOfScope("how docker works?"), true);
  });

  it("does not refuse nutrition questions that mention today/history words", () => {
    assert.equal(isClearlyOutOfScope("how many calories did I eat today"), false);
    assert.equal(isClearlyOutOfScope("מה אכלתי אתמול"), false);
  });
});

describe("scopeGuardrailInstruction", () => {
  it("states nutrition-only scope and a refuse rule", () => {
    const text = scopeGuardrailInstruction();
    assert.match(text, /ONLY answer/i);
    assert.match(text, /politely refuse/i);
    assert.match(text, /nutrition/i);
  });
});

describe("isScopeRefusalReply", () => {
  it("detects a polite off-topic refusal", () => {
    assert.equal(
      isScopeRefusalReply(
        "I'm sorry, but I can't provide information about the weather. If you have questions about meals, nutrition, or health, feel free to ask!"
      ),
      true
    );
    assert.equal(
      isScopeRefusalReply("I'm here to assist with nutrition and wellness questions. Feel free to ask!"),
      true
    );
  });

  it("does not flag a normal nutrition answer", () => {
    assert.equal(
      isScopeRefusalReply(
        "Chicken breast has about 31g of protein per 100g. Pair it with vegetables for a balanced meal."
      ),
      false
    );
  });
});

describe("outOfScopeReply", () => {
  it("returns localized refusals", () => {
    assert.match(outOfScopeReply("en"), /nutrition and health/i);
    assert.match(outOfScopeReply("he"), /תזונה/);
    assert.match(outOfScopeReply("ru"), /питани/);
  });
});
