import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIntent } from "./utils.js";

describe("classifyIntent scope guardrail", () => {
  it("routes obvious off-topic chat to out_of_scope", () => {
    assert.equal(classifyIntent("write python code for a website", false), "out_of_scope");
    assert.equal(classifyIntent("what's the weather today", false), "out_of_scope");
    assert.equal(classifyIntent("what is the wether?", false), "out_of_scope");
    assert.equal(classifyIntent("how docker works?", false), "out_of_scope");
    assert.equal(classifyIntent("what is football?", false), "out_of_scope");
    assert.equal(classifyIntent("what is minecraft?", false), "out_of_scope");
  });

  it("does not override meal photos", () => {
    assert.equal(classifyIntent("what's the weather today", true), "meal_analysis");
  });

  it("keeps nutrition questions on existing paths", () => {
    assert.equal(classifyIntent("how many calories did I eat today", false), "history_query");
    assert.equal(classifyIntent("what is keto diet", false), "question");
    assert.equal(classifyIntent("what should football players eat", false), "general_chat");
    assert.equal(classifyIntent("What did I eat yesterday?", false), "history_query");
    assert.equal(classifyIntent("what should I eat for dinner", false), "general_chat");
  });
});

describe("classifyIntent range/aggregate words", () => {
  it("does not send general questions to the history path just for a connective", () => {
    // Regression: bare substring matches on "between", "from " and "average"
    // routed these to Text2SQL, which then tried to answer them from the user's
    // meals table.
    assert.equal(
      classifyIntent("what is the difference between keto and paleo", false),
      "question"
    );
    assert.equal(
      classifyIntent("which vitamins come from carrots", false),
      "general_chat"
    );
    assert.equal(
      classifyIntent("what is the average calorie need for adults", false),
      "question"
    );
  });

  it("still routes the same words to history when they are about the user's own data", () => {
    assert.equal(
      classifyIntent("what did I eat between monday and friday", false),
      "history_query"
    );
    assert.equal(classifyIntent("what is my average calorie intake", false), "history_query");
    assert.equal(classifyIntent("show my meals from last week", false), "history_query");
  });
});
