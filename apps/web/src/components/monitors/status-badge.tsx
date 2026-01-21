"use client";

import { Badge, cn } from "@uni-status/ui";
import { CheckCircle, AlertTriangle, XCircle, Pause, Clock } from "lucide-react";

export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

const statusConfig: Record<
  MonitorStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    icon: typeof CheckCircle;
  }
> = {
  active: {
    label: "Operational",
    variant: "default",
    className: "bg-[var(--status-success-text)] hover:opacity-80 text-white border-[var(--status-success-text)]",
    icon: CheckCircle,
  },
  degraded: {
    label: "Degraded",
    variant: "default",
    className: "bg-[var(--status-warning-text)] hover:opacity-80 text-white border-[var(--status-warning-text)]",
    icon: AlertTriangle,
  },
  down: {
    label: "Down",
    variant: "destructive",
    className: "bg-[var(--status-error-text)] hover:opacity-80 text-white border-[var(--status-error-text)]",
    icon: XCircle,
  },
  paused: {
    label: "Paused",
    variant: "secondary",
    className: "bg-[var(--status-gray-text)] hover:opacity-80 text-white border-[var(--status-gray-text)]",
    icon: Pause,
  },
  pending: {
    label: "Pending",
    variant: "outline",
    className: "border-[var(--status-gray-text)]/50 text-[var(--status-gray-text)]",
    icon: Clock,
  },
};

export interface StatusBadgeProps {
  status: MonitorStatus;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function StatusBadge({
  status,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
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

// Status indicator dot for compact displays
export interface StatusIndicatorProps {
  status: MonitorStatus;
  size?: "sm" | "default" | "lg";
  pulse?: boolean;
  className?: string;
}

export function StatusIndicator({
  status,
  size = "default",
  pulse = false,
  className,
}: StatusIndicatorProps) {
  const colors: Record<MonitorStatus, string> = {
    active: "bg-[var(--status-success-text)]",
    degraded: "bg-[var(--status-warning-text)]",
    down: "bg-[var(--status-error-text)]",
    paused: "bg-[var(--status-gray-text)]",
    pending: "bg-[var(--status-gray-text)]/70",
  };

  const sizes = {
    sm: "h-2 w-2",
    default: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  return (
    <span className={cn("relative inline-flex", className)}>
      <span className={cn("rounded-full", colors[status], sizes[size])} />
      {pulse && (status === "active" || status === "degraded") && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            colors[status]
          )}
        />
      )}
    </span>
  );
}

// Get status color for charts and other uses
export function getStatusColor(status: MonitorStatus): string {
  const colors: Record<MonitorStatus, string> = {
    active: "#22c55e", // green-500
    degraded: "#eab308", // yellow-500
    down: "#ef4444", // red-500
    paused: "#6b7280", // gray-500
    pending: "#9ca3af", // gray-400
  };
  return colors[status];
}

// Get check result status color
export type CheckStatus = "success" | "degraded" | "failure" | "timeout" | "error";

export function getCheckStatusColor(status: CheckStatus): string {
  const colors: Record<CheckStatus, string> = {
    success: "#22c55e",
    degraded: "#eab308",
    failure: "#ef4444",
    timeout: "#f97316",
    error: "#dc2626",
  };
  return colors[status];
}
