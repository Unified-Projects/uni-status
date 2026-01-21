// Template Types
export type LayoutType = "list" | "cards" | "sidebar" | "single-page";
export type IndicatorStyle = "dot" | "badge" | "pill" | "bar";
export type IncidentStyle = "timeline" | "cards" | "compact" | "expanded";
export type MonitorStyle = "minimal" | "detailed" | "card" | "row";
export type BorderRadius = "none" | "sm" | "md" | "lg" | "xl";
export type Shadow = "none" | "sm" | "md" | "lg";
export type Spacing = "compact" | "normal" | "relaxed";

export interface TemplateConfig {
  id: string;
  layout: LayoutType;
  indicatorStyle: IndicatorStyle;
  incidentStyle: IncidentStyle;
  monitorStyle: MonitorStyle;
  borderRadius: BorderRadius;
  shadow: Shadow;
  spacing: Spacing;
}

export interface StatusPageTemplate {
  id: string;
  name: string;
  description: string;
  config: TemplateConfig;
}

// Template Definitions
export const STATUS_PAGE_TEMPLATES: StatusPageTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional status page with timeline incidents and row-based monitors",
    config: {
      id: "classic",
      layout: "list",
      indicatorStyle: "dot",
      incidentStyle: "timeline",
      monitorStyle: "row",
      borderRadius: "lg",
      shadow: "sm",
      spacing: "normal",
    },
  },
  {
    id: "modern-cards",
    name: "Modern Cards",
    description: "Card-based layout with badges and modern styling",
    config: {
      id: "modern-cards",
      layout: "cards",
      indicatorStyle: "badge",
      incidentStyle: "cards",
      monitorStyle: "card",
      borderRadius: "xl",
      shadow: "md",
      spacing: "normal",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean and simple design with minimal visual noise",
    config: {
      id: "minimal",
      layout: "list",
      indicatorStyle: "pill",
      incidentStyle: "compact",
      monitorStyle: "minimal",
      borderRadius: "sm",
      shadow: "none",
      spacing: "compact",
    },
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Two-column layout with sidebar navigation for complex setups",
    config: {
      id: "dashboard",
      layout: "sidebar",
      indicatorStyle: "bar",
      incidentStyle: "expanded",
      monitorStyle: "detailed",
      borderRadius: "md",
      shadow: "sm",
      spacing: "normal",
    },
  },
  {
    id: "single-view",
    name: "Single View",
    description: "Everything on one scrollable page with section anchors",
    config: {
      id: "single-view",
      layout: "single-page",
      indicatorStyle: "badge",
      incidentStyle: "timeline",
      monitorStyle: "card",
      borderRadius: "lg",
      shadow: "sm",
      spacing: "relaxed",
    },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Dense layout for status pages with many monitors",
    config: {
      id: "compact",
      layout: "list",
      indicatorStyle: "dot",
      incidentStyle: "compact",
      monitorStyle: "minimal",
      borderRadius: "md",
      shadow: "none",
      spacing: "compact",
    },
  },
];

// Helper functions
export function getTemplateById(id: string): StatusPageTemplate | undefined {
  return STATUS_PAGE_TEMPLATES.find((t) => t.id === id);
}

export function getDefaultTemplate(): StatusPageTemplate {
  const [defaultTemplate] = STATUS_PAGE_TEMPLATES;
  if (!defaultTemplate) {
    throw new Error("No status page templates configured");
  }
  return defaultTemplate;
}

export function getDefaultTemplateConfig(): TemplateConfig {
  return getDefaultTemplate().config;
}
