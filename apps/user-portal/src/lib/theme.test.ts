import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ThemeProvider } from "./theme.tsx";

describe("theme (dark-only)", () => {
  it("exports a no-op ThemeProvider (dark CSS is static on .na-app)", () => {
    assert.equal(typeof ThemeProvider, "function");
  });
});
