import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@uni-status/database";
import {
  statusPages,
  statusPageMonitors,
  incidents,
} from "@uni-status/database/schema";
import { eq, and, ne } from "drizzle-orm";
import {
  getOGTemplateById,
  getDefaultOGTemplate,
  OG_STATUS_COLORS,
  type OGTemplateId,
  type OGOverallStatus,
} from "@uni-status/shared";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactNode } from "react";
import { getAppUrl } from "@uni-status/shared/config";

export const ogRoutes = new OpenAPIHono();

// Font loading - we'll use a system font or load one
let fontData: ArrayBuffer | null = null;

function normalizeHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const cleaned = color.trim().replace("#", "");
  if (cleaned.length === 3) {
    const expanded = cleaned
      .split("")
      .map((char) => char + char)
      .join("");
    return `#${expanded}`;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return `#${cleaned}`;
  }
  return fallback;
}

function hexToRgba(color: string, alpha: number): string {
  const normalized = normalizeHexColor(color, "#000000").replace("#", "");
  const value = parseInt(normalized, 16);
  if (Number.isNaN(value)) return `rgba(0, 0, 0, ${alpha})`;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkColor(color: string): boolean {
  const normalized = normalizeHexColor(color, "#FFFFFF").replace("#", "");
  const value = parseInt(normalized, 16);
  if (Number.isNaN(value)) return false;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

function buildImageUrlCandidates(url: string, baseUrls: string[]): string[] {
  if (!url) return [];
  if (url.startsWith("data:")) return [url];
  if (url.startsWith("http://") || url.startsWith("https://")) return [url];

  const candidates = new Set<string>();
  for (const base of baseUrls) {
    if (!base) continue;
    try {
      candidates.add(new URL(url, base).toString());
    } catch {
      // Ignore invalid base/url combinations
    }
  }

  return Array.from(candidates);
}

async function loadImageDataUri(url: string, baseUrls: string[]): Promise<string | null> {
  const candidates = buildImageUrlCandidates(url, baseUrls);
  for (const candidate of candidates) {
    if (candidate.startsWith("data:")) {
      return candidate;
    }
    try {
      const response = await fetch(candidate);
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "image/png";
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      console.warn("[OG] Failed to load image:", error);
    }
  }
  return null;
}

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;

  // Try to load Inter font from Google Fonts CDN
  try {
    const response = await fetch(
      "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
    );
    fontData = await response.arrayBuffer();
    return fontData;
  } catch (error) {
    console.error("[OG] Failed to load font:", error);
    // Return a minimal valid font buffer as fallback
    throw new Error("Failed to load font for OG image generation");
  }
}

interface StatusPageData {
  name: string;
  slug: string;
  logo: string | null;
  orgLogo?: string | null;
  theme: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  monitors: Array<{
    name: string;
    status: "active" | "degraded" | "down" | "paused" | "pending";
  }>;
  activeIncidents: Array<{
    severity: "minor" | "major" | "critical";
  }>;
}

function calculateOverallStatus(data: StatusPageData): OGOverallStatus {
  // Check for active incidents first
  if (data.activeIncidents.length > 0) {
    const hasCritical = data.activeIncidents.some((i) => i.severity === "critical");
    const hasMajor = data.activeIncidents.some((i) => i.severity === "major");
    if (hasCritical) return "major_outage";
    if (hasMajor) return "partial_outage";
    return "degraded";
  }

  // Check monitor statuses
  const statuses = data.monitors.map((m) => m.status);
  if (statuses.some((s) => s === "down")) return "major_outage";
  if (statuses.some((s) => s === "degraded")) return "degraded";

  // Default to operational (covers active, paused, pending states)
  return "operational";
}

async function getStatusPageData(slug: string): Promise<StatusPageData | null> {
  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
    with: {
      organization: true,
    },
  });

  if (!page || !page.published) {
    return null;
  }

  // Fetch linked monitors
  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
    with: {
      monitor: true,
    },
  });

  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  // Get active incidents
  const activeIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      ne(incidents.status, "resolved")
    ),
  });

  // Filter to incidents affecting these monitors
  const relevantIncidents = activeIncidents.filter((incident) => {
    const affectedMonitors = incident.affectedMonitors || [];
    return affectedMonitors.some((mid: string) => monitorIds.includes(mid));
  });

  const theme = (page.theme || {}) as StatusPageData["theme"];

  return {
    name: page.name,
    slug: page.slug,
    logo: page.logo ?? null,
    orgLogo: page.organization?.logo ?? null,
    theme,
    monitors: linkedMonitors.map((lm) => ({
      name: lm.displayName || lm.monitor?.name || "Monitor",
      status: lm.monitor.status as StatusPageData["monitors"][0]["status"],
    })),
    activeIncidents: relevantIncidents.map((i) => ({
      severity: i.severity as "minor" | "major" | "critical",
    })),
  };
}

