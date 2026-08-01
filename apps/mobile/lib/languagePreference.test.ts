import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rtlRequired } from "./rtlRequired";

describe("languagePreference (Task 7.4)", () => {
  it("requires RTL layout only for Hebrew", () => {
    assert.equal(rtlRequired("he"), true);
    assert.equal(rtlRequired("en"), false);
  });
});
