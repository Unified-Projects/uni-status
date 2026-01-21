import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import {
  getOGTemplateById,
  getDefaultOGTemplate,
  OG_STATUS_COLORS,
  type OGTemplateId,
  type OverallStatus,
} from "@uni-status/shared";

export const runtime = "edge";

const RAW_API_URL = process.env.INTERNAL_API_URL || "http://api:3001";
const API_URL = RAW_API_URL.replace(/\/$/, "");

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
    status: "active" | "degraded" | "down" | "paused" | "pending";
  }>;
  activeIncidents: Array<{
    severity: "minor" | "major" | "critical";
  }>;
}

function calculateOverallStatus(data: StatusPageData): OverallStatus {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;
  const templateId = (searchParams.get("template") as OGTemplateId) || "classic";

  // Fetch status page data
  let data: StatusPageData;
  try {
    const response = await fetch(`${API_URL}/api/public/status-pages/${slug}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      return new Response("Status page not found", { status: 404 });
    }

    const json = await response.json();
    data = json.data;
  } catch (error) {
    console.error("Failed to fetch status page data:", error);
    return new Response("Failed to fetch status page data", { status: 500 });
  }

  const template = getOGTemplateById(templateId) || getDefaultOGTemplate();
  const overallStatus = calculateOverallStatus(data);
  const statusInfo = OG_STATUS_COLORS[overallStatus];

  // Theme colors
  const primaryColor = data.theme?.primaryColor || "#3B82F6";
  const bgColor = data.theme?.backgroundColor || "#FFFFFF";
  const textColor = data.theme?.textColor || "#1F2937";

  const monitorCount = data.monitors.length;
  const operationalCount = data.monitors.filter((m) => m.status === "active").length;

  // Render based on template
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: bgColor,
          position: "relative",
        }}
      >
        {/* Background gradient accent */}
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

        {template.config.layout === "left-logo" && (
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
            {/* Left side - Logo and name */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {template.config.showLogo && data.logo && (
                <img
                  src={data.logo.startsWith("http") ? data.logo : `${API_URL}${data.logo}`}
                  alt=""
                  width={80}
                  height={80}
                  style={{ objectFit: "contain" }}
                />
              )}
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
                    <path d="M20 6L9 17l-5-5" />
                  ) : overallStatus === "maintenance" ? (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
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
        )}

        {template.config.layout === "centered" && (
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
            {template.config.showLogo && data.logo && (
              <img
                src={data.logo.startsWith("http") ? data.logo : `${API_URL}${data.logo}`}
                alt=""
                width={100}
                height={100}
                style={{ objectFit: "contain" }}
              />
            )}
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
        )}

        {template.config.layout === "minimal" && (
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
        )}

        {template.config.layout === "hero" && (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              background: `linear-gradient(135deg, ${primaryColor}22, ${statusInfo.bg}22)`,
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
                  <path d="M20 6L9 17l-5-5" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
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
        )}

        {(template.config.layout === "compact" || template.config.layout === "grid") && (
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
              {template.config.showLogo && data.logo && (
                <img
                  src={data.logo.startsWith("http") ? data.logo : `${API_URL}${data.logo}`}
                  alt=""
                  width={60}
                  height={60}
                  style={{ objectFit: "contain" }}
                />
              )}
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
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
