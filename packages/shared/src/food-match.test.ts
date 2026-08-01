import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalPrimaryToken, isSameFoodItem, primaryFoodToken } from "./food-match";

describe("isSameFoodItem", () => {
  it("merges croissant variants that describe one pastry", () => {
    assert.equal(
      isSameFoodItem("croissant with cheese", "croissant with jam topping"),
      true
    );
    assert.equal(isSameFoodItem("cheese croissant", "croissant"), true);
  });

  it("does not merge different base foods", () => {
    assert.equal(isSameFoodItem("croissant", "strawberry"), false);
    assert.equal(isSameFoodItem("grilled chicken", "steamed broccoli"), false);
  });

  it("keeps distinct strawberries as separate items", () => {
    assert.equal(
      isSameFoodItem("strawberry (whole, bottom center)", "strawberry (sliced half, left)"),
      false
    );
  });

  it("merges penne pasta dish labels", () => {
    assert.equal(isSameFoodItem("penne pasta", "penne pasta with tomato sauce"), true);
  });

  it("merges pancake stack variants but not blueberries-on-pancakes with pancakes", () => {
    assert.equal(isSameFoodItem("pancake stack", "pancakes"), true);
    assert.equal(isSameFoodItem("stack of pancakes", "pancakes"), true);
    assert.equal(isSameFoodItem("pancake stack", "stack of pancakes"), true);
    assert.equal(isSameFoodItem("blueberries on pancakes", "pancakes"), false);
  });

  it("merges blueberry compound labels with plain blueberries", () => {
    assert.equal(isSameFoodItem("blueberries on pancakes", "blueberries scattered"), true);
    assert.equal(isSameFoodItem("blueberries on pancakes", "blueberries"), true);
    assert.equal(isSameFoodItem("blueberries scattered", "blueberries"), true);
  });

  it("merges syrup bowl labels with plain syrup", () => {
    assert.equal(isSameFoodItem("honey or syrup in bowl", "syrup"), true);
    assert.equal(isSameFoodItem("honey or syrup in bowl", "syrup in bowl"), true);
  });

  it("does not merge and-joined plate labels with a single component food", () => {
    assert.equal(isSameFoodItem("chicken and rice", "rice"), false);
    assert.equal(isSameFoodItem("rice and chicken", "rice"), false);
    assert.equal(isSameFoodItem("chicken and rice", "chicken"), false);
  });

  it("merges cherry tomato singular/plural variants (regression)", () => {
    assert.equal(isSameFoodItem("cherry tomatoes", "cherry tomato"), true);
  });

  it("merges parsley garnish descriptor labels with plain parsley", () => {
    assert.equal(isSameFoodItem("fresh parsley garnish", "parsley"), true);
    assert.equal(isSameFoodItem("fresh parsley garnish", "parsley garnish"), true);
    assert.equal(isSameFoodItem("parsley garnish", "parsley"), true);
  });

  it("does not treat garnish alone as parsley", () => {
    assert.equal(isSameFoodItem("garnish", "parsley"), false);
  });

  it("does not merge same pasta base with different sauce modifiers", () => {
    assert.equal(
      isSameFoodItem("penne pasta with tomato sauce", "penne pasta with meat sauce"),
      false
    );
    assert.equal(isSameFoodItem("penne pasta with tomato sauce", "penne pasta"), true);
  });
});

describe("canonicalPrimaryToken", () => {
  it("normalizes pancake and syrup variants", () => {
    assert.equal(canonicalPrimaryToken("pancakes"), "pancake");
    assert.equal(canonicalPrimaryToken("pancake stack"), "pancake");
    assert.equal(canonicalPrimaryToken("stack of pancakes"), "pancake");
    assert.equal(canonicalPrimaryToken("honey or syrup in bowl"), "syrup");
    assert.equal(canonicalPrimaryToken("blueberries"), "blueberr");
  });
});

describe("primaryFoodToken", () => {
  it("resolves stack of pancakes to pancakes not stack", () => {
    assert.equal(primaryFoodToken("stack of pancakes"), "stack of pancakes");
    assert.equal(primaryFoodToken("pancake stack"), "pancake stack");
  });

  it("uses the head noun before prepositions, not trailing substring matches", () => {
    assert.equal(primaryFoodToken("blueberries on pancakes"), "blueberr");
    assert.equal(primaryFoodToken("cheese croissant"), "croissant");
  });
});
