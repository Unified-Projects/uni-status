import type { TemplateConfig } from "@uni-status/shared";

export interface Monitor {
  id: string;
  name: string;
  description?: string;
  type: "http" | "https" | "dns" | "ssl" | "tcp" | "ping" | "heartbeat" | "database_postgres" | "database_mysql" | "database_mongodb" | "database_redis" | "database_elasticsearch" | "grpc" | "websocket" | "smtp" | "imap" | "pop3" | "email_auth" | "ssh" | "ldap" | "rdp" | "mqtt" | "amqp" | "traceroute";
  group?: string;
  order: number;
  status: "active" | "degraded" | "down" | "paused" | "pending";
  baseStatus?: "active" | "degraded" | "down" | "paused" | "pending";
  providerImpacts?: Array<{
    providerId: string;
    providerName: string;
    providerStatus: "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
    providerStatusText?: string | null;
  }>;
  uptimePercentage: number | null;
  responseTimeMs: number | null;
  uptimeData: Array<{
    date: string;
    uptimePercentage: number | null;
    status: "success" | "degraded" | "down" | "unknown";
    successCount?: number;
    failureCount?: number;
    totalCount?: number;
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
}

export interface Incident {
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
}

export interface GraphTooltipMetrics {
  avg?: boolean;
  min?: boolean;
  max?: boolean;
  p50?: boolean;
  p90?: boolean;
  p99?: boolean;
}

export interface StatusPageSettings {
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
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: GraphTooltipMetrics;
}

export interface CrowdsourcedData {
  enabled: boolean;
  threshold?: number;
  reportCounts?: Record<string, number>;
}

export interface LayoutProps {
  monitors: Monitor[];
  monitorGroups: Map<string, Monitor[]>;
  ungroupedMonitors: Monitor[];
  activeIncidents: Incident[];
  recentIncidents: Incident[];
  settings: StatusPageSettings;
  template: TemplateConfig;
  crowdsourced?: CrowdsourcedData;
  statusPageSlug?: string;
  basePath?: string;
  className?: string;
}

// Page-level data for full-page layouts that render header/footer themselves
export interface PageData {
  name: string;
  logo?: string | null;
  orgLogo?: string | null;
  headerText?: string;
  footerText?: string;
  supportUrl?: string;
  hideBranding?: boolean;
  lastUpdatedAt?: string;
  slug: string;
  basePath?: string;
}

// Extended props for layouts that control the entire page structure
export interface FullPageLayoutProps extends LayoutProps {
  pageData: PageData;
  notificationMessage?: string;
  notificationError?: string;
}
