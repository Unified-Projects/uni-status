import type { ReactNode } from "react";
import { getStatusPageShellData, buildThemeStyles } from "@/lib/public-status-page-api";
import { StatusPageProvider } from "./status-page-context";

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
    <StatusPageProvider value={{ name: data.name, slug, monitors }}>
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
  );
}
