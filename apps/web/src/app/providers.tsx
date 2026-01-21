"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "@uni-status/ui";
import { TimezoneProvider } from "@/contexts/timezone-context";
import { I18nProvider } from "@/contexts/i18n-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <I18nProvider>
          <TimezoneProvider>
            {children}
            <Toaster />
          </TimezoneProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
