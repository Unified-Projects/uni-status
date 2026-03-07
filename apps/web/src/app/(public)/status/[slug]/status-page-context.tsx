"use client";

import { createContext, useContext } from "react";

export interface StatusPageContextValue {
  name: string;
  slug: string;
  monitors: Array<{ id: string; name: string; regions: string[] }>;
}

const StatusPageContext = createContext<StatusPageContextValue>({
  name: "",
  slug: "",
  monitors: [],
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
