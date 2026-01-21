"use client";

import { cn } from "@uni-status/ui";
import { CheckCircle, AlertTriangle, XCircle, Pause, Clock } from "lucide-react";
import {
  type IndicatorProps,
  type MonitorStatus,
  statusLabels,
  statusBgColors,
  statusTextColors,
} from "./types";

const statusIcons: Record<MonitorStatus, typeof CheckCircle> = {
  active: CheckCircle,
  degraded: AlertTriangle,
  down: XCircle,
  paused: Pause,
  pending: Clock,
};

export function PillIndicator({
  status,
  size = "default",
  className,
}: IndicatorProps) {
  const Icon = statusIcons[status] || statusIcons.pending;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 gap-1",
    default: "text-sm px-3 py-1 gap-1.5",
    lg: "text-base px-4 py-1.5 gap-2",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        statusBgColors[status],
        statusTextColors[status],
        sizeClasses[size],
        className
      )}
    >
      <Icon className={iconSizes[size]} />
      {statusLabels[status]}
    </span>
  );
}
