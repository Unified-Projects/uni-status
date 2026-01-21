import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Metadata } from "next";
import type { CSSProperties } from "react";
import {
  StatusPageHeader,
  OverallStatusBanner,
  StatusPageFooter,
  SubscribeForm,
  LayoutWrapper,
  isFullPageLayout,
  StatusPageContainer,
  PasswordProtectedPage,
} from "@/components/public-status";
import { getDefaultTemplateConfig, type TemplateConfig } from "@uni-status/shared";

const RAW_API_URL =
  process.env.INTERNAL_API_URL ||
  "http://api:3001";
const API_URL = RAW_API_URL.replace(/\/$/, "");
const BASE_INCLUDES_API = API_URL.endsWith("/api");
const DEFAULT_PRIMARY = "#3b82f6";
const DEFAULT_BACKGROUND = "#ffffff";

/**
 * Check if the current request is from a custom domain (not the main app domain)
 */
function isCustomDomain(hostname: string): boolean {
  const appUrl = process.env.UNI_STATUS_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const appHostname = new URL(appUrl).hostname;
  // Remove port for comparison
  const requestHostname = hostname.split(":")[0];
  return requestHostname !== appHostname && requestHostname !== "localhost";
}

interface PublicStatusPageData {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  favicon: string | null;
  orgLogo?: string | null;
  theme: {
    name: string;
    useCustomTheme?: boolean;
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    customCss?: string;
  };
  settings: {
    showUptimePercentage: boolean;
    showResponseTime: boolean;
    showIncidentHistory: boolean;
    showServicesPage: boolean;
    showGeoMap?: boolean;
    uptimeDays: number;
    headerText?: string;
    footerText?: string;
    supportUrl?: string;
    hideBranding: boolean;
    defaultTimezone?: string;
    localization?: {
      defaultLocale?: string;
      supportedLocales?: string[];
      rtlLocales?: string[];
    };
  };
  template?: TemplateConfig;
  seo: {
    title?: string;
    description?: string;
    ogImage?: string;
    ogTemplate?: "classic" | "modern" | "minimal" | "dashboard" | "hero" | "compact";
  };
  monitors: Array<{
    id: string;
    name: string;
    description?: string;
    type: "http" | "https" | "dns" | "ssl" | "tcp" | "ping" | "heartbeat" | "database_postgres" | "database_mysql" | "database_mongodb" | "database_redis" | "database_elasticsearch" | "grpc" | "websocket" | "smtp" | "imap" | "pop3" | "email_auth" | "ssh" | "ldap" | "rdp" | "mqtt" | "amqp" | "traceroute";
    group?: string;
    order: number;
    status: "active" | "degraded" | "down" | "paused" | "pending";
    uptimePercentage: number | null;
    responseTimeMs: number | null;
    uptimeData: Array<{
      date: string;
      uptimePercentage: number | null;
      status: "success" | "degraded" | "down" | "unknown";
      successCount?: number;
      failureCount?: number;
      totalCount?: number;
      incidents?: Array<{
        id: string;
        title: string;
        severity: "minor" | "major" | "critical";
      }>;
    }>;
    baseStatus?: "active" | "degraded" | "down" | "paused" | "pending";
    providerImpacts?: Array<{
      providerId: string;
      providerName: string;
      providerStatus: "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
      providerStatusText?: string | null;
    }>;
    // Type-specific data
    certificateInfo?: {
      issuer?: string;
      subject?: string;
      validFrom?: string;
      validTo?: string;
      daysUntilExpiry?: number;
    };
    emailAuthInfo?: {
      overallScore: number;
      spfStatus: "pass" | "fail" | "none" | "error";
      dkimStatus: "pass" | "partial" | "fail" | "none" | "error";
      dmarcStatus: "pass" | "fail" | "none" | "error";
    };
    heartbeatInfo?: {
      lastPingAt: string | null;
      expectedIntervalSeconds: number;
      missedBeats: number;
    };
  }>;
  activeIncidents: Array<{
    id: string;
    title: string;
    status: string;
    severity: "minor" | "major" | "critical";
    message?: string;
    affectedMonitors: string[];
    startedAt: string;
    updates: Array<{
      id: string;
      status: string;
      message: string;
      createdAt: string;
    }>;
  }>;
  recentIncidents: Array<{
    id: string;
    title: string;
    status: string;
    severity: "minor" | "major" | "critical";
    message?: string;
    affectedMonitors: string[];
    startedAt: string;
    resolvedAt?: string;
    updates: Array<{
      id: string;
      status: string;
      message: string;
      createdAt: string;
    }>;
  }>;
  crowdsourced: {
    enabled: boolean;
    threshold?: number;
    reportCounts?: Record<string, number>;
  };
  lastUpdatedAt: string;
}

