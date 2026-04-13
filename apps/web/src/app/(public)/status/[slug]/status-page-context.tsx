"use client";

import { createContext, useContext } from "react";

export interface StatusPageContextValue {
  name: string;
  slug: string;
  monitors: Array<{ id: string; name: string; regions: string[] }>;
  basePath: string;
  footerText?: string;
  supportUrl?: string;
  hideBranding?: boolean;
  localization?: {
    defaultLocale?: string;
    supportedLocales?: string[];
    translations?: Record<string, Record<string, string>>;
  };
}

const StatusPageContext = createContext<StatusPageContextValue>({
  name: "",
  slug: "",
  monitors: [],
  basePath: "",
});

export function StatusPageProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: StatusPageContextValue;
}) {
  return (
    <StatusPageContext.Provider value={value}>
      {children}
    </StatusPageContext.Provider>
  );
}

export function useStatusPage(): StatusPageContextValue {
  return useContext(StatusPageContext);
}
