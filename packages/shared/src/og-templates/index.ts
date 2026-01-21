// OG (OpenGraph) Template Types

export type OGTemplateId = "classic" | "modern" | "minimal" | "dashboard" | "hero" | "compact";

export interface OGTemplateConfig {
  id: OGTemplateId;
  layout: "left-logo" | "centered" | "minimal" | "grid" | "hero" | "compact";
  showLogo: boolean;
  showStatusIndicator: boolean;
  showMonitorCount: boolean;
  showLastUpdated: boolean;
  statusIndicatorSize: "sm" | "md" | "lg";
  fontWeight: "normal" | "medium" | "bold";
}

export interface OGTemplate {
  id: OGTemplateId;
  name: string;
  description: string;
  preview: string; // Description of what the preview looks like
  config: OGTemplateConfig;
}

// OG Template Definitions
export const OG_TEMPLATES: OGTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Clean layout with logo on the left and status on the right",
    preview: "Logo and name on left, large status indicator on right",
    config: {
      id: "classic",
      layout: "left-logo",
      showLogo: true,
      showStatusIndicator: true,
      showMonitorCount: true,
      showLastUpdated: true,
      statusIndicatorSize: "lg",
      fontWeight: "medium",
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Card-style with centered content and gradient background",
    preview: "Centered layout with rounded card appearance",
    config: {
      id: "modern",
      layout: "centered",
      showLogo: true,
      showStatusIndicator: true,
      showMonitorCount: true,
      showLastUpdated: false,
      statusIndicatorSize: "lg",
      fontWeight: "bold",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Simple text-based layout with status dot",
    preview: "Clean white background with minimal elements",
    config: {
      id: "minimal",
      layout: "minimal",
      showLogo: false,
      showStatusIndicator: true,
      showMonitorCount: false,
      showLastUpdated: false,
      statusIndicatorSize: "md",
      fontWeight: "normal",
    },
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Grid showing multiple monitor statuses",
    preview: "Multi-column grid with individual monitor statuses",
    config: {
      id: "dashboard",
      layout: "grid",
      showLogo: true,
      showStatusIndicator: true,
      showMonitorCount: true,
      showLastUpdated: true,
      statusIndicatorSize: "sm",
      fontWeight: "medium",
    },
  },
  {
    id: "hero",
    name: "Hero",
    description: "Large status indicator with gradient background",
    preview: "Bold, eye-catching design with prominent status",
    config: {
      id: "hero",
      layout: "hero",
      showLogo: true,
      showStatusIndicator: true,
      showMonitorCount: false,
      showLastUpdated: false,
      statusIndicatorSize: "lg",
      fontWeight: "bold",
    },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Smaller, badge-style layout",
    preview: "Condensed design suitable for tight spaces",
    config: {
      id: "compact",
      layout: "compact",
      showLogo: true,
      showStatusIndicator: true,
      showMonitorCount: true,
      showLastUpdated: false,
      statusIndicatorSize: "sm",
      fontWeight: "medium",
    },
  },
];

// Helper functions
export function getOGTemplateById(id: OGTemplateId): OGTemplate | undefined {
  return OG_TEMPLATES.find((t) => t.id === id);
}

export function getDefaultOGTemplate(): OGTemplate {
  const [defaultTemplate] = OG_TEMPLATES;
  if (!defaultTemplate) {
    throw new Error("No OG templates configured");
  }
  return defaultTemplate;
}

export function getDefaultOGTemplateConfig(): OGTemplateConfig {
  return getDefaultOGTemplate().config;
}

// Status colors for OG images
export const OG_STATUS_COLORS = {
  operational: {
    bg: "#10B981",
    text: "#FFFFFF",
    label: "All Systems Operational",
  },
  degraded: {
    bg: "#F59E0B",
    text: "#FFFFFF",
    label: "Degraded Performance",
  },
  partial_outage: {
    bg: "#F97316",
    text: "#FFFFFF",
    label: "Partial Outage",
  },
  major_outage: {
    bg: "#EF4444",
    text: "#FFFFFF",
    label: "Major Outage",
  },
  maintenance: {
    bg: "#3B82F6",
    text: "#FFFFFF",
    label: "Under Maintenance",
  },
  unknown: {
    bg: "#6B7280",
    text: "#FFFFFF",
    label: "Status Unknown",
  },
} as const;

export type OGOverallStatus = keyof typeof OG_STATUS_COLORS;
