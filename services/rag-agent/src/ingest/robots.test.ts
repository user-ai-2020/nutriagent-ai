import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPathAllowed, parseRobotsTxt } from "./robots.js";

describe("parseRobotsTxt", () => {
  it("parses Disallow rules for User-agent: *", () => {
    const rules = parseRobotsTxt(`User-agent: *\nDisallow: /private/\nDisallow: /admin\n`);
    assert.deepEqual(rules.disallow, ["/private/", "/admin"]);
  });
});

describe("isPathAllowed", () => {
  it("blocks disallowed prefixes", () => {
    const rules = { disallow: ["/private/"] };
    assert.equal(isPathAllowed("/public/article", rules), true);
    assert.equal(isPathAllowed("/private/secret", rules), false);
  });
});
