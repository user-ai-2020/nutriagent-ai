import {
  CHARS_PER_TOKEN_ESTIMATE,
  CHUNK_OVERLAP_TOKENS,
  CHUNK_TARGET_TOKENS,
} from "../config/ragConstants.js";

const TARGET_CHARS = CHUNK_TARGET_TOKENS * CHARS_PER_TOKEN_ESTIMATE;
const OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN_ESTIMATE;

/** Split on blank lines — works for Hebrew and Latin paragraph boundaries. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/** Split long text at whitespace boundaries when possible (Hebrew + Latin). */
export function splitLongText(text: string, targetChars: number, overlapChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastSpace = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\u00A0"));
      if (lastSpace > targetChars * 0.4) {
        end = start + lastSpace;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

export function chunkText(text: string): string[] {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    if (buffer.length === 0) {
      buffer = paragraph;
      continue;
    }

    if (buffer.length + paragraph.length + 1 <= TARGET_CHARS) {
      buffer = `${buffer}\n\n${paragraph}`;
      continue;
    }

    flush();
    if (paragraph.length <= TARGET_CHARS) {
      buffer = paragraph;
    } else {
      chunks.push(...splitLongText(paragraph, TARGET_CHARS, OVERLAP_CHARS));
      buffer = "";
    }
  }

  flush();

  if (chunks.length <= 1) return chunks;

  const overlapped: string[] = [chunks[0]!];
  for (let i = 1; i < chunks.length; i++) {
    const prev = overlapped[overlapped.length - 1]!;
    const tail = prev.slice(Math.max(0, prev.length - OVERLAP_CHARS));
    overlapped.push(`${tail} ${chunks[i]!}`.trim());
  }
  return overlapped;
}
