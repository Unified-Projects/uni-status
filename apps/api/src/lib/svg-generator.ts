// SVG Generator for status badges and indicators

export type OverallStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";
export type BadgeStyle = "flat" | "plastic" | "flat-square" | "for-the-badge" | "modern";

// Status colors matching the existing design system
const STATUS_COLORS: Record<OverallStatus | MonitorStatus, string> = {
  // Overall status
  operational: "#22c55e",
  degraded: "#eab308",
  partial_outage: "#f97316",
  major_outage: "#ef4444",
  maintenance: "#3b82f6",
  // Monitor status (mapped to same colors)
  active: "#22c55e",
  down: "#ef4444",
  paused: "#6b7280",
  pending: "#9ca3af",
};

const STATUS_LABELS: Record<OverallStatus | MonitorStatus, string> = {
  operational: "operational",
  degraded: "degraded",
  partial_outage: "partial outage",
  major_outage: "major outage",
  maintenance: "maintenance",
  active: "operational",
  down: "down",
  paused: "paused",
  pending: "pending",
};

// Approximate character widths for common fonts (used for badge sizing)
function measureText(text: string, fontSize: number): number {
  // Average character width ratio for sans-serif fonts
  const avgCharWidth = fontSize * 0.6;
  return text.length * avgCharWidth;
}

/**
 * Generate a shields.io-style status badge SVG
 */
export function generateBadgeSvg(
  label: string,
  status: OverallStatus | MonitorStatus,
  style: BadgeStyle = "flat"
): string {
  const statusLabel = STATUS_LABELS[status] || status;
  const statusColor = STATUS_COLORS[status] || "#6b7280";
  const labelColor = "#555";

  const fontSize = style === "for-the-badge" ? 11 : 11;
  const height = style === "for-the-badge" ? 28 : 20;
  const padding = style === "for-the-badge" ? 9 : 6;
  const textY = style === "for-the-badge" ? 18 : 14;

  const labelText = style === "for-the-badge" ? label.toUpperCase() : label;
  const statusText = style === "for-the-badge" ? statusLabel.toUpperCase() : statusLabel;

  const labelWidth = Math.round(measureText(labelText, fontSize) + padding * 2);
  const statusWidth = Math.round(measureText(statusText, fontSize) + padding * 2);
  const totalWidth = labelWidth + statusWidth;

  if (style === "flat") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${statusLabel}">
  <title>${label}: ${statusLabel}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${statusColor}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${textY}" fill="#010101" fill-opacity=".3">${escapeXml(labelText)}</text>
    <text x="${labelWidth / 2}" y="${textY - 1}" fill="#fff">${escapeXml(labelText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY}" fill="#010101" fill-opacity=".3">${escapeXml(statusText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY - 1}" fill="#fff">${escapeXml(statusText)}</text>
  </g>
</svg>`;
  }

  if (style === "plastic") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${statusLabel}">
  <title>${label}: ${statusLabel}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-opacity=".3"/>
    <stop offset="1" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${statusColor}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${textY}" fill="#010101" fill-opacity=".3">${escapeXml(labelText)}</text>
    <text x="${labelWidth / 2}" y="${textY - 1}" fill="#fff">${escapeXml(labelText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY}" fill="#010101" fill-opacity=".3">${escapeXml(statusText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY - 1}" fill="#fff">${escapeXml(statusText)}</text>
  </g>
</svg>`;
  }

  if (style === "flat-square") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${statusLabel}">
  <title>${label}: ${statusLabel}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${statusColor}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${textY}">${escapeXml(labelText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY}">${escapeXml(statusText)}</text>
  </g>
</svg>`;
  }

  if (style === "modern") {
    // Modern pill-shaped badge with icon - matches site design
    const modernHeight = 24;
    const modernFontSize = 12;
    const iconSize = 14;
    const iconPadding = 8;
    const textPadding = 10;
    const gap = 4;

    // Status display text (capitalized)
    const displayText = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
    const textWidth = Math.round(measureText(displayText, modernFontSize));
    const modernWidth = iconPadding + iconSize + gap + textWidth + textPadding;

    // SVG path icons (Lucide-style, simplified)
    const icons: Record<string, string> = {
      // CheckCircle for operational/active
      operational: `<path d="M7.5 12l2 2 5-5" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="6" stroke="white" stroke-width="1.5" fill="none"/>`,
      active: `<path d="M7.5 12l2 2 5-5" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="6" stroke="white" stroke-width="1.5" fill="none"/>`,
      // AlertTriangle for degraded/partial
      degraded: `<path d="M12 6.5v4M12 14.5h.01" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M5.5 17h13L12 5.5 5.5 17z" stroke="white" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
      partial_outage: `<path d="M12 6.5v4M12 14.5h.01" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M5.5 17h13L12 5.5 5.5 17z" stroke="white" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
      // XCircle for down/major
      down: `<circle cx="12" cy="12" r="6" stroke="white" stroke-width="1.5" fill="none"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`,
      major_outage: `<circle cx="12" cy="12" r="6" stroke="white" stroke-width="1.5" fill="none"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`,
      // Wrench for maintenance
      maintenance: `<path d="M14.5 6.5a3.5 3.5 0 00-5 4.95l-4 4 1.4 1.4 4-4a3.5 3.5 0 004.6-6.35z" stroke="white" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
      // Pause for paused
      paused: `<rect x="8" y="7" width="2.5" height="10" rx="0.5" fill="white"/><rect x="13.5" y="7" width="2.5" height="10" rx="0.5" fill="white"/>`,
      // Clock for pending
      pending: `<circle cx="12" cy="12" r="6" stroke="white" stroke-width="1.5" fill="none"/><path d="M12 8v4l2.5 2.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    };

    const icon = icons[status] || icons.pending;
    const iconX = iconPadding;
    const iconY = (modernHeight - iconSize) / 2;
    const textX = iconPadding + iconSize + gap;
    const textY2 = modernHeight / 2 + modernFontSize / 2 - 1;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${modernWidth}" height="${modernHeight}" role="img" aria-label="${displayText}">
  <title>${displayText}</title>
  <rect width="${modernWidth}" height="${modernHeight}" rx="12" fill="${statusColor}"/>
  <g transform="translate(${iconX}, ${iconY}) scale(${iconSize / 24})">${icon}</g>
  <text x="${textX}" y="${textY2}" fill="#fff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${modernFontSize}" font-weight="500">${escapeXml(displayText)}</text>
</svg>`;
  }

  // for-the-badge style
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${statusLabel}">
  <title>${label}: ${statusLabel}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${statusColor}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}" font-weight="bold" letter-spacing="1">
    <text x="${labelWidth / 2}" y="${textY}">${escapeXml(labelText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY}">${escapeXml(statusText)}</text>
  </g>
</svg>`;
}

/**
 * Generate a status dot indicator SVG
 */
export function generateDotSvg(
  status: OverallStatus | MonitorStatus,
  size: number = 12,
  animate: boolean = false
): string {
  const color = STATUS_COLORS[status] || "#6b7280";
  const statusLabel = STATUS_LABELS[status] || status;
  const radius = size / 2;
  const center = size / 2;

  // Add padding for animation pulse
  const totalSize = animate ? size + 4 : size;
  const offset = animate ? 2 : 0;

  const animationStyles = animate && (status === "operational" || status === "active")
    ? `
    <style>
      @keyframes pulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
        100% { opacity: 1; transform: scale(1); }
      }
      .pulse-ring {
        animation: pulse 2s ease-in-out infinite;
        transform-origin: center;
      }
    </style>
    <circle class="pulse-ring" cx="${center + offset}" cy="${center + offset}" r="${radius}" fill="${color}" opacity="0.3"/>`
    : "";

  const warningAnimation = animate && (status === "degraded" || status === "partial_outage")
    ? `
    <style>
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      .blink {
        animation: blink 1.5s ease-in-out infinite;
      }
    </style>`
    : "";

  const circleClass = (animate && (status === "degraded" || status === "partial_outage")) ? ' class="blink"' : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}" role="img" aria-label="Status: ${statusLabel}">
  <title>Status: ${statusLabel}</title>${animationStyles}${warningAnimation}
  <circle${circleClass} cx="${center + offset}" cy="${center + offset}" r="${radius}" fill="${color}"/>
</svg>`;
}

