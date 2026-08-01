import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isObjectiveFact } from "./utils.js";

describe("isObjectiveFact", () => {
  // ── Objective facts → should return true (safe to cache globally, userId=null) ──

  it("how many calories in an apple → objective (global cache)", () => {
    assert.equal(isObjectiveFact("how many calories in an apple"), true);
  });

  it("how much protein in chicken breast → objective (global cache)", () => {
    assert.equal(isObjectiveFact("how much protein in chicken breast"), true);
  });

  it("what is a keto diet → objective (global cache)", () => {
    assert.equal(isObjectiveFact("what is a keto diet"), true);
  });

  it("what is the mediterranean diet → objective (global cache)", () => {
    assert.equal(isObjectiveFact("what is the mediterranean diet"), true);
  });

  it("what is diabetes → objective (global cache)", () => {
    assert.equal(isObjectiveFact("what is diabetes"), true);
  });

  it("what causes celiac disease → objective (global cache)", () => {
    assert.equal(isObjectiveFact("what causes celiac disease"), true);
  });

  it("what are the symptoms of lactose intolerance → objective (global cache)", () => {
    assert.equal(isObjectiveFact("what are the symptoms of lactose intolerance"), true);
  });

  it("calories in avocado → objective (global cache)", () => {
    assert.equal(isObjectiveFact("calories in avocado"), true);
  });

  it("protein in lentils → objective (global cache)", () => {
    assert.equal(isObjectiveFact("protein in lentils"), true);
  });

  // ── Personal/medical context → should return false (user-scoped, userId=<id>) ──

  it("our family has a history of diabetes → user-scoped", () => {
    assert.equal(
      isObjectiveFact("our family has a history of diabetes, what should I watch for"),
      false
    );
  });

  it("is peanut butter safe for a kid with a peanut allergy → user-scoped", () => {
    assert.equal(
      isObjectiveFact("is peanut butter safe for a kid with a peanut allergy"),
      false
    );
  });

  it("what should I eat for dinner → user-scoped (personal pronoun)", () => {
    assert.equal(isObjectiveFact("what should I eat for dinner"), false);
  });

  it("my doctor told me to avoid gluten → user-scoped (my)", () => {
    assert.equal(isObjectiveFact("my doctor told me to avoid gluten"), false);
  });

  it("what should we have for breakfast → user-scoped (we)", () => {
    assert.equal(isObjectiveFact("what should we have for breakfast"), false);
  });

  it("son has lactose intolerance, what can he eat → user-scoped (son)", () => {
    assert.equal(
      isObjectiveFact("my son has lactose intolerance, what can he eat"),
      false
    );
  });

  it("our children are vegetarian → user-scoped (our + children)", () => {
    assert.equal(
      isObjectiveFact("our children are vegetarian, what protein sources should they eat"),
      false
    );
  });

  // ── Edge cases ──

  it("bare 'diet' with no what-is prefix → user-scoped (too vague to be objective)", () => {
    // Plain "diet" alone is ambiguous — should NOT be cached globally
    assert.equal(isObjectiveFact("diet advice for weight loss"), false);
  });

  // ── Third-person pronoun / possessive-name cases (new) ──

  it("\"what is his cholesterol level\" → user-scoped (third-person pronoun: his)", () => {
    // personalSignals: /\bhis\b/ → MATCH → return false immediately
    assert.equal(isObjectiveFact("what is his cholesterol level"), false);
  });

  it("\"what is her blood sugar\" → user-scoped (third-person pronoun: her)", () => {
    assert.equal(isObjectiveFact("what is her blood sugar"), false);
  });

  it("\"what is their diet plan\" → user-scoped (third-person pronoun: their)", () => {
    assert.equal(isObjectiveFact("what is their diet plan"), false);
  });

  it("\"what is bob's blood type\" → user-scoped (possessive proper noun: apostrophe-s)", () => {
    // personalSignals: /'s\s+\w/ → MATCH → return false immediately
    assert.equal(isObjectiveFact("what is bob's blood type"), false);
  });

  it("\"what is sarah's cholesterol\" → user-scoped (possessive proper noun)", () => {
    assert.equal(isObjectiveFact("what is sarah's cholesterol"), false);
  });

  it("\"he's lactose intolerant, what can he eat\" → user-scoped (he's)", () => {
    assert.equal(isObjectiveFact("he's lactose intolerant, what can he eat"), false);
  });

  it("\"she's allergic to gluten\" → user-scoped (she's)", () => {
    assert.equal(isObjectiveFact("she's allergic to gluten"), false);
  });

  it("\"what is a peanut allergy\" → objective/global (no personal pronoun, no family noun, matches what-is pattern)", () => {
    // Regex trace:
    //   personalSignals → no match (my/I/our/we/family/kid/child/... none present)
    //   objectivePatterns[3] /^what\s+is\s+(a|an|the)?\s*[a-z]/i → MATCH
    // Result: true (safe to cache globally — this is a definition lookup, same as "what is diabetes")
    assert.equal(isObjectiveFact("what is a peanut allergy"), true);
  });

  it("\"what causes a peanut allergy\" → objective/global (generic causation, no personal context)", () => {
    // Regex trace:
    //   personalSignals → no match
    //   objectivePatterns[4] /^what\s+(causes|...)/i → MATCH
    // Result: true (safe to cache globally — generic medical fact query)
    assert.equal(isObjectiveFact("what causes a peanut allergy"), true);
  });

  it("\"is peanut butter safe for a kid with a peanut allergy\" → user-scoped (family noun: kid)", () => {
    // Regex trace:
    //   personalSignals /\bkid\b/ → MATCH → return false immediately
    // Result: false (user-scoped — "kid" signals relational/personal context)
    // This is the same query from the original design doc that motivated the heuristic fix.
    assert.equal(isObjectiveFact("is peanut butter safe for a kid with a peanut allergy"), false);
  });

  it("case-insensitive: HOW MANY CALORIES IN AN EGG → objective", () => {
    assert.equal(isObjectiveFact("HOW MANY CALORIES IN AN EGG"), true);
  });
});