interface ApiResponse {
  success: boolean;
  data?: PublicStatusPageData;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    name: string;
    logo?: string;
    protectionMode?: string;
    requiresPassword?: boolean;
    requiresOAuth?: boolean;
    providers?: Array<{ id: string; name: string }>;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "");
  if (![3, 6].includes(normalized.length)) return null;
  const full = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

const hslToString = (hsl: { h: number; s: number; l: number }) =>
  `${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%`;

const getContrastingText = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#0f172a";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.55 ? "#0f172a" : "#ffffff";
};

function normalizeAssetUrl(path?: string | null, baseUrl?: string): string | undefined {
  if (!path) return undefined;

  let pathPart = path;

  // If path is already an absolute URL, extract just the pathname
  // This handles existing data that may have full URLs stored
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      pathPart = url.pathname;
    } catch {
      // If URL parsing fails and no baseUrl, return original
      if (!baseUrl) return path;
      pathPart = path;
    }
  }

  // Build the normalized path
  const normalizedPath = pathPart.startsWith("/api/")
    ? pathPart
    : pathPart.startsWith("/uploads/")
      ? `/api${pathPart}`
      : pathPart.startsWith("uploads/")
        ? `/api/${pathPart}`
        : pathPart.startsWith("//")
          ? `/api${pathPart.replace(/^\/+/, "/")}`
          : pathPart.startsWith("/")
            ? pathPart
            : `/${pathPart}`;

  // If baseUrl is provided (for custom domains), return absolute URL
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
  }

  return normalizedPath;
}

function buildThemeStyles(theme?: PublicStatusPageData["theme"]): CSSProperties {
  if (!theme) return {};

  const styles: CSSProperties & Record<string, string> = {};

  // Only set primary/accent color from custom theme
  // Background and text ALWAYS come from dashboard theme (responds to dark/light mode)
  const primaryHex = theme.primaryColor;
  if (primaryHex) {
    const primaryHsl = hexToHsl(primaryHex);
    if (primaryHsl) {
      const primaryString = hslToString(primaryHsl);
      styles["--primary"] = primaryString;
      styles["--ring"] = primaryString;

      const primaryForeground = hexToHsl(getContrastingText(primaryHex));
      if (primaryForeground) {
        const fgString = hslToString(primaryForeground);
        styles["--primary-foreground"] = fgString;
      }
    }
  }

  // DO NOT set --background, --foreground, --card, --muted, --border, etc.
  // These come from the dashboard theme CSS variables which properly respond to dark/light mode

  return styles;
}