/**
 * Escape special XML characters to prevent injection
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Calculate overall status from monitors and incidents
 */
export function calculateOverallStatus(
  monitors: Array<{ status: MonitorStatus }>,
  activeIncidents?: Array<{ severity: "minor" | "major" | "critical" }>
): OverallStatus {
  if (!monitors || monitors.length === 0) {
    return "operational";
  }

  // Check if all monitors are paused (maintenance mode)
  const allPaused = monitors.every((m) => m.status === "paused");
  if (allPaused) {
    return "maintenance";
  }

  // Count active (non-paused) monitors by status
  const activeMonitors = monitors.filter((m) => m.status !== "paused");
  const downCount = activeMonitors.filter((m) => m.status === "down").length;
  const degradedCount = activeMonitors.filter((m) => m.status === "degraded").length;

  // Determine base status from monitors
  let status: OverallStatus = "operational";

  if (activeMonitors.length > 0 && downCount === activeMonitors.length) {
    status = "major_outage";
  } else if (downCount > 0) {
    status = "partial_outage";
  } else if (degradedCount > 0) {
    status = "degraded";
  }

  // Factor in active incidents
  if (activeIncidents && activeIncidents.length > 0) {
    const hasCritical = activeIncidents.some((i) => i.severity === "critical");
    const hasMajor = activeIncidents.some((i) => i.severity === "major");
    const hasMinor = activeIncidents.some((i) => i.severity === "minor");

    if (hasCritical) {
      status = "major_outage";
    } else if (hasMajor && status !== "major_outage") {
      status = "partial_outage";
    } else if (hasMinor && status === "operational") {
      status = "degraded";
    }
  }

  return status;
}
