"use client";

import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Badge, cn } from "@uni-status/ui";

export type AlertHistoryStatus = "triggered" | "acknowledged" | "resolved";

interface AlertStatusBadgeProps {
  status: AlertHistoryStatus;
  size?: "sm" | "default";
  className?: string;
}

const statusConfig: Record<
  AlertHistoryStatus,
  { label: string; variant: "destructive" | "default" | "secondary"; icon: typeof AlertCircle; className: string }
> = {
  triggered: {
    label: "Triggered",
    variant: "destructive",
    icon: AlertCircle,
    className: "",
  },
  acknowledged: {
    label: "Acknowledged",
    variant: "default",
    icon: Clock,
    className: "bg-yellow-500 hover:bg-yellow-500/80",
  },
  resolved: {
    label: "Resolved",
    variant: "default",
    icon: CheckCircle,
    className: "bg-green-500 hover:bg-green-500/80",
  },
};

export function AlertStatusBadge({
  status,
  size = "default",
  className,
}: AlertStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "gap-1",
        config.className,
        size === "sm" && "text-xs py-0 px-1.5",
        className
      )}
    >
      <Icon className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      {config.label}
    </Badge>
  );
}

export function getAlertStatusLabel(status: AlertHistoryStatus): string {
  return statusConfig[status].label;
}
