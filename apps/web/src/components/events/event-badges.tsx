"use client";

import { Badge, cn } from "@uni-status/ui";
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  CheckCircle,
  Search,
  Eye,
  Wrench,
  Clock,
  Play,
  CalendarDays,
} from "lucide-react";
import type { EventType, IncidentSeverity, IncidentStatus, MaintenanceStatus } from "@uni-status/shared";

// Event type badge (Incident / Maintenance)
const eventTypeConfig: Record<
  EventType,
  {
    label: string;
    className: string;
    icon: typeof AlertCircle;
  }
> = {
  incident: {
    label: "Incident",
    className: "bg-[var(--status-error-bg)] text-[var(--status-error-text)] border-[var(--status-error-border)]",
    icon: AlertCircle,
  },
  maintenance: {
    label: "Maintenance",
    className: "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]",
    icon: Wrench,
  },
};

export interface EventTypeBadgeProps {
  type: EventType;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function EventTypeBadge({
  type,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: EventTypeBadgeProps) {
  const config = eventTypeConfig[type] || eventTypeConfig.incident;
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
      variant="outline"
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

// Severity badge for incidents
const severityConfig: Record<
  IncidentSeverity,
  {
    label: string;
    className: string;
    icon: typeof AlertTriangle;
  }
> = {
  minor: {
    label: "Minor",
    className: "bg-[var(--status-warning-solid)] hover:bg-[var(--status-warning-solid-hover)] text-white border-[var(--status-warning-solid)]",
    icon: AlertTriangle,
  },
  major: {
    label: "Major",
    className: "bg-[var(--status-warning-text)] hover:opacity-80 text-white border-[var(--status-warning-text)]",
    icon: AlertCircle,
  },
  critical: {
    label: "Critical",
    className: "bg-[var(--status-error-solid)] hover:bg-[var(--status-error-solid-hover)] text-white border-[var(--status-error-solid)]",
    icon: AlertOctagon,
  },
};

export interface EventSeverityBadgeProps {
  severity: IncidentSeverity | "maintenance";
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function EventSeverityBadge({
  severity,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: EventSeverityBadgeProps) {
  if (severity === "maintenance") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]",
          size === "sm" ? "text-xs px-1.5 py-0.5" : size === "lg" ? "text-sm px-3 py-1" : "text-xs px-2.5 py-0.5",
          "inline-flex items-center gap-1",
          className
        )}
      >
        {showIcon && <Wrench className={size === "sm" ? "h-3 w-3" : size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />}
        {showLabel && "Maintenance"}
      </Badge>
    );
  }

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
      variant="default"
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

// Unified status badge for both incidents and maintenance
const incidentStatusConfig: Record<
  IncidentStatus,
  {
    label: string;
    className: string;
    icon: typeof Search;
  }
> = {
  investigating: {
    label: "Investigating",
    className: "border-[var(--status-warning-border)] text-[var(--status-warning-text)] bg-[var(--status-warning-bg)]",
    icon: Search,
  },
  identified: {
    label: "Identified",
    className: "border-[var(--status-error-border)] text-[var(--status-error-text)] bg-[var(--status-error-bg)]",
    icon: AlertCircle,
  },
  monitoring: {
    label: "Monitoring",
    className: "border-[var(--status-info-border)] text-[var(--status-info-text)] bg-[var(--status-info-bg)]",
    icon: Eye,
  },
  resolved: {
    label: "Resolved",
    className: "border-[var(--status-success-border)] text-[var(--status-success-text)] bg-[var(--status-success-bg)]",
    icon: CheckCircle,
  },
};

const maintenanceStatusConfig: Record<
  MaintenanceStatus,
  {
    label: string;
    className: string;
    icon: typeof Clock;
  }
> = {
  scheduled: {
    label: "Scheduled",
    className: "border-[var(--status-info-border)] text-[var(--status-info-text)] bg-[var(--status-info-bg)]",
    icon: CalendarDays,
  },
  active: {
    label: "In Progress",
    className: "border-[var(--status-warning-border)] text-[var(--status-warning-text)] bg-[var(--status-warning-bg)]",
    icon: Play,
  },
  completed: {
    label: "Completed",
    className: "border-[var(--status-success-border)] text-[var(--status-success-text)] bg-[var(--status-success-bg)]",
    icon: CheckCircle,
  },
};

export interface EventStatusBadgeProps {
  type: EventType;
  status: IncidentStatus | MaintenanceStatus;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function EventStatusBadge({
  type,
  status,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: EventStatusBadgeProps) {
  const config =
    type === "incident"
      ? incidentStatusConfig[status as IncidentStatus] || incidentStatusConfig.investigating
      : maintenanceStatusConfig[status as MaintenanceStatus] || maintenanceStatusConfig.scheduled;
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
      variant="outline"
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

// Event indicator dot for timeline views
export interface EventIndicatorProps {
  type: EventType;
  severity?: IncidentSeverity | "maintenance";
  size?: "sm" | "default" | "lg";
  pulse?: boolean;
  className?: string;
}

export function EventIndicator({
  type,
  severity,
  size = "default",
  pulse = false,
  className,
}: EventIndicatorProps) {
  const getColor = () => {
    if (type === "maintenance") return "bg-[var(--status-info-solid)]";
    switch (severity) {
      case "minor":
        return "bg-[var(--status-warning-solid)]";
      case "major":
        return "bg-[var(--status-warning-text)]";
      case "critical":
        return "bg-[var(--status-error-solid)]";
      default:
        return "bg-[var(--status-warning-solid)]";
    }
  };

  const sizes = {
    sm: "h-2 w-2",
    default: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  const color = getColor();

  return (
    <span className={cn("relative inline-flex", className)}>
      <span className={cn("rounded-full", color, sizes[size])} />
      {pulse && (severity === "critical" || type === "maintenance") && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            color
          )}
        />
      )}
    </span>
  );
}

// Get color for charts and other uses
export function getEventColor(type: EventType, severity?: IncidentSeverity): string {
  if (type === "maintenance") return "#3b82f6"; // blue-500
  switch (severity) {
    case "minor":
      return "#eab308"; // yellow-500
    case "major":
      return "#f97316"; // orange-500
    case "critical":
      return "#ef4444"; // red-500
    default:
      return "#eab308";
  }
}

export function getEventStatusColor(type: EventType, status: string): string {
  if (type === "incident") {
    const colors: Record<string, string> = {
      investigating: "#eab308",
      identified: "#f97316",
      monitoring: "#3b82f6",
      resolved: "#22c55e",
    };
    return colors[status] || "#eab308";
  }
  const colors: Record<string, string> = {
    scheduled: "#3b82f6",
    active: "#eab308",
    completed: "#22c55e",
  };
  return colors[status] || "#3b82f6";
}
