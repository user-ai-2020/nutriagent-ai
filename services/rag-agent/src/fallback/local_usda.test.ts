import test from "node:test";
import assert from "node:assert";
import { searchTrustedSources } from "./trustedSearch.js";
import { prisma } from "@nutriagent/db";

test("searchUSDA uses local DB first", async (t) => {
  const originalFindFirst = prisma.localFood.findFirst;
  // @ts-expect-error mock
  prisma.localFood.findFirst = async () => {
    return {
      id: 1,
      fdcId: 123,
      description: "Apple, raw",
      calories: 52,
      protein: 0.3,
      fat: 0.2,
      carbs: 14,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  };

  try {
    const mockFetch = t.mock.fn(async () => {
      return new Response(JSON.stringify({ foods: [] }), { status: 200 });
    });

    // @ts-expect-error mock
    const results = await searchTrustedSources("calories in an apple", mockFetch);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].domain, "local.fdc");
    assert.strictEqual(results[0].title, "Local USDA Food: Apple, raw");
    assert.strictEqual(mockFetch.mock.callCount(), 0);
  } finally {
    prisma.localFood.findFirst = originalFindFirst;
  }
});
