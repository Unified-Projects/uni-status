import { cache } from "react";
import type { CSSProperties } from "react";
import type { TemplateConfig } from "@uni-status/shared";

export function getApiUrl(): string {
  const rawUrl = process.env.INTERNAL_API_URL;
  if (!rawUrl) {
    throw new Error("INTERNAL_API_URL environment variable is required");
  }
  return rawUrl.replace(/\/$/, "");
}

export function baseIncludesApi(): boolean {
  return getApiUrl().endsWith("/api");
}

export function isCustomDomain(hostname: string): boolean {
  const appUrl = process.env.UNI_STATUS_URL || process.env.NEXT_PUBLIC_APP_URL!;
  const appHostname = new URL(appUrl).hostname;
  const requestHostname = hostname.split(":")[0];
  return requestHostname !== appHostname && requestHostname !== "localhost";
}

export interface PublicStatusPageData {
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
    colorMode?: "system" | "light" | "dark";
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
    regions?: string[];
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

export interface ApiResponse {
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

export function normalizeAssetUrl(path?: string | null, baseUrl?: string): string | undefined {
  if (!path) return undefined;

  let pathPart = path;

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      pathPart = url.pathname;
    } catch {
      if (!baseUrl) return path;
      pathPart = path;
    }
  }

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

  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
  }

  return normalizedPath;
}

export function buildThemeStyles(theme?: PublicStatusPageData["theme"]): CSSProperties {
  if (!theme) return {};

  const styles: CSSProperties & Record<string, string> = {};

  const primaryHex = theme.primaryColor;
  if (primaryHex) {
    const primaryHsl = hexToHsl(primaryHex);
    if (primaryHsl) {
      const primaryString = hslToString(primaryHsl);
      styles["--primary"] = primaryString;
      styles["--ring"] = primaryString;

      const primaryForeground = hexToHsl(getContrastingText(primaryHex));
      if (primaryForeground) {
        styles["--primary-foreground"] = hslToString(primaryForeground);
      }
    }
  }

  return styles;
}

export const getStatusPageData = cache(async (
  slug: string,
  cookies?: string
): Promise<ApiResponse> => {
  const apiUrl = getApiUrl();
  const path = baseIncludesApi()
    ? `/public/status-pages/${slug}`
    : `/api/public/status-pages/${slug}`;
  const fullUrl = `${apiUrl}${path}`;

  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };

  const maxRetries = 1;
  const retryDelay = 500;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(fullUrl, {
        headers: cookies ? { Cookie: cookies } : {},
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        console.error(
          `[Status Page] Non-JSON response from API: status=${response.status}, content-type=${contentType}, url=${fullUrl}`
        );
        const text = await response.text();
        console.error(`[Status Page] Response body (first 500 chars): ${text.slice(0, 500)}`);
        return {
          success: false,
          error: { code: "INVALID_RESPONSE", message: "Invalid response from API" },
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isTimeout = error instanceof Error && error.name === "AbortError";

      console.error(`[Status Page] Fetch attempt ${attempt}/${maxRetries} for ${fullUrl} failed:`, errorMessage);

      if (attempt === maxRetries) {
        return {
          success: false,
          error: {
            code: isTimeout ? "TIMEOUT" : "FETCH_ERROR",
            message: `Failed to fetch status page data: ${errorMessage}`,
          },
        };
      }

      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }

  return {
    success: false,
    error: { code: "FETCH_ERROR", message: "Failed to fetch status page data after retries" },
  };
});