// Generate the OG image JSX
function generateOGImageElement(
  data: StatusPageData,
  templateId: OGTemplateId
): ReactNode {
  const template = getOGTemplateById(templateId) || getDefaultOGTemplate();
  const overallStatus = calculateOverallStatus(data);
  const statusInfo = OG_STATUS_COLORS[overallStatus];

  // Theme colors
  const primaryColor = normalizeHexColor(data.theme?.primaryColor, "#3B82F6");
  const bgColor = normalizeHexColor(data.theme?.backgroundColor, "#FFFFFF");
  const textColor = normalizeHexColor(data.theme?.textColor, "#1F2937");
  const mutedText = hexToRgba(textColor, 0.65);
  const isDarkBg = isDarkColor(bgColor);
  const surfaceColor = hexToRgba(primaryColor, isDarkBg ? 0.2 : 0.08);
  const surfaceBorder = hexToRgba(primaryColor, isDarkBg ? 0.4 : 0.2);
  const primaryGlow = hexToRgba(primaryColor, 0.25);
  const statusGlow = hexToRgba(statusInfo.bg, 0.3);
  const monogram = data.name.trim().charAt(0).toUpperCase() || "S";

  const monitorCount = data.monitors.length;
  const operationalCount = data.monitors.filter((m) => m.status === "active").length;
  const incidentCount = data.activeIncidents.length;
  const incidentBySeverity = data.activeIncidents.reduce(
    (acc, incident) => {
      acc[incident.severity] += 1;
      return acc;
    },
    { minor: 0, major: 0, critical: 0 }
  );

  // SVG icons as path data
  const checkIcon = "M20 6L9 17l-5-5";
  const alertIcon = "M12 2L12 12M12 16L12.01 16";

  const titleWeight =
    template.config.fontWeight === "bold"
      ? 700
      : template.config.fontWeight === "medium"
        ? 600
        : 500;

  const indicatorSize =
    template.config.statusIndicatorSize === "lg"
      ? 120
      : template.config.statusIndicatorSize === "md"
        ? 96
        : 72;
  const indicatorIconSize =
    template.config.statusIndicatorSize === "lg"
      ? 56
      : template.config.statusIndicatorSize === "md"
        ? 44
        : 34;

  const logoSizeLg = 96;
  const logoSizeMd = 72;
  const logoSizeHero = 168;

  const renderLogo = (size: number, rounded: boolean): ReactNode => {
    if (!template.config.showLogo) return null;
    const radius = rounded ? "20px" : "9999px";
    if (data.logo) {
      return (
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: radius,
            backgroundColor: surfaceColor,
            border: `1px solid ${surfaceBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <img
            src={data.logo}
            width={size - 16}
            height={size - 16}
            style={{ borderRadius: rounded ? "16px" : "9999px" }}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: radius,
          backgroundColor: surfaceColor,
          border: `1px solid ${surfaceBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: `${size * 0.45}px`, fontWeight: 700, color: primaryColor }}>
          {monogram}
        </div>
      </div>
    );
  };

  const monitorStatusInfo = (status: StatusPageData["monitors"][0]["status"]) => {
    switch (status) {
      case "active":
        return { label: "Operational", color: OG_STATUS_COLORS.operational.bg };
      case "degraded":
        return { label: "Degraded", color: OG_STATUS_COLORS.degraded.bg };
      case "down":
        return { label: "Down", color: OG_STATUS_COLORS.major_outage.bg };
      case "paused":
        return { label: "Paused", color: hexToRgba(textColor, 0.45) };
      case "pending":
      default:
        return { label: "Pending", color: primaryColor };
    }
  };

  if (template.config.layout === "left-logo") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        {/* Top gradient bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: `linear-gradient(90deg, ${primaryColor}, ${statusInfo.bg})`,
          }}
        />

        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "60px",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "40px",
          }}
        >
          {/* Left side - Brand */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "24px",
              flex: 1,
            }}
          >
            {renderLogo(logoSizeLg, true)}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  fontSize: "52px",
                  fontWeight: titleWeight,
                  color: textColor,
                }}
              >
                {data.name}
              </div>
              {template.config.showMonitorCount && (
                <div style={{ fontSize: "22px", color: mutedText }}>
                  {`${operationalCount}/${monitorCount} systems operational`}
                </div>
              )}
            </div>
          </div>

          {/* Right side - Status */}
          {template.config.showStatusIndicator && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <div
                style={{
                  width: `${indicatorSize}px`,
                  height: `${indicatorSize}px`,
                  borderRadius: "50%",
                  backgroundColor: statusInfo.bg,
                  boxShadow: `0 0 40px ${statusGlow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width={`${indicatorIconSize}px`}
                  height={`${indicatorIconSize}px`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {overallStatus === "operational" ? (
                    <path d={checkIcon} />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d={alertIcon} />
                    </>
                  )}
                </svg>
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  color: statusInfo.bg,
                  textAlign: "center",
                }}
              >
                {statusInfo.label}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (template.config.layout === "centered") {
    const monitorPreview = data.monitors.slice(0, 2);
    const incidentBadges = [
      incidentBySeverity.critical
        ? { label: `${incidentBySeverity.critical} Critical`, color: OG_STATUS_COLORS.major_outage.bg }
        : null,
      incidentBySeverity.major
        ? { label: `${incidentBySeverity.major} Major`, color: OG_STATUS_COLORS.partial_outage.bg }
        : null,
      incidentBySeverity.minor
        ? { label: `${incidentBySeverity.minor} Minor`, color: OG_STATUS_COLORS.degraded.bg }
        : null,
    ].filter(Boolean) as Array<{ label: string; color: string }>;

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: `linear-gradient(90deg, ${primaryColor}, ${statusInfo.bg})`,
          }}
        />
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "row",
            alignItems: "stretch",
            justifyContent: "space-between",
            padding: "60px",
            gap: "40px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "22px", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              {renderLogo(logoSizeMd, true)}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div
                  style={{
                    fontSize: "46px",
                    fontWeight: titleWeight,
                    color: textColor,
                  }}
                >
                  {data.name}
                </div>
                {template.config.showStatusIndicator && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 18px",
                      borderRadius: "9999px",
                      backgroundColor: statusInfo.bg,
                      boxShadow: `0 18px 40px ${statusGlow}`,
                    }}
                  >
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: "white",
                      }}
                    />
                    <div style={{ fontSize: "18px", fontWeight: 600, color: "white" }}>
                      {statusInfo.label}
                    </div>
                  </div>
                )}
                {template.config.showMonitorCount && (
                  <div style={{ fontSize: "18px", color: mutedText }}>
                    {`${operationalCount}/${monitorCount} systems operational`}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "16px 20px",
                borderRadius: "20px",
                backgroundColor: surfaceColor,
                border: `1px solid ${surfaceBorder}`,
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: 600, color: textColor }}>Incidents</div>
              {incidentCount > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {incidentBadges.map((badge) => (
                    <div
                      key={badge.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "9999px",
                        backgroundColor: badge.color,
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "white" }}>
                        {badge.label}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "14px", color: mutedText }}>No active incidents</div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "16px 20px",
                borderRadius: "20px",
                backgroundColor: surfaceColor,
                border: `1px solid ${surfaceBorder}`,
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: 600, color: textColor }}>Systems</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {monitorPreview.map((monitor, index) => {
                  const info = monitorStatusInfo(monitor.status);
                  return (
                    <div
                      key={`${monitor.name}-${index}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            backgroundColor: info.color,
                          }}
                        />
                        <div style={{ fontSize: "16px", color: textColor }}>{monitor.name}</div>
                      </div>
                      <div style={{ fontSize: "14px", color: mutedText }}>{info.label}</div>
                    </div>
                  );
                })}
                {monitorCount > monitorPreview.length && (
                  <div style={{ fontSize: "14px", color: mutedText }}>
                    {`+${monitorCount - monitorPreview.length} more services`}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            style={{
              width: "280px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {template.config.showStatusIndicator && (
              <div
                style={{
                  width: "200px",
                  height: "200px",
                  borderRadius: "50%",
                  backgroundColor: statusInfo.bg,
                  boxShadow: `0 0 60px ${statusGlow}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="96"
                  height="96"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {overallStatus === "operational" ? (
                    <path d={checkIcon} />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d={alertIcon} />
                    </>
                  )}
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (template.config.layout === "minimal") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: `linear-gradient(90deg, ${primaryColor}, ${statusInfo.bg})`,
          }}
        />
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "32px",
            padding: "60px",
          }}
        >
          {template.config.showLogo && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              {renderLogo(logoSizeMd, false)}
            </div>
          )}
          <div
            style={{
              fontSize: "62px",
              fontWeight: titleWeight,
              color: textColor,
            }}
          >
            {data.name}
          </div>
          {template.config.showStatusIndicator && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  backgroundColor: statusInfo.bg,
                }}
              />
              <div
                style={{
                  fontSize: "24px",
                  color: mutedText,
                }}
              >
                {statusInfo.label}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (template.config.layout === "hero") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(135deg, ${hexToRgba(primaryColor, 0.22)}, ${hexToRgba(
            statusInfo.bg,
            0.22
          )})`,
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
            padding: "60px",
          }}
        >
          {template.config.showStatusIndicator && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 22px",
                borderRadius: "9999px",
                backgroundColor: statusInfo.bg,
                boxShadow: `0 18px 40px ${statusGlow}`,
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: "white",
                }}
              />
              <div style={{ fontSize: "18px", fontWeight: 600, color: "white" }}>
                {statusInfo.label}
              </div>
            </div>
          )}
          {template.config.showLogo && (
            <div
              style={{
                width: `${logoSizeHero}px`,
                height: `${logoSizeHero}px`,
                borderRadius: "50%",
                backgroundColor: surfaceColor,
                border: `2px solid ${surfaceBorder}`,
                boxShadow: `0 30px 80px ${primaryGlow}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {data.logo ? (
                <img
                  src={data.logo}
                  width={logoSizeHero - 28}
                  height={logoSizeHero - 28}
                  style={{ borderRadius: "32px" }}
                />
              ) : (
                <div style={{ fontSize: "80px", fontWeight: 700, color: primaryColor }}>
                  {monogram}
                </div>
              )}
            </div>
          )}
          <div
            style={{
              fontSize: "64px",
              fontWeight: titleWeight,
              color: textColor,
            }}
          >
            {data.name}
          </div>
        </div>
      </div>
    );
  }

  if (template.config.layout === "grid") {
    const maxGridCards = 8;
    const visibleMonitors = data.monitors.slice(0, maxGridCards);
    const remainingMonitors = Math.max(data.monitors.length - visibleMonitors.length, 0);
    const gridItemCount = visibleMonitors.length + (remainingMonitors > 0 ? 1 : 0);

    let gridColumns = 3;
    if (gridItemCount <= 3) {
      gridColumns = Math.max(gridItemCount, 1);
    } else if (gridItemCount <= 4) {
      gridColumns = 2;
    } else if (gridItemCount <= 6) {
      gridColumns = 3;
    } else {
      gridColumns = 4;
    }

    const gridGap = 16;
    const contentWidth = 1200 - 80;
    const contentHeight = 630 - 80;
    const headerHeight = 120;
    const gridHeight = Math.max(contentHeight - headerHeight, 200);
    const gridRows = Math.max(Math.ceil(gridItemCount / gridColumns), 1);
    const gridCardWidth = Math.floor((contentWidth - gridGap * (gridColumns - 1)) / gridColumns);
    const gridCardHeight = Math.floor((gridHeight - gridGap * (gridRows - 1)) / gridRows);

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: `linear-gradient(90deg, ${primaryColor}, ${statusInfo.bg})`,
          }}
        />
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "40px",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              {renderLogo(logoSizeMd, true)}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "38px", fontWeight: titleWeight, color: textColor }}>
                  {data.name}
                </div>
                {template.config.showMonitorCount && (
                  <div style={{ fontSize: "16px", color: mutedText }}>
                    {`${operationalCount}/${monitorCount} systems operational`}
                  </div>
                )}
              </div>
            </div>
            {template.config.showStatusIndicator && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 18px",
                  borderRadius: "9999px",
                  backgroundColor: surfaceColor,
                  border: `1px solid ${surfaceBorder}`,
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: statusInfo.bg,
                  }}
                />
                <div style={{ fontSize: "16px", fontWeight: 600, color: textColor }}>
                  {statusInfo.label}
                </div>
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: `${gridGap}px`,
              alignContent: "flex-start",
            }}
          >
            {visibleMonitors.map((monitor, index) => {
              const monitorStatus = monitorStatusInfo(monitor.status);
              return (
                <div
                  key={`${monitor.name}-${index}`}
                  style={{
                    width: `${gridCardWidth}px`,
                    height: `${gridCardHeight}px`,
                    padding: "16px 18px",
                    borderRadius: "16px",
                    backgroundColor: surfaceColor,
                    border: `1px solid ${surfaceBorder}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: monitorStatus.color,
                      }}
                    />
                    <div style={{ fontSize: "16px", fontWeight: 600, color: textColor }}>
                      {monitor.name}
                    </div>
                  </div>
                  <div style={{ fontSize: "14px", color: mutedText }}>{monitorStatus.label}</div>
                </div>
              );
            })}
            {remainingMonitors > 0 && (
                <div
                  style={{
                    width: `${gridCardWidth}px`,
                    height: `${gridCardHeight}px`,
                    padding: "16px 18px",
                    borderRadius: "16px",
                    backgroundColor: surfaceColor,
                    border: `1px dashed ${surfaceBorder}`,
                    display: "flex",
                    alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontSize: "16px", color: mutedText }}>
                  {`+${remainingMonitors} more`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (template.config.layout === "compact") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: `linear-gradient(90deg, ${primaryColor}, ${statusInfo.bg})`,
          }}
        />
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "40px",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            {renderLogo(logoSizeMd, true)}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "34px", fontWeight: titleWeight, color: textColor }}>
                {data.name}
              </div>
              {template.config.showMonitorCount && (
                <div style={{ fontSize: "16px", color: mutedText }}>
                  {`${operationalCount}/${monitorCount} operational`}
                </div>
              )}
            </div>
          </div>
          {template.config.showStatusIndicator && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 22px",
                borderRadius: "9999px",
                backgroundColor: statusInfo.bg,
                boxShadow: `0 16px 36px ${statusGlow}`,
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: "white",
                }}
              />
              <div style={{ fontSize: "18px", fontWeight: 600, color: "white" }}>
                {statusInfo.label}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default: compact layout fallback
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: bgColor,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "8px",
          background: `linear-gradient(90deg, ${primaryColor}, ${statusInfo.bg})`,
        }}
      />
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "40px",
            alignItems: "center",
            gap: "40px",
          }}
        >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            flex: 1,
          }}
        >
          {renderLogo(logoSizeMd, true)}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "36px", fontWeight: titleWeight, color: textColor }}>
              {data.name}
            </div>
            {template.config.showMonitorCount && (
              <div style={{ fontSize: "18px", color: mutedText }}>
                {`${operationalCount}/${monitorCount} operational`}
              </div>
            )}
          </div>
        </div>
        {template.config.showStatusIndicator && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 24px",
              borderRadius: "9999px",
              backgroundColor: statusInfo.bg,
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "white",
              }}
            />
            <div style={{ fontSize: "20px", fontWeight: 600, color: "white" }}>
              {statusInfo.label}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ogRoutes.get("/:slug", async (c) => {
  const { slug } = c.req.param();
  const templateId = (c.req.query("template") as OGTemplateId) || "classic";

  try {
    const data = await getStatusPageData(slug);

    if (!data) {
      return c.text("Status page not found", 404);
    }

    // Load font
    const font = await loadFont();

    // Resolve logo to a data URI if present so OG generation doesn't fail on bad URLs
    const requestOrigin = (() => {
      try {
        return new URL(c.req.url).origin;
      } catch {
        return "";
      }
    })();
    const baseUrls = [requestOrigin, getAppUrl()];
    const logoCandidates = [data.logo, data.orgLogo].filter(Boolean) as string[];
    let logoData: string | null = null;
    for (const candidate of logoCandidates) {
      logoData = await loadImageDataUri(candidate, baseUrls);
      if (logoData) break;
    }
    const element = generateOGImageElement(
      { ...data, logo: logoData },
      templateId
    );
    const svg = await satori(element as React.ReactNode, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: font,
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: font,
          weight: 500,
          style: "normal",
        },
        {
          name: "Inter",
          data: font,
          weight: 600,
          style: "normal",
        },
        {
          name: "Inter",
          data: font,
          weight: 700,
          style: "normal",
        },
      ],
    });

    // Convert SVG to PNG using resvg
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: "width",
        value: 1200,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    c.header("Content-Type", "image/png");
    c.header("Cache-Control", "public, max-age=60, s-maxage=60");
    return c.body(pngBuffer);
  } catch (error) {
    console.error("[OG] Error generating image:", error);
    return c.text("Failed to generate OG image", 500);
  }
});
