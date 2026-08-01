"use client";

/** Dark-only — no theme switching. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
