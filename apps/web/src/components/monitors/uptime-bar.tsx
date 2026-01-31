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
  success: "bg-[var(--status-success-solid)]",
  degraded: "bg-[var(--status-warning-solid)]",
  down: "bg-[var(--status-error-solid)]",
  unknown: "bg-gray-300 dark:bg-gray-600",
  maintenance: "bg-[var(--status-info-solid)]",
  incident: "bg-[var(--status-error-solid)]",
};

interface SegmentHeights {
  success: number;
  degraded: number;
  failure: number;
}

/**
 * Calculate pixel heights for each status segment based on percentage.
 * Ensures non-zero values have at least minimum visible height.
 */
function calculateSegmentHeights(
  data: UptimeDataPoint,
  totalHeight: number,
  minHeight: number = 2
): SegmentHeights {
  const { successCount = 0, degradedCount = 0, failureCount = 0, totalCount = 0 } = data;

  // If no data, return zero heights
  if (totalCount === 0) {
    return { success: 0, degraded: 0, failure: 0 };
  }

  // Calculate raw percentages
  const successPct = successCount / totalCount;
  const degradedPct = degradedCount / totalCount;
  const failurePct = failureCount / totalCount;

  // Calculate initial heights based on percentages
  let successHeight = successPct * totalHeight;
  let degradedHeight = degradedPct * totalHeight;
  let failureHeight = failurePct * totalHeight;

  // Track which segments need minimum height adjustment
  const segments: { key: keyof SegmentHeights; count: number; height: number }[] = [
    { key: "success", count: successCount, height: successHeight },
    { key: "degraded", count: degradedCount, height: degradedHeight },
    { key: "failure", count: failureCount, height: failureHeight },
  ];

  // Count non-zero segments that need minimum height
  const nonZeroSegments = segments.filter(s => s.count > 0);
  const segmentsNeedingMinHeight = nonZeroSegments.filter(s => s.height < minHeight);

  if (segmentsNeedingMinHeight.length > 0) {
    // Calculate how much extra space we need
    const extraNeeded = segmentsNeedingMinHeight.reduce(
      (acc, s) => acc + (minHeight - s.height),
      0
    );

    // Find the largest segment to take space from
    const largestSegment = [...nonZeroSegments]
      .filter(s => s.height >= minHeight)
      .sort((a, b) => b.height - a.height)[0];

    if (largestSegment && largestSegment.height > extraNeeded + minHeight) {
      // Adjust heights
      const result: SegmentHeights = { success: 0, degraded: 0, failure: 0 };

      for (const seg of segments) {
        if (seg.count === 0) {
          result[seg.key] = 0;
        } else if (seg.height < minHeight) {
          result[seg.key] = minHeight;
        } else if (seg.key === largestSegment.key) {
          result[seg.key] = seg.height - extraNeeded;
        } else {
          result[seg.key] = seg.height;
        }
      }

      return result;
    }
  }

  // Return calculated heights (may be less than minHeight for small segments)
  return {
    success: successCount > 0 ? Math.max(successHeight, minHeight) : 0,
    degraded: degradedCount > 0 ? Math.max(degradedHeight, minHeight) : 0,
    failure: failureCount > 0 ? Math.max(failureHeight, minHeight) : 0,
  };
}

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
  minor: "text-[var(--status-warning-solid)]",
  major: "text-[var(--status-warning-text)]",
  critical: "text-[var(--status-error-solid)]",
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
  const { successCount = 0, degradedCount = 0, failureCount = 0, totalCount = 0 } = data;

  // Determine if we should use proportional rendering
  // Use proportional only when there are mixed results (degraded or failed checks)
  const hasMixedResults = totalCount > 0 && (degradedCount > 0 || failureCount > 0);
  const useProportionalRendering = hasMixedResults && data.status !== "unknown" && data.status !== "maintenance";

  // Calculate segment heights for proportional rendering
  const segmentHeights = useProportionalRendering
    ? calculateSegmentHeights(data, height)
    : null;

  // For solid color rendering, determine the status
  let solidStatus: UptimeStatus;
  if (hasIncidents) {
    solidStatus = "incident";
  } else {
    solidStatus = data.status;
  }

  const segment = useProportionalRendering ? (
    // Proportional stacked bar: failures at bottom, success at top
    <div
      className={cn(
        "relative flex-1 min-w-[2px] transition-all hover:opacity-80 flex flex-col-reverse overflow-hidden",
        isFirst && "rounded-l",
        isLast && "rounded-r",
        hasIncidents && "ring-1 ring-inset ring-[var(--status-error-solid)]/50"
      )}
      style={{ height }}
    >
      {/* Failure segment (bottom) */}
      {segmentHeights!.failure > 0 && (
        <div
          className="w-full bg-[var(--status-error-solid)] flex-shrink-0"
          style={{ height: segmentHeights!.failure }}
        />
      )}
      {/* Degraded segment (middle) */}
      {segmentHeights!.degraded > 0 && (
        <div
          className="w-full bg-[var(--status-warning-solid)] flex-shrink-0"
          style={{ height: segmentHeights!.degraded }}
        />
      )}
      {/* Success segment (top) - uses flex-grow to fill remaining space */}
      {segmentHeights!.success > 0 && (
        <div
          className="w-full bg-[var(--status-success-solid)] flex-grow"
          style={{ minHeight: segmentHeights!.success }}
        />
      )}
    </div>
  ) : (
    // Solid color rendering for 100% success, maintenance, unknown, or no data
    <div
      className={cn(
        "relative flex-1 min-w-[2px] transition-all hover:opacity-80",
        statusColors[solidStatus],
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
              {data.totalCount !== undefined && data.totalCount > 0 && (
                <div className="text-xs text-muted-foreground space-y-1.5">
                  {/* Mini horizontal breakdown bar */}
                  <div className="flex h-2 w-full rounded overflow-hidden">
                    {successCount > 0 && (
                      <div
                        className="bg-[var(--status-success-solid)]"
                        style={{ width: `${(successCount / totalCount) * 100}%` }}
                      />
                    )}
                    {degradedCount > 0 && (
                      <div
                        className="bg-[var(--status-warning-solid)]"
                        style={{ width: `${(degradedCount / totalCount) * 100}%` }}
                      />
                    )}
                    {failureCount > 0 && (
                      <div
                        className="bg-[var(--status-error-solid)]"
                        style={{ width: `${(failureCount / totalCount) * 100}%` }}
                      />
                    )}
                  </div>
                  {/* Text breakdown */}
                  <div className="space-y-0.5">
                    <div>{successCount} successful</div>
                    {degradedCount > 0 && (
                      <div className="text-[var(--status-warning-solid)]">{degradedCount} degraded (slow)</div>
                    )}
                    {failureCount > 0 && (
                      <div className="text-[var(--status-error-solid)]">{failureCount} failed</div>
                    )}
                    <div className="text-muted-foreground/70">{totalCount} total checks</div>
                  </div>
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
    if (uptime >= 99.9) return "text-[var(--status-success-text)]";
    if (uptime >= 99) return "text-[var(--status-success-solid)]";
    if (uptime >= 95) return "text-[var(--status-warning-solid)]";
    return "text-[var(--status-error-solid)]";
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
