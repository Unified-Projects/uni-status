import { AlertTriangle, CheckCircle, Clock, Wrench } from "lucide-react";

export interface IncidentUpdate {
  id: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  title: string;
  status: string;
  severity: string;
  message?: string;
  affectedMonitors: string[];
  startedAt: string;
  resolvedAt?: string;
  updates: IncidentUpdate[];
}

export interface IncidentProps {
  incident: Incident;
  className?: string;
}

export const statusConfig: Record<
  string,
  {
    label: string;
    icon: typeof AlertTriangle;
    bgClass: string;
    textClass: string;
    iconClass: string;
    borderClass: string;
  }
> = {
  investigating: {
    label: "Investigating",
    icon: AlertTriangle,
    bgClass: "bg-[var(--status-warning-bg)]",
    textClass: "text-[var(--status-warning-text)]",
    iconClass: "text-[var(--status-warning-text)]",
    borderClass: "border-[var(--status-warning-text)]/30",
  },
  identified: {
    label: "Identified",
    icon: AlertTriangle,
    bgClass: "bg-[var(--status-orange-bg)]",
    textClass: "text-[var(--status-orange-text)]",
    iconClass: "text-[var(--status-orange-text)]",
    borderClass: "border-[var(--status-orange-text)]/30",
  },
  monitoring: {
    label: "Monitoring",
    icon: Clock,
    bgClass: "bg-[var(--status-info-bg)]",
    textClass: "text-[var(--status-info-text)]",
    iconClass: "text-[var(--status-info-text)]",
    borderClass: "border-[var(--status-info-text)]/30",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle,
    bgClass: "bg-[var(--status-success-bg)]",
    textClass: "text-[var(--status-success-text)]",
    iconClass: "text-[var(--status-success-text)]",
    borderClass: "border-[var(--status-success-text)]/30",
  },
  scheduled: {
    label: "Scheduled",
    icon: Wrench,
    bgClass: "bg-[var(--status-info-bg)]",
    textClass: "text-[var(--status-info-text)]",
    iconClass: "text-[var(--status-info-text)]",
    borderClass: "border-[var(--status-info-text)]/30",
  },
};

export const severityConfig: Record<string, { label: string; className: string }> = {
  minor: { label: "Minor", className: "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]" },
  major: { label: "Major", className: "bg-[var(--status-orange-bg)] text-[var(--status-orange-text)]" },
  critical: { label: "Critical", className: "bg-[var(--status-error-bg)] text-[var(--status-error-text)]" },
  maintenance: { label: "Maintenance", className: "bg-[var(--status-info-bg)] text-[var(--status-info-text)]" },
};

export function formatDateTime(dateStr: string, timezone?: string) {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatRelativeTime(dateStr: string, timezone?: string, locale?: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleString(locale || undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function localizeStatusConfig(
  translate: (key: string, fallback?: string) => string
): typeof statusConfig {
  return Object.fromEntries(
    Object.entries(statusConfig).map(([key, value]) => [
      key,
      { ...value, label: translate(`incidents.status.${key}`, value.label) },
    ])
  ) as typeof statusConfig;
}

export function localizeSeverityConfig(
  translate: (key: string, fallback?: string) => string
): typeof severityConfig {
  return Object.fromEntries(
    Object.entries(severityConfig).map(([key, value]) => [
      key,
      { ...value, label: translate(`incidents.severity.${key}`, value.label) },
    ])
  ) as typeof severityConfig;
}
