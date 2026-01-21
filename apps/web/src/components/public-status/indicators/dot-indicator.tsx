"use client";

import { cn } from "@uni-status/ui";
import { type IndicatorProps, statusColors } from "./types";

export function DotIndicator({
  status,
  size = "default",
  pulse = false,
  className,
}: IndicatorProps) {
  const sizes = {
    sm: "h-2 w-2",
    default: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  return (
    <span className={cn("relative inline-flex", className)}>
      <span className={cn("rounded-full", statusColors[status], sizes[size])} />
      {pulse && (status === "active" || status === "degraded") && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            statusColors[status]
          )}
        />
      )}
    </span>
  );
}
