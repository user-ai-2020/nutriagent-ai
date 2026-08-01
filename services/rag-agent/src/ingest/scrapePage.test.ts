import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPublishedDate } from "./scrapePage.js";

describe("extractPublishedDate", () => {
  it("reads article:published_time meta tag", () => {
    const html = `<meta property="article:published_time" content="2024-06-15T10:00:00Z" />`;
    const d = extractPublishedDate(html);
    assert.ok(d);
    assert.equal(d!.toISOString(), "2024-06-15T10:00:00.000Z");
  });

  it("reads datePublished from JSON-LD snippet", () => {
    const html = `<script type="application/ld+json">{"datePublished":"2023-01-20"}</script>`;
    const d = extractPublishedDate(html);
    assert.ok(d);
    assert.equal(d!.getUTCFullYear(), 2023);
  });

  it("returns null when no publish date is discoverable (no guess)", () => {
    assert.equal(extractPublishedDate("<html><body>Article with no date</body></html>"), null);
  });
});
