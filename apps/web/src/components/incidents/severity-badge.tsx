"use client";

import { Badge, cn } from "@uni-status/ui";
import { AlertTriangle, AlertCircle, AlertOctagon, CheckCircle, Search, Eye } from "lucide-react";

export type IncidentSeverity = "minor" | "major" | "critical";
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

const severityConfig: Record<
  IncidentSeverity,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    icon: typeof AlertTriangle;
  }
> = {
  minor: {
    label: "Minor",
    variant: "default",
    className: "bg-[var(--status-warning-text)] hover:opacity-80 text-white border-[var(--status-warning-text)]",
    icon: AlertTriangle,
  },
  major: {
    label: "Major",
    variant: "default",
    className: "bg-[var(--status-orange-text)] hover:opacity-80 text-white border-[var(--status-orange-text)]",
    icon: AlertCircle,
  },
  critical: {
    label: "Critical",
    variant: "destructive",
    className: "bg-[var(--status-error-text)] hover:opacity-80 text-white border-[var(--status-error-text)]",
    icon: AlertOctagon,
  },
};

const statusConfig: Record<
  IncidentStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    icon: typeof Search;
  }
> = {
  investigating: {
    label: "Investigating",
    variant: "outline",
    className: "border-[var(--status-warning-text)]/50 text-[var(--status-warning-text)] bg-[var(--status-warning-bg)]",
    icon: Search,
  },
  identified: {
    label: "Identified",
    variant: "outline",
    className: "border-[var(--status-orange-text)]/50 text-[var(--status-orange-text)] bg-[var(--status-orange-bg)]",
    icon: AlertCircle,
  },
  monitoring: {
    label: "Monitoring",
    variant: "outline",
    className: "border-[var(--status-info-text)]/50 text-[var(--status-info-text)] bg-[var(--status-info-bg)]",
    icon: Eye,
  },
  resolved: {
    label: "Resolved",
    variant: "outline",
    className: "border-[var(--status-success-text)]/50 text-[var(--status-success-text)] bg-[var(--status-success-bg)]",
    icon: CheckCircle,
  },
};

export interface SeverityBadgeProps {
  severity: IncidentSeverity;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function SeverityBadge({
  severity,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: SeverityBadgeProps) {
  const config = severityConfig[severity] || severityConfig.minor;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    default: "text-xs px-2.5 py-0.5",
    lg: "text-sm px-3 py-1",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    default: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        config.className,
        sizeClasses[size],
        "inline-flex items-center gap-1",
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {showLabel && config.label}
    </Badge>
  );
}

export interface IncidentStatusBadgeProps {
  status: IncidentStatus;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function IncidentStatusBadge({
  status,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: IncidentStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.investigating;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    default: "text-xs px-2.5 py-0.5",
    lg: "text-sm px-3 py-1",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    default: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        config.className,
        sizeClasses[size],
        "inline-flex items-center gap-1",
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {showLabel && config.label}
    </Badge>
  );
}

// Severity indicator dot for compact displays
export interface SeverityIndicatorProps {
  severity: IncidentSeverity;
  size?: "sm" | "default" | "lg";
  pulse?: boolean;
  className?: string;
}

export function SeverityIndicator({
  severity,
  size = "default",
  pulse = false,
  className,
}: SeverityIndicatorProps) {
  const colors: Record<IncidentSeverity, string> = {
    minor: "bg-[var(--status-warning-text)]",
    major: "bg-[var(--status-orange-text)]",
    critical: "bg-[var(--status-error-text)]",
  };

  const sizes = {
    sm: "h-2 w-2",
    default: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  return (
    <span className={cn("relative inline-flex", className)}>
      <span className={cn("rounded-full", colors[severity], sizes[size])} />
      {pulse && severity === "critical" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            colors[severity]
          )}
        />
      )}
    </span>
  );
}

// Get severity color for charts and other uses
export function getSeverityColor(severity: IncidentSeverity): string {
  const colors: Record<IncidentSeverity, string> = {
    minor: "#eab308", // yellow-500
    major: "#f97316", // orange-500
    critical: "#ef4444", // red-500
  };
  return colors[severity];
}

// Get status color for charts and other uses
export function getIncidentStatusColor(status: IncidentStatus): string {
  const colors: Record<IncidentStatus, string> = {
    investigating: "#eab308", // yellow-500
    identified: "#f97316", // orange-500
    monitoring: "#3b82f6", // blue-500
    resolved: "#22c55e", // green-500
  };
  return colors[status];
}
