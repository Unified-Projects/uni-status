import type { ReactNode } from "react";
import { headers } from "next/headers";
import {
  getStatusPageShellData,
  buildThemeStyles,
  isCustomDomain,
} from "@/lib/public-status-page-api";
import { StatusPageProvider } from "./status-page-context";
import { StatusPageThemeProvider } from "./status-page-theme-provider";

export default async function StatusPageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getStatusPageShellData(slug);

  // If data is unavailable (404, auth required, fetch error etc.) render children as-is.
  // The page component handles all error states itself.
  if (!result.success || !result.data) {
    return <>{children}</>;
  }

  const { data } = result;
  const themeStyles = buildThemeStyles(data.theme);
  const headersList = await headers();
  const hostname = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost";
  const basePath = isCustomDomain(hostname) ? "" : `/status/${slug}`;

  // Run before hydration so dark/light class is set immediately — prevents flash
  const colorModeScript =
    data.theme.colorMode && data.theme.colorMode !== "system"
      ? `(function(){document.documentElement.classList.${
          data.theme.colorMode === "dark" ? "add" : "remove"
        }("dark")})();`
      : null;

  const monitors = data.monitors.map((m) => ({
    id: m.id,
    name: m.name,
    regions: m.regions ?? [],
  }));

  return (
    <StatusPageThemeProvider colorMode={data.theme.colorMode}>
      <StatusPageProvider
        value={{
          name: data.name,
          slug,
          monitors,
          basePath,
          footerText: data.settings.footerText,
          supportUrl: data.settings.supportUrl,
          hideBranding: data.settings.hideBranding,
          localization: data.settings.localization,
        }}
      >
        {colorModeScript && (
          <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
        )}
        <div style={themeStyles}>
          {data.theme.customCss && (
            <style dangerouslySetInnerHTML={{ __html: data.theme.customCss }} />
          )}
          {children}
        </div>
      </StatusPageProvider>
    </StatusPageThemeProvider>
  );
}
