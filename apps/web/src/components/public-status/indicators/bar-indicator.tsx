"use client";

import { cn } from "@uni-status/ui";
import {
  type IndicatorProps,
  statusColors,
  statusLabels,
  statusTextColors,
} from "./types";

export function BarIndicator({
  status,
  size = "default",
  className,
}: IndicatorProps) {
  const heightClasses = {
    sm: "h-1",
    default: "h-1.5",
    lg: "h-2",
  };

  const textSizes = {
    sm: "text-xs",
    default: "text-sm",
    lg: "text-base",
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-1">
        <span className={cn("font-medium", statusTextColors[status], textSizes[size])}>
          {statusLabels[status]}
        </span>
      </div>
      <div className={cn("w-full rounded-full bg-status-gray-border", heightClasses[size])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            statusColors[status],
            status === "active" ? "w-full" : status === "degraded" ? "w-3/4" : "w-1/4"
          )}
        />
      </div>
    </div>
  );
}
