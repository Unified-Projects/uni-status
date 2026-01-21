"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, Button } from "@uni-status/ui";
import { PublicMonitorItem } from "./public-monitor-item";
import type { UptimeDataPoint } from "@/components/monitors/uptime-bar";
import type { MonitorStatus } from "@/components/monitors";

interface PublicMonitor {
  id: string;
  name: string;
  description?: string;
  status: MonitorStatus;
  uptimePercentage: number | null;
  responseTimeMs: number | null;
  uptimeData: UptimeDataPoint[];
}

interface MonitorGroupProps {
  name: string;
  description?: string;
  monitors: PublicMonitor[];
  showUptimePercentage: boolean;
  showResponseTime: boolean;
  uptimeDays: 45 | 90;
  defaultCollapsed?: boolean;
  className?: string;
}

export function MonitorGroup({
  name,
  description,
  monitors,
  showUptimePercentage,
  showResponseTime,
  uptimeDays,
  defaultCollapsed = false,
  className,
}: MonitorGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Calculate group status summary
  const operationalCount = monitors.filter((m) => m.status === "active").length;
  const degradedCount = monitors.filter((m) => m.status === "degraded").length;
  const downCount = monitors.filter((m) => m.status === "down").length;

  const getGroupStatusColor = () => {
    if (downCount > 0) return "bg-status-error-solid";
    if (degradedCount > 0) return "bg-status-warning-solid";
    return "bg-status-success-solid";
  };

  return (
    <div className={cn("rounded-lg border", className)}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-[var(--status-muted)]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {collapsed ? (
            <ChevronRight className="h-5 w-5 text-[var(--status-muted-text)]" />
          ) : (
            <ChevronDown className="h-5 w-5 text-[var(--status-muted-text)]" />
          )}
          <div
            className={cn(
              "h-3 w-3 rounded-full",
              getGroupStatusColor()
            )}
          />
          <div>
            <h3 className="font-medium">{name}</h3>
            {description && (
              <p className="text-sm text-[var(--status-muted-text)]">{description}</p>
            )}
          </div>
        </div>
        <div className="text-sm text-[var(--status-muted-text)]">
          {operationalCount === monitors.length ? (
            <span className="text-status-success-icon">All operational</span>
          ) : (
            <span>
              {operationalCount}/{monitors.length} operational
            </span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t px-4 pb-4 pt-2 space-y-3">
          {monitors.map((monitor) => (
            <PublicMonitorItem
              key={monitor.id}
              monitor={monitor}
              showUptimePercentage={showUptimePercentage}
              showResponseTime={showResponseTime}
              uptimeDays={uptimeDays}
            />
          ))}
        </div>
      )}
    </div>
  );
}
