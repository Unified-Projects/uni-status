"use client";

import { cn, Badge } from "@uni-status/ui";
import { type IndicatorProps, type MonitorStatus, statusLabels } from "./types";
import { monitorStatusConfig, getStatusBadgeClasses } from "@/lib/status-colors";

const statusConfig: Record<
  MonitorStatus,
  {
    className: string;
    icon: typeof monitorStatusConfig.active.icon;
  }
> = {
  active: {
    className: `${getStatusBadgeClasses(monitorStatusConfig.active.colors)} border-status-success-solid`,
    icon: monitorStatusConfig.active.icon,
  },
  degraded: {
    className: `${getStatusBadgeClasses(monitorStatusConfig.degraded.colors)} border-status-warning-solid`,
    icon: monitorStatusConfig.degraded.icon,
  },
  down: {
    className: `${getStatusBadgeClasses(monitorStatusConfig.down.colors)} border-status-error-solid`,
    icon: monitorStatusConfig.down.icon,
  },
  paused: {
    className: `${getStatusBadgeClasses(monitorStatusConfig.paused.colors)} border-status-gray-solid`,
    icon: monitorStatusConfig.paused.icon,
  },
  pending: {
    className: "border-status-gray-border text-status-gray-text bg-status-gray-bg",
    icon: monitorStatusConfig.pending.icon,
  },
};

export function BadgeIndicator({
  status,
  size = "default",
  className,
}: IndicatorProps) {
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
      className={cn(
        config.className,
        sizeClasses[size],
        "inline-flex items-center gap-1",
        className
      )}
    >
      <Icon className={iconSizes[size]} />
      {statusLabels[status]}
    </Badge>
  );
}
