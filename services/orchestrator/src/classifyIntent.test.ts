import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIntent } from "./utils.js";

describe("classifyIntent scope guardrail", () => {
  it("routes obvious off-topic chat to out_of_scope", () => {
    assert.equal(classifyIntent("write python code for a website", false), "out_of_scope");
    assert.equal(classifyIntent("what's the weather today", false), "out_of_scope");
    assert.equal(classifyIntent("what is the wether?", false), "out_of_scope");
    assert.equal(classifyIntent("how docker works?", false), "out_of_scope");
  });

  it("does not override meal photos", () => {
    assert.equal(classifyIntent("what's the weather today", true), "meal_analysis");
  });

  it("keeps nutrition questions on existing paths", () => {
    assert.equal(classifyIntent("how many calories did I eat today", false), "history_query");
    assert.equal(classifyIntent("what is keto diet", false), "question");
    assert.equal(classifyIntent("what should I eat now", false), "general_chat");
  });
});