async function getStatusPageData(
  slug: string,
  cookies?: string
): Promise<ApiResponse> {
  const path = BASE_INCLUDES_API
    ? `/public/status-pages/${slug}`
    : `/api/public/status-pages/${slug}`;
  const fullUrl = `${API_URL}${path}`;

  try {
    const response = await fetch(fullUrl, {
      headers: cookies ? { Cookie: cookies } : {},
      cache: "no-store",
    });

    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      console.error(
        `[Status Page] Non-JSON response from API: status=${response.status}, content-type=${contentType}, url=${fullUrl}`
      );
      const text = await response.text();
      console.error(`[Status Page] Response body (first 500 chars): ${text.slice(0, 500)}`);
      return {
        success: false,
        error: {
          code: "INVALID_RESPONSE",
          message: "Invalid response from API",
        },
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[Status Page] Fetch error for ${fullUrl}:`, error);
    return {
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: `Failed to fetch status page data: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getStatusPageData(slug);

  if (!result.success || !result.data) {
    return {
      title: "Status Page",
    };
  }

  const { data } = result;
  const title = data.seo.title || `${data.name} Status`;
  const description =
    data.seo.description || `Current status and uptime for ${data.name}`;

  // Determine OG image URL - use template if set, otherwise custom image
  let ogImageUrl: string | undefined;
  if (data.seo.ogTemplate) {
    // Use dynamic OG image route
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    ogImageUrl = `${appUrl}/api/og/${slug}?template=${data.seo.ogTemplate}`;
  } else if (data.seo.ogImage) {
    ogImageUrl = normalizeAssetUrl(data.seo.ogImage);
  }

  // Build feed URLs for auto-discovery
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const feedBaseUrl = `${appUrl}/api/public/feeds/status-pages/${slug}`;

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
    alternates: {
      types: {
        "application/rss+xml": `${feedBaseUrl}/rss`,
        "application/atom+xml": `${feedBaseUrl}/atom`,
        "application/feed+json": `${feedBaseUrl}/json`,
      },
    },
  };

  // Only set icons if a custom favicon is configured, otherwise inherit from parent
  const faviconUrl = normalizeAssetUrl(data.favicon);
  if (faviconUrl) {
    metadata.icons = { icon: faviconUrl };
  }

  return metadata;
}

export default async function PublicStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const result = await getStatusPageData(slug);

  // Detect custom domain to determine link base path
  const headersList = await headers();
  const hostname = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost";
  const onCustomDomain = isCustomDomain(hostname);
  // On custom domains, links should be relative to root; on main domain, include /status/{slug}
  const basePath = onCustomDomain ? "" : `/status/${slug}`;
  // Assets use relative URLs - the middleware proxies /api/v1/assets/ requests on custom domains
  // This avoids CORS issues and ensures assets load correctly regardless of domain
  const assetBaseUrl = undefined;

  // Handle not found
  if (
    !result.success &&
    (result.error?.code === "NOT_FOUND" || result.error?.code === "NOT_PUBLISHED")
  ) {
    notFound();
  }

  // Handle password required (legacy error code)
  if (!result.success && result.error?.code === "PASSWORD_REQUIRED") {
    return (
      <PasswordProtectedPage
        slug={slug}
        name={result.meta?.name || "Status Page"}
        logo={normalizeAssetUrl(result.meta?.logo, assetBaseUrl) || result.meta?.logo}
        authMode="password"
        requiresPassword={true}
        requiresOAuth={false}
        providers={[]}
      />
    );
  }

  // Handle auth required (password/oauth protected page)
  if (!result.success && result.error?.code === "AUTH_REQUIRED") {
    return (
      <PasswordProtectedPage
        slug={slug}
        name={result.meta?.name || "Status Page"}
        logo={normalizeAssetUrl(result.meta?.logo, assetBaseUrl) || result.meta?.logo}
        authMode={result.meta?.protectionMode || "password"}
        requiresPassword={result.meta?.requiresPassword || false}
        requiresOAuth={result.meta?.requiresOAuth || false}
        providers={result.meta?.providers || []}
      />
    );
  }

  // Handle other errors
  if (!result.success || !result.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground mt-2">
            {result.error?.message || "Failed to load status page"}
          </p>
        </div>
      </div>
    );
  }

  const { data } = result;

  // Get template config (use default if not set)
  const template = data.template || getDefaultTemplateConfig();
  const logoUrl = normalizeAssetUrl(data.logo, assetBaseUrl) || data.logo;
  const orgLogoUrl = normalizeAssetUrl(data.orgLogo, assetBaseUrl) || data.orgLogo;

  // Get message from query params (for subscription confirmations)
  const message = query.message as string | undefined;
  const error = query.error as string | undefined;

  // Group monitors by group name
  const monitorGroups = new Map<string, typeof data.monitors>();
  const ungroupedMonitors: typeof data.monitors = [];

  for (const monitor of data.monitors) {
    if (monitor.group) {
      const group = monitorGroups.get(monitor.group) || [];
      group.push(monitor);
      monitorGroups.set(monitor.group, group);
    } else {
      ungroupedMonitors.push(monitor);
    }
  }

  // Apply custom theme CSS variables
  const themeStyles = buildThemeStyles(data.theme);

  // Prepare page data for full-page layouts
  const pageData = {
    name: data.name,
    logo: logoUrl,
    orgLogo: orgLogoUrl,
    headerText: data.settings.headerText,
    footerText: data.settings.footerText,
    supportUrl: data.settings.supportUrl,
    hideBranding: data.settings.hideBranding,
    lastUpdatedAt: data.lastUpdatedAt,
    slug: slug,
    basePath: basePath,
  };

  const initialLocale =
    typeof query.lang === "string"
      ? query.lang
      : Array.isArray(query.lang)
        ? query.lang[0]
        : undefined;
  const localization = data.settings.localization;
  const defaultTimezone = data.settings.defaultTimezone || "local";

  // Check if this layout needs full-page control
  if (isFullPageLayout(template.layout)) {
    // Full-page layouts (sidebar, cards, single-page) render everything themselves
    return (
      <StatusPageContainer
        localization={localization}
        defaultTimezone={defaultTimezone}
        initialLocale={initialLocale}
      >
        <div
          className="min-h-screen bg-background text-foreground"
          style={themeStyles}
        >
          {/* Custom CSS */}
          {data.theme.customCss && (
            <style dangerouslySetInnerHTML={{ __html: data.theme.customCss }} />
          )}

          <LayoutWrapper
            layout={template.layout}
            monitors={data.monitors}
            monitorGroups={monitorGroups}
            ungroupedMonitors={ungroupedMonitors}
            activeIncidents={data.activeIncidents}
            recentIncidents={data.recentIncidents}
            settings={data.settings}
            template={template}
            crowdsourced={data.crowdsourced}
            statusPageSlug={slug}
            fullPageProps={pageData}
            notificationMessage={message}
            notificationError={error}
          />
        </div>
      </StatusPageContainer>
    );
  }

  // List layout uses the centered container approach
  return (
    <StatusPageContainer
      localization={localization}
      defaultTimezone={defaultTimezone}
      initialLocale={initialLocale}
    >
      <div
        className="min-h-screen bg-background text-foreground"
        style={themeStyles}
      >
        {/* Custom CSS */}
        {data.theme.customCss && (
          <style dangerouslySetInnerHTML={{ __html: data.theme.customCss }} />
        )}

        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Notification messages */}
          {message && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-success-text)] bg-[var(--status-success-bg)] border-[var(--status-success-text)]/20">
              {message === "subscribed" && "You have been subscribed to status updates."}
              {message === "unsubscribed" && "You have been unsubscribed from status updates."}
              {message === "already_verified" && "Your email is already verified."}
            </div>
          )}
          {error && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-error-text)] bg-[var(--status-error-bg)] border-[var(--status-error-text)]/20">
              {error === "invalid_token" && "Invalid or expired link."}
            </div>
          )}

          {/* Header */}
          <StatusPageHeader
            name={data.name}
            logo={logoUrl}
            orgLogo={orgLogoUrl}
            headerText={data.settings.headerText}
            slug={data.slug}
            basePath={basePath}
            showServicesPage={data.settings.showServicesPage}
          />

          {/* Overall Status Banner */}
          <OverallStatusBanner
            monitors={data.monitors}
            incidents={data.activeIncidents}
            lastUpdatedAt={data.lastUpdatedAt}
            className="mt-6"
          />

          {/* Template-based Layout */}
          <div className="mt-8">
            <LayoutWrapper
              layout={template.layout}
              monitors={data.monitors}
              monitorGroups={monitorGroups}
              ungroupedMonitors={ungroupedMonitors}
              activeIncidents={data.activeIncidents}
              recentIncidents={data.recentIncidents}
              settings={data.settings}
              template={template}
              crowdsourced={data.crowdsourced}
              statusPageSlug={slug}
              basePath={basePath}
            />
          </div>

          {/* Subscribe Form */}
          <div className="mt-12 border-t pt-8">
            <SubscribeForm slug={slug} />
          </div>

          {/* Footer */}
          <StatusPageFooter
            footerText={data.settings.footerText}
            supportUrl={data.settings.supportUrl}
            hideBranding={data.settings.hideBranding}
            slug={slug}
            basePath={basePath}
            localization={localization}
            className="mt-8"
          />
        </div>
      </div>
    </StatusPageContainer>
  );
}
