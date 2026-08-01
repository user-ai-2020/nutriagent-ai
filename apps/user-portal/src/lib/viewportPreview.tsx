"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ViewportMode = "desktop" | "mobile";

const STORAGE_KEY = "nutriagent_viewport_mode";

interface ViewportCtx {
  mode: ViewportMode;
  setMode: (mode: ViewportMode) => void;
}

const ViewportContext = createContext<ViewportCtx | null>(null);

export function ViewportPreviewProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewportMode>("desktop");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "mobile" || saved === "desktop") setModeState(saved);
  }, []);

  function setMode(next: ViewportMode) {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return <ViewportContext.Provider value={{ mode, setMode }}>{children}</ViewportContext.Provider>;
}

export function useViewportPreview() {
  const ctx = useContext(ViewportContext);
  if (!ctx) throw new Error("useViewportPreview must be used within ViewportPreviewProvider");
  return ctx;
}
