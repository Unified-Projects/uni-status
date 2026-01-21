import type { UptimeDataPoint, UptimeGranularity } from "@/components/monitors/uptime-bar";
import type { ResponseTimeDataPoint } from "@/components/monitors/response-time-chart";

export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

// All supported monitor types
export type MonitorType =
  | "http"
  | "https"
  | "dns"
  | "ssl"
  | "tcp"
  | "ping"
  | "heartbeat"
  | "database_postgres"
  | "database_mysql"
  | "database_mongodb"
  | "database_redis"
  | "database_elasticsearch"
  | "grpc"
  | "websocket"
  | "smtp"
  | "imap"
  | "pop3"
  | "ssh"
  | "ldap"
  | "rdp"
  | "mqtt"
  | "amqp"
  | "traceroute"
  | "email_auth"
  | "prometheus_blackbox"
  | "prometheus_promql"
  | "prometheus_remote_write";

export interface CertificateInfo {
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
}

export interface EmailAuthInfo {
  overallScore: number;
  spfStatus: "pass" | "fail" | "none" | "error";
  dkimStatus: "pass" | "partial" | "fail" | "none" | "error";
  dmarcStatus: "pass" | "fail" | "none" | "error";
}

export interface HeartbeatInfo {
  lastPingAt: string | null;
  expectedIntervalSeconds: number;
  missedBeats: number;
}

export interface PublicMonitor {
  id: string;
  name: string;
  description?: string;
  type: MonitorType;
  status: MonitorStatus;
  uptimePercentage: number | null;
  responseTimeMs: number | null;
  uptimeData: UptimeDataPoint[];
  uptimeGranularity?: UptimeGranularity;
  responseTimeData?: ResponseTimeDataPoint[];
  // Type-specific data
  certificateInfo?: CertificateInfo;
  emailAuthInfo?: EmailAuthInfo;
  heartbeatInfo?: HeartbeatInfo;
}

// Re-export helper functions from type-helpers for convenience
export {
  isHttpType,
  isSslType,
  showsResponseTime,
  showsCertificate,
  showsUptime,
  showsEmailAuth,
  showsHeartbeat,
  showsTraceroute,
  showsStatusCode,
  isDatabaseType,
  isEmailType,
  getPrimaryMetricLabel,
  getTypeCategory,
} from "./type-helpers";

export interface CrowdsourcedProps {
  enabled: boolean;
  statusPageSlug?: string;
  reportCount?: number;
  threshold?: number;
}

export interface SubscriptionProps {
  enabled: boolean;
  statusPageSlug?: string;
}

export interface GraphTooltipMetrics {
  avg?: boolean;
  min?: boolean;
  max?: boolean;
  p50?: boolean;
  p90?: boolean;
  p99?: boolean;
}

export interface MonitorProps {
  monitor: PublicMonitor;
  showUptimePercentage: boolean;
  showResponseTime: boolean;
  uptimeDays: number;
  indicatorStyle?: "dot" | "badge" | "pill" | "bar";
  crowdsourced?: CrowdsourcedProps;
  subscription?: SubscriptionProps;
  className?: string;
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: GraphTooltipMetrics;
}

export function formatResponseTime(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatCertificateExpiry(daysUntilExpiry: number | undefined | null): string {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return "--";
  if (daysUntilExpiry <= 0) return "Expired";
  if (daysUntilExpiry === 1) return "1 day";
  return `${daysUntilExpiry} days`;
}

export function getCertificateColorClass(daysUntilExpiry: number | undefined | null): string {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return "text-[var(--status-muted-text)]";
  if (daysUntilExpiry <= 0) return "text-status-error-icon";
  if (daysUntilExpiry <= 7) return "text-status-error-solid";
  if (daysUntilExpiry <= 30) return "text-status-warning-solid";
  return "text-status-success-solid";
}

export function formatUptime(percentage: number | null): string {
  if (percentage === null) return "--";
  return `${percentage.toFixed(2)}%`;
}

export function getUptimeColorClass(percentage: number | null): string {
  if (percentage === null) return "text-[var(--status-muted-text)]";
  if (percentage >= 99.9) return "text-status-success-icon";
  if (percentage >= 99) return "text-status-success-solid";
  if (percentage >= 95) return "text-status-warning-solid";
  return "text-status-error-solid";
}

// Email Auth formatting
export function formatEmailAuthScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "--";
  return `${score}/100`;
}

export function getEmailAuthColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-[var(--status-muted-text)]";
  if (score >= 90) return "text-status-success-solid";
  if (score >= 70) return "text-status-warning-solid";
  return "text-status-error-solid";
}

export function getEmailAuthStatusIcon(status: "pass" | "fail" | "none" | "error" | "partial"): string {
  switch (status) {
    case "pass":
      return "text-status-success-solid";
    case "partial":
      return "text-status-warning-solid";
    case "fail":
    case "error":
      return "text-status-error-solid";
    case "none":
    default:
      return "text-[var(--status-muted-text)]";
  }
}

// Heartbeat formatting
export function formatHeartbeatLastPing(lastPingAt: string | null): string {
  if (!lastPingAt) return "Never";
  const diff = Date.now() - new Date(lastPingAt).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getHeartbeatColorClass(lastPingAt: string | null, expectedIntervalSeconds: number): string {
  if (!lastPingAt) return "text-[var(--status-muted-text)]";
  const diff = Date.now() - new Date(lastPingAt).getTime();
  const expectedMs = expectedIntervalSeconds * 1000;
  // If last ping is within expected interval, it's healthy
  if (diff < expectedMs * 1.5) return "text-status-success-solid";
  // If within 2x expected, it's degraded
  if (diff < expectedMs * 2) return "text-status-warning-solid";
  // Otherwise it's missed
  return "text-status-error-solid";
}
