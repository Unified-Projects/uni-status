"use client";

import { cn } from "@uni-status/ui";
import { UptimeBar, type UptimeDataPoint } from "@/components/monitors/uptime-bar";
import { StatusIndicator, type MonitorStatus } from "@/components/monitors";
import { showsUptime, type MonitorType } from "./monitors/types";

interface PublicMonitor {
  id: string;
  name: string;
  description?: string;
  type?: MonitorType;
  status: MonitorStatus;
  uptimePercentage: number | null;
  responseTimeMs: number | null;
  uptimeData: UptimeDataPoint[];
}

interface PublicMonitorItemProps {
  monitor: PublicMonitor;
  showUptimePercentage: boolean;
  showResponseTime: boolean;
  uptimeDays: number;
  className?: string;
}

export function PublicMonitorItem({
  monitor,
  showUptimePercentage,
  showResponseTime,
  uptimeDays,
  className,
}: PublicMonitorItemProps) {
  const formatResponseTime = (ms: number | null) => {
    if (ms === null) return "--";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatUptime = (percentage: number | null) => {
    if (percentage === null) return "--";
    return `${percentage.toFixed(2)}%`;
  };

  const adjustedDays = monitor.uptimeData?.length
    ? Math.max(1, Math.min(uptimeDays, monitor.uptimeData.length))
    : uptimeDays;

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--status-card)] p-4 transition-colors hover:bg-[var(--status-muted)]/50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <StatusIndicator status={monitor.status} pulse />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-[var(--status-text)]">{monitor.name}</h3>
            {monitor.description && (
              <p className="text-sm text-[var(--status-muted-text)] truncate">
                {monitor.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {/* Uptime - show for all types except SSL-only */}
          {showUptimePercentage && (!monitor.type || showsUptime(monitor.type)) && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">Uptime</div>
              <div
                className={cn(
                  "font-medium",
                  monitor.uptimePercentage !== null &&
                    monitor.uptimePercentage >= 99.9
                    ? "text-status-success-icon"
                    : monitor.uptimePercentage !== null &&
                        monitor.uptimePercentage >= 99
                      ? "text-status-success-solid"
                      : monitor.uptimePercentage !== null &&
                          monitor.uptimePercentage >= 95
                        ? "text-status-warning-solid"
                        : monitor.uptimePercentage !== null
                          ? "text-status-error-solid"
                          : "text-[var(--status-muted-text)]"
                )}
              >
                {formatUptime(monitor.uptimePercentage)}
              </div>
            </div>
          )}
          {showResponseTime && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">Response</div>
              <div className="font-medium text-[var(--status-text)]">
                {formatResponseTime(monitor.responseTimeMs)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Uptime Bar - only for types that show uptime (not SSL-only) */}
      {(!monitor.type || showsUptime(monitor.type)) && (
        <div className="mt-4">
          <UptimeBar
            data={monitor.uptimeData}
            days={adjustedDays}
            height={24}
            showTooltip
            showLegend={false}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-[var(--status-muted-text)]">
            <span>{adjustedDays} days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}
