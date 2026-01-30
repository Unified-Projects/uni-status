"use client";

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@uni-status/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@uni-status/ui";
import { History } from "lucide-react";
import type { IncidentSeverity } from "@uni-status/shared/types";

export type UptimeStatus = "success" | "degraded" | "down" | "unknown" | "maintenance" | "incident";

export interface IncidentInfo {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status?: "investigating" | "identified" | "monitoring" | "resolved";
}

export interface UptimeDataPoint {
  date: string;
  timestamp?: string; // ISO timestamp for hour/minute granularity
  uptimePercentage: number | null;
  status: UptimeStatus;
  successCount?: number;
  degradedCount?: number;
  failureCount?: number;
  totalCount?: number;
  incidents?: IncidentInfo[];
}

export type UptimeGranularity = "minute" | "hour" | "day";

export interface UptimeBarProps {
  data: UptimeDataPoint[];
  days: number;
  granularity?: UptimeGranularity;
  className?: string;
  showTooltip?: boolean;
  showLegend?: boolean;
  height?: number;
  /** Optional: status page slug for "View Historical Uptime" link */
  statusPageSlug?: string;
  /** Optional: monitor ID for filtering events by this monitor */
  monitorId?: string;
}

const statusColors: Record<UptimeStatus, string> = {
  success: "bg-green-500",
  degraded: "bg-yellow-500",
  down: "bg-red-500",
  unknown: "bg-gray-300",
  maintenance: "bg-blue-400",
  incident: "bg-purple-500",
};

