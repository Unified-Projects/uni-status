"use client";

import { cn } from "@uni-status/ui";
import { useStatusPage } from "@/app/(public)/status/[slug]/status-page-context";
import { StatusPageFooter } from "./status-page-footer";

interface StatusPageRouteShellProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export function StatusPageRouteShell({
  children,
  className,
  containerClassName,
}: StatusPageRouteShellProps) {
  const {
    slug,
    basePath,
    footerText,
    supportUrl,
    hideBranding,
    localization,
  } = useStatusPage();

  return (
    <div className={cn("min-h-screen bg-background text-foreground flex flex-col", className)}>
      <div className={cn("mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:px-8", containerClassName)}>
        {children}
      </div>
      <div className={cn("mx-auto w-full px-4 pb-6 sm:px-6 lg:px-8", containerClassName)}>
        <StatusPageFooter
          footerText={footerText}
          supportUrl={supportUrl}
          hideBranding={hideBranding}
          slug={slug}
          basePath={basePath}
          localization={localization}
        />
      </div>
    </div>
  );
}
