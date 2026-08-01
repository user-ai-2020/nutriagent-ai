import type { CSSProperties } from "react";

/** Heading (Source Serif 4) type at a given size. */
export function serif(size: number, extra?: CSSProperties): CSSProperties {
  return { fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: size, ...extra };
}

/** Text colour mixed down against the background, Broadsheet convention. */
export function muted(pct = 55): string {
  return `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;
}
