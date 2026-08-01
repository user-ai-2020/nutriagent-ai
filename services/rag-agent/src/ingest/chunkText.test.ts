import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkText, splitLongText, splitParagraphs } from "./chunkText.js";

describe("splitParagraphs", () => {
  it("splits on blank lines for Hebrew and Latin text", () => {
    const parts = splitParagraphs("שורה ראשונה\n\nSecond paragraph.\n\nThird.");
    assert.equal(parts.length, 3);
    assert.match(parts[0]!, /שורה/);
  });
});

describe("chunkText", () => {
  it("returns one chunk for short text", () => {
    assert.deepEqual(chunkText("Short nutrition note."), ["Short nutrition note."]);
  });

  it("produces multiple chunks for long paragraph-separated text", () => {
    const paragraph = "Protein supports muscle repair. ".repeat(80);
    const chunks = chunkText(`${paragraph}\n\n${paragraph}`);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.length > 0));
  });

  it("does not split Hebrew words mid-character when splitting long paragraphs", () => {
    const word = "חלבון";
    const paragraph = `${word} ${word} ${word} `.repeat(200).trim();
    const parts = splitLongText(paragraph, 400, 50);
    assert.ok(parts.length >= 2);
    for (const part of parts) {
      assert.match(part, /[\u0590-\u05FF]/);
      assert.ok(!part.includes("\uFFFD"));
    }
  });
});
