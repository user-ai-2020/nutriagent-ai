"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/I18nProvider";
import { LanguageProvider } from "@/lib/language";
import { ViewportPreviewProvider } from "@/lib/viewportPreview";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <I18nProvider>
            <ViewportPreviewProvider>{children}</ViewportPreviewProvider>
          </I18nProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