export function UptimeBar({
  data,
  days,
  granularity = "day",
  className,
  showTooltip = true,
  showLegend = false,
  height = 32,
  statusPageSlug,
  monitorId,
}: UptimeBarProps) {
  const targetSegments = Math.max(1, Math.floor(days));

  // Normalize data: always show exactly `targetSegments` bars
  // The granularity determines what each bar represents (day/hour/minute)
  const normalizedData = useMemo(() => {
    const sortedData = [...data].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.date).getTime();
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.date).getTime();
      return aTime - bTime;
    });

    // Take the most recent `targetSegments` data points
    // This ensures we always show `targetSegments` bars filled with available data
    const recentData = sortedData.slice(-targetSegments);

    // If we have fewer data points than target, pad with unknown at the beginning
    if (recentData.length < targetSegments) {
      const padding: UptimeDataPoint[] = [];
      const paddingNeeded = targetSegments - recentData.length;

      // Calculate time offset based on granularity for padding labels
      const firstDataTime = recentData.length > 0
        ? new Date(recentData[0].timestamp || recentData[0].date).getTime()
        : Date.now();

      const intervalMs = granularity === "day"
        ? 24 * 60 * 60 * 1000
        : granularity === "hour"
          ? 60 * 60 * 1000
          : 60 * 1000;

      for (let i = paddingNeeded; i > 0; i--) {
        const paddingTime = new Date(firstDataTime - i * intervalMs);
        padding.push({
          date: paddingTime.toISOString().split("T")[0],
          timestamp: paddingTime.toISOString(),
          uptimePercentage: null,
          status: "unknown",
        });
      }

      return [...padding, ...recentData];
    }

    return recentData;
  }, [data, targetSegments, granularity]);

  // Calculate overall uptime - weighted by check counts for consistency with API
  const overallUptime = useMemo(() => {
    const validData = normalizedData.filter(
      (d) => d.uptimePercentage !== null && d.status !== "unknown"
    );
    if (validData.length === 0) return null;

    // If we have check counts, use weighted calculation (consistent with backend)
    const hasCheckCounts = validData.some(d => d.totalCount !== undefined && d.totalCount > 0);

    if (hasCheckCounts) {
      const totals = validData.reduce(
        (acc, d) => ({
          success: acc.success + (d.successCount ?? 0),
          degraded: acc.degraded + (d.degradedCount ?? 0),
          total: acc.total + (d.totalCount ?? 0),
        }),
        { success: 0, degraded: 0, total: 0 }
      );
      return totals.total > 0 ? ((totals.success + totals.degraded) / totals.total) * 100 : null;
    }

    // Fallback to unweighted average if no check counts available
    const sum = validData.reduce((acc, d) => acc + (d.uptimePercentage || 0), 0);
    return sum / validData.length;
  }, [normalizedData]);

  return (
    <div className={cn("space-y-2", className)}>
      <TooltipProvider delayDuration={100}>
        <div
          className="flex gap-[1px] rounded overflow-hidden"
          style={{ height }}
        >
          {normalizedData.map((point, index) => (
            <UptimeBarSegment
              key={point.timestamp || point.date}
              data={point}
              granularity={granularity}
              showTooltip={showTooltip}
              height={height}
              isFirst={index === 0}
              isLast={index === normalizedData.length - 1}
            />
          ))}
        </div>
      </TooltipProvider>

      {showLegend && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {granularity === "day"
              ? `${targetSegments} days ago`
              : granularity === "hour"
              ? `${targetSegments} hours ago`
              : `${targetSegments} minutes ago`}
          </span>
          <div className="flex items-center gap-4">
            {overallUptime !== null && (
              <span className="font-medium text-foreground">
                {overallUptime.toFixed(2)}% uptime
              </span>
            )}
            {statusPageSlug && monitorId && (
              <Link
                href={`/status/${statusPageSlug}/events?monitor=${monitorId}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <History className="h-3 w-3" />
                View Historical Uptime
              </Link>
            )}
          </div>
          <span>Now</span>
        </div>
      )}
    </div>
  );
}

interface UptimeBarSegmentProps {
  data: UptimeDataPoint;
  granularity: UptimeGranularity;
  showTooltip: boolean;
  height: number;
  isFirst: boolean;
  isLast: boolean;
}

const severityColors: Record<IncidentSeverity, string> = {
  minor: "text-yellow-500",
  major: "text-orange-500",
  critical: "text-red-600",
};

function UptimeBarSegment({
  data,
  granularity,
  showTooltip,
  height,
  isFirst,
  isLast,
}: UptimeBarSegmentProps) {
  const hasIncidents = data.incidents && data.incidents.length > 0;

  // Show incident color for any interval that had incidents (including resolved ones)
  // Otherwise use the status from the API (which is based on actual check results)
  let status: UptimeStatus;
  if (hasIncidents) {
    status = "incident";
  } else {
    // Trust the status from the API - it's based on actual degraded/failure check results
    status = data.status;
  }

  const segment = (
    <div
      className={cn(
        "relative flex-1 min-w-[2px] transition-all hover:opacity-80",
        statusColors[status],
        isFirst && "rounded-l",
        isLast && "rounded-r"
      )}
      style={{ height }}
    />
  );

  if (!showTooltip) return segment;

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);

    if (granularity === "day") {
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } else if (granularity === "hour") {
      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      // Minute granularity
      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  };

  const displayTimestamp = data.timestamp || data.date;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{segment}</TooltipTrigger>
      <TooltipContent>
        <div className="space-y-2 max-w-xs">
          <div className="font-medium">{formatTimestamp(displayTimestamp)}</div>
          {data.uptimePercentage !== null ? (
            <>
              <div className="text-sm">
                Uptime: {data.uptimePercentage.toFixed(2)}%
              </div>
              {data.totalCount !== undefined && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>{data.successCount ?? 0} successful</div>
                  {(data.degradedCount ?? 0) > 0 && (
                    <div className="text-yellow-600">{data.degradedCount} degraded (slow)</div>
                  )}
                  {(data.failureCount ?? 0) > 0 && (
                    <div className="text-red-500">{data.failureCount} failed</div>
                  )}
                  <div className="text-muted-foreground/70">{data.totalCount} total checks</div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No data</div>
          )}
          {hasIncidents && (
            <div className="pt-1 border-t border-border/50">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Known Incident{data.incidents!.length > 1 ? "s" : ""}:
              </div>
              {data.incidents!.map((incident) => (
                <div
                  key={incident.id}
                  className="text-xs flex items-center gap-1"
                >
                  <span className={cn("font-medium", severityColors[incident.severity])}>
                    [{incident.severity}]
                  </span>
                  <span className="truncate">{incident.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Compact uptime display for cards
export interface UptimeCompactProps {
  uptimePercentage: number | null;
  className?: string;
}

export function UptimeCompact({ uptimePercentage, className }: UptimeCompactProps) {
  if (uptimePercentage === null) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>--</span>
    );
  }

  const getColor = (uptime: number) => {
    if (uptime >= 99.9) return "text-green-600";
    if (uptime >= 99) return "text-green-500";
    if (uptime >= 95) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <span className={cn("text-sm font-medium", getColor(uptimePercentage), className)}>
      {uptimePercentage.toFixed(2)}%
    </span>
  );
}

// Legend component
export function UptimeLegend({ className }: { className?: string }) {
  const items: { status: UptimeStatus; label: string }[] = [
    { status: "success", label: "Operational" },
    { status: "degraded", label: "Degraded" },
    { status: "down", label: "Down" },
    { status: "incident", label: "Known Incident" },
    { status: "unknown", label: "No data" },
  ];

  return (
    <div className={cn("flex items-center gap-4 text-xs", className)}>
      {items.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <div className={cn("h-2.5 w-2.5 rounded-sm", statusColors[item.status])} />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
