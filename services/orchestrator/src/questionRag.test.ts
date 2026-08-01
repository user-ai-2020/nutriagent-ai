import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { questionRagNode } from "./graph.js";

describe("questionRagNode claim verification", () => {
  it("reprompts when no citations are found and appends disclaimer if still missing", async () => {
    let callCount = 0;
    const originalFetch = global.fetch;
    
    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "This is a substantive answer with over 100 characters, explaining lots of things but with absolutely no brackets or citations." } }]
        }),
        text: async () => ""
      } as any;
    };

    try {
      const state = {
        request: { message: "What is protein?", profile: null },
        intent: "question" as const,
        agentPath: [],
        sources: ["Source A"],
        ragResult: { context: ["Some context here"], sources: ["Source A"] },
        graphRecommendations: []
      } as any;

      const result = await questionRagNode(state);

      assert.equal(callCount, 2, "Should have called LLM twice");
      assert.match(result.response.reply, /Note: this answer could not be fully verified against sources\./);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("does not reprompt if citations are present on the first try", async () => {
    let callCount = 0;
    const originalFetch = global.fetch;
    
    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "This is a substantive answer with over 100 characters. According to [Source A], it has citations." } }]
        }),
        text: async () => ""
      } as any;
    };

    try {
      const state = {
        request: { message: "What is protein?", profile: null },
        intent: "question" as const,
        agentPath: [],
        sources: ["Source A"],
        ragResult: { context: ["Some context here"], sources: ["Source A"] },
        graphRecommendations: []
      } as any;

      const result = await questionRagNode(state);

      assert.equal(callCount, 1, "Should have called LLM once");
      assert.doesNotMatch(result.response.reply, /Note: this answer could not be fully verified against sources\./);
    } finally {
      global.fetch = originalFetch;
    }
  });
  
  it("does not reprompt if the answer is very short (e.g. no info)", async () => {
    let callCount = 0;
    const originalFetch = global.fetch;
    
    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "I do not have enough information." } }]
        }),
        text: async () => ""
      } as any;
    };

    try {
      const state = {
        request: { message: "What is protein?", profile: null },
        intent: "question" as const,
        agentPath: [],
        sources: ["Source A"],
        ragResult: { context: ["Some context here"], sources: ["Source A"] },
        graphRecommendations: []
      } as any;

      const result = await questionRagNode(state);

      assert.equal(callCount, 1, "Should have called LLM once");
      assert.doesNotMatch(result.response.reply, /Note: this answer could not be fully verified against sources\./);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
