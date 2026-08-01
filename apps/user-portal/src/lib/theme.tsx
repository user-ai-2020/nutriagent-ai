"use client";

/**
 * Theme switching was removed — the app is dark-only via CSS on `.na-app`.
 * This no-op provider remains so any stray import still compiles during cleanup.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
