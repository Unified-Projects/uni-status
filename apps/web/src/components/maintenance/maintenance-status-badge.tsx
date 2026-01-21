"use client";

import { Badge, cn } from "@uni-status/ui";
import { Calendar, Clock, CheckCircle, XCircle } from "lucide-react";

export type MaintenanceStatus = "scheduled" | "active" | "completed" | "cancelled";

const statusConfig: Record<
  MaintenanceStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    icon: typeof Calendar;
  }
> = {
  scheduled: {
    label: "Scheduled",
    variant: "outline",
    className: "border-[var(--status-info-text)]/50 text-[var(--status-info-text)] bg-[var(--status-info-bg)]",
    icon: Calendar,
  },
  active: {
    label: "Active",
    variant: "default",
    className: "bg-[var(--status-warning-text)] hover:opacity-80 text-white border-[var(--status-warning-text)]",
    icon: Clock,
  },
  completed: {
    label: "Completed",
    variant: "outline",
    className: "border-[var(--status-gray-text)]/50 text-[var(--status-gray-text)] bg-[var(--status-gray-bg)]",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Cancelled",
    variant: "outline",
    className: "border-[var(--status-error-text)]/50 text-[var(--status-error-text)] bg-[var(--status-error-bg)]",
    icon: XCircle,
  },
};

export interface MaintenanceStatusBadgeProps {
  status: MaintenanceStatus;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function MaintenanceStatusBadge({
  status,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: MaintenanceStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.scheduled;
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
export interface MaintenanceStatusIndicatorProps {
  status: MaintenanceStatus;
  size?: "sm" | "default" | "lg";
  pulse?: boolean;
  className?: string;
}

export function MaintenanceStatusIndicator({
  status,
  size = "default",
  pulse = false,
  className,
}: MaintenanceStatusIndicatorProps) {
  const colors: Record<MaintenanceStatus, string> = {
    scheduled: "bg-[var(--status-info-text)]",
    active: "bg-[var(--status-warning-text)]",
    completed: "bg-[var(--status-gray-text)]",
    cancelled: "bg-[var(--status-error-text)]",
  };

  const sizes = {
    sm: "h-2 w-2",
    default: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  return (
    <span className={cn("relative inline-flex", className)}>
      <span className={cn("rounded-full", colors[status], sizes[size])} />
      {pulse && status === "active" && (
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
export function getMaintenanceStatusColor(status: MaintenanceStatus): string {
  const colors: Record<MaintenanceStatus, string> = {
    scheduled: "#3b82f6", // blue-500
    active: "#eab308", // yellow-500
    completed: "#9ca3af", // gray-400
    cancelled: "#f87171", // red-400
  };
  return colors[status];
}
