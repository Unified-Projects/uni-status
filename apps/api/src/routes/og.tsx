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

export const ogRoutes = new OpenAPIHono();

// Font loading - we'll use a system font or load one
let fontData: ArrayBuffer | null = null;

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
  theme: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  monitors: Array<{
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
    logo: page.logo,
    theme,
    monitors: linkedMonitors.map((lm) => ({
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
  const primaryColor = data.theme?.primaryColor || "#3B82F6";
  const bgColor = data.theme?.backgroundColor || "#FFFFFF";
  const textColor = data.theme?.textColor || "#1F2937";

  const monitorCount = data.monitors.length;
  const operationalCount = data.monitors.filter((m) => m.status === "active").length;

  // SVG icons as path data
  const checkIcon = "M20 6L9 17l-5-5";
  const alertIcon = "M12 2L12 12M12 16L12.01 16";

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
          }}
        >
          {/* Left side - Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                fontSize: "48px",
                fontWeight: template.config.fontWeight === "bold" ? 700 : 500,
                color: textColor,
              }}
            >
              {data.name}
            </div>
            {template.config.showMonitorCount && (
              <div style={{ fontSize: "24px", color: "#6B7280" }}>
                {operationalCount}/{monitorCount} systems operational
              </div>
            )}
          </div>

          {/* Right side - Status */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: template.config.statusIndicatorSize === "lg" ? "120px" : "80px",
                height: template.config.statusIndicatorSize === "lg" ? "120px" : "80px",
                borderRadius: "50%",
                backgroundColor: statusInfo.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width={template.config.statusIndicatorSize === "lg" ? "60" : "40"}
                height={template.config.statusIndicatorSize === "lg" ? "60" : "40"}
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
        </div>
      </div>
    );
  }

  if (template.config.layout === "centered") {
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
            gap: "24px",
            padding: "60px",
          }}
        >
          <div
            style={{
              fontSize: "56px",
              fontWeight: 700,
              color: textColor,
              textAlign: "center",
            }}
          >
            {data.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px 32px",
              borderRadius: "9999px",
              backgroundColor: statusInfo.bg,
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "white",
              }}
            />
            <div
              style={{
                fontSize: "28px",
                fontWeight: 600,
                color: "white",
              }}
            >
              {statusInfo.label}
            </div>
          </div>
          {template.config.showMonitorCount && (
            <div style={{ fontSize: "20px", color: "#6B7280" }}>
              {operationalCount} of {monitorCount} systems operational
            </div>
          )}
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
          <div
            style={{
              fontSize: "64px",
              fontWeight: 400,
              color: textColor,
            }}
          >
            {data.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                backgroundColor: statusInfo.bg,
              }}
            />
            <div
              style={{
                fontSize: "24px",
                color: "#6B7280",
              }}
            >
              {statusInfo.label}
            </div>
          </div>
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
          background: `linear-gradient(135deg, ${primaryColor}22, ${statusInfo.bg}22)`,
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
          <div
            style={{
              width: "160px",
              height: "160px",
              borderRadius: "50%",
              backgroundColor: statusInfo.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 60px ${statusInfo.bg}66`,
            }}
          >
            <svg
              width="80"
              height="80"
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
          <div
            style={{
              fontSize: "64px",
              fontWeight: 700,
              color: textColor,
            }}
          >
            {data.name}
          </div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: 600,
              color: statusInfo.bg,
            }}
          >
            {statusInfo.label}
          </div>
        </div>
      </div>
    );
  }

  // Default: compact/grid layout
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
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: 600,
                color: textColor,
              }}
            >
              {data.name}
            </div>
            {template.config.showMonitorCount && (
              <div style={{ fontSize: "18px", color: "#6B7280" }}>
                {operationalCount}/{monitorCount} operational
              </div>
            )}
          </div>
        </div>
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
          <div
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "white",
            }}
          >
            {statusInfo.label}
          </div>
        </div>
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

    // Generate SVG using Satori
    const element = generateOGImageElement(data, templateId);
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
