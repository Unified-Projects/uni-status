"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

interface StatusPageThemeProviderProps {
  children: ReactNode;
  colorMode?: "system" | "light" | "dark";
}

export function StatusPageThemeProvider({
  children,
  colorMode = "system",
}: StatusPageThemeProviderProps) {
  const forcedTheme = colorMode === "system" ? undefined : colorMode;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={forcedTheme}
    >
      {children}
    </ThemeProvider>
  );
}
