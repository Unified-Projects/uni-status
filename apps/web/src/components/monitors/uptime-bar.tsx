"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@uni-status/ui";
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

export interface UptimeRangeMetadata {
  granularity: UptimeGranularity;
  requestedSegments: number;
  visibleData: UptimeDataPoint[];
  visibleRange: number;
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

const GRANULARITY_MS: Record<UptimeGranularity, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};
const TOOLTIP_EDGE_PADDING = 8;

function getPointTime(dataPoint: UptimeDataPoint): number {
  return new Date(dataPoint.timestamp || dataPoint.date).getTime();
}

function sortUptimeData(data: UptimeDataPoint[]): UptimeDataPoint[] {
  return [...data].sort((a, b) => getPointTime(a) - getPointTime(b));
}

export function resolveUptimeGranularity(
  data: UptimeDataPoint[],
  granularity?: UptimeGranularity
): UptimeGranularity {
  if (granularity) return granularity;
  if (!data.some((point) => point.timestamp)) return "day";

  const sortedData = sortUptimeData(data);
  const positiveDiffs = sortedData
    .slice(1)
    .map((point, index) => getPointTime(point) - getPointTime(sortedData[index]))
    .filter((diff) => diff > 0);

  if (positiveDiffs.length === 0) return "day";

  const smallestDiff = Math.min(...positiveDiffs);
  if (smallestDiff < GRANULARITY_MS.hour) return "minute";
  if (smallestDiff < GRANULARITY_MS.day) return "hour";
  return "day";
}

export function getUptimeRangeMetadata(
  data: UptimeDataPoint[],
  segments: number,
  granularity?: UptimeGranularity
): UptimeRangeMetadata {
  const resolvedGranularity = resolveUptimeGranularity(data, granularity);
  const requestedSegments = Math.max(1, Math.floor(segments));
  const visibleData = sortUptimeData(data).slice(-requestedSegments);

  if (visibleData.length === 0) {
    return {
      granularity: resolvedGranularity,
      requestedSegments,
      visibleData,
      visibleRange: 0,
    };
  }

  const intervalMs = GRANULARITY_MS[resolvedGranularity];
  const firstTime = getPointTime(visibleData[0]);
  const lastTime = getPointTime(visibleData[visibleData.length - 1]);
  const visibleRange = Math.max(1, Math.round((lastTime - firstTime) / intervalMs) + 1);

  return {
    granularity: resolvedGranularity,
    requestedSegments,
    visibleData,
    visibleRange,
  };
}

export function formatUptimeRangeLabel(range: number, granularity: UptimeGranularity): string {
  const unit = range === 1
    ? granularity === "day"
      ? "day"
      : granularity === "hour"
        ? "hour"
        : "minute"
    : granularity === "day"
      ? "days"
      : granularity === "hour"
        ? "hours"
        : "minutes";

  return `${range} ${unit}`;
}

export function formatUptimeAgoLabel(range: number, granularity: UptimeGranularity): string {
  return `${formatUptimeRangeLabel(range, granularity)} ago`;
}

export function getUptimeCurrentLabel(granularity: UptimeGranularity): string {
  return granularity === "day" ? "Today" : "Now";
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
  const successHeight = successPct * totalHeight;
  const degradedHeight = degradedPct * totalHeight;
  const failureHeight = failurePct * totalHeight;

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
  granularity,
  className,
  showTooltip = true,
  showLegend = false,
  height = 32,
  statusPageSlug,
  monitorId,
}: UptimeBarProps) {
  const rangeMetadata = useMemo(
    () => getUptimeRangeMetadata(data, days, granularity),
    [data, days, granularity]
  );
  const normalizedData = rangeMetadata.visibleData;
  const resolvedGranularity = rangeMetadata.granularity;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipX, setTooltipX] = useState<number | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

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

  const clearActiveSegment = useCallback(() => {
    setActiveIndex(null);
    setTooltipX(null);
  }, []);

  const updateActiveSegment = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container || normalizedData.length === 0) {
        clearActiveSegment();
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const pointInsideContainer =
        clientX >= containerRect.left &&
        clientX <= containerRect.right &&
        clientY >= containerRect.top &&
        clientY <= containerRect.bottom;

      if (!pointInsideContainer && activePointerIdRef.current === null) {
        clearActiveSegment();
        return;
      }

      const hoveredElement = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>("[data-uptime-index]");
      const hoveredIndexValue = hoveredElement?.dataset.uptimeIndex;
      const parsedIndex =
        hoveredIndexValue === undefined ? Number.NaN : Number.parseInt(hoveredIndexValue, 10);
      const fallbackIndex = Math.min(
        normalizedData.length - 1,
        Math.max(
          0,
          Math.floor(
            ((clientX - containerRect.left) / Math.max(containerRect.width, 1)) *
              normalizedData.length
          )
        )
      );
      const nextIndex = Number.isNaN(parsedIndex) ? fallbackIndex : parsedIndex;

      if (nextIndex < 0 || nextIndex >= normalizedData.length) {
        clearActiveSegment();
        return;
      }

      setActiveIndex(nextIndex);

      const segmentRect = segmentRefs.current[nextIndex]?.getBoundingClientRect();
      const nextTooltipX = segmentRect
        ? segmentRect.left - containerRect.left + segmentRect.width / 2
        : Math.min(Math.max(clientX - containerRect.left, 0), containerRect.width);

      setTooltipX(nextTooltipX);
    },
    [clearActiveSegment, normalizedData.length]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!showTooltip) return;
      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateActiveSegment(event.clientX, event.clientY);
    },
    [showTooltip, updateActiveSegment]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!showTooltip) return;
      updateActiveSegment(event.clientX, event.clientY);
    },
    [showTooltip, updateActiveSegment]
  );

  const handlePointerLeave = useCallback(() => {
    if (activePointerIdRef.current !== null) return;
    clearActiveSegment();
  }, [clearActiveSegment]);

  const releasePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activePointerIdRef.current = null;
      clearActiveSegment();
    },
    [clearActiveSegment]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateMeasurements = () => {
      setContainerWidth(container.clientWidth);
      setTooltipWidth(tooltipRef.current?.offsetWidth ?? 0);
    };

    updateMeasurements();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(container);

    if (tooltipRef.current) {
      observer.observe(tooltipRef.current);
    }

    return () => observer.disconnect();
  }, [activeIndex]);

  const clampedTooltipX = useMemo(() => {
    if (tooltipX === null) return null;
    if (containerWidth <= 0 || tooltipWidth <= 0) return tooltipX;

    const availableWidth = Math.max(containerWidth - TOOLTIP_EDGE_PADDING * 2, 0);
    if (tooltipWidth >= availableWidth) {
      return containerWidth / 2;
    }

    const minX = tooltipWidth / 2 + TOOLTIP_EDGE_PADDING;
    const maxX = containerWidth - tooltipWidth / 2 - TOOLTIP_EDGE_PADDING;

    return Math.min(Math.max(tooltipX, minX), maxX);
  }, [containerWidth, tooltipWidth, tooltipX]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <div
          ref={containerRef}
          className="flex gap-[1px] rounded overflow-hidden"
          style={{ height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
        >
          {normalizedData.map((point, index) => (
            <UptimeBarSegment
              key={point.timestamp || point.date}
              data={point}
              granularity={resolvedGranularity}
              height={height}
              isFirst={index === 0}
              isLast={index === normalizedData.length - 1}
              isActive={activeIndex === index}
              segmentRef={(node) => {
                segmentRefs.current[index] = node;
              }}
              index={index}
            />
          ))}
        </div>
        {showTooltip && activeIndex !== null && clampedTooltipX !== null && normalizedData[activeIndex] && (
          <div
            ref={tooltipRef}
            className="pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2"
            style={{ left: clampedTooltipX }}
          >
            <UptimeBarTooltipContent
              data={normalizedData[activeIndex]}
              granularity={resolvedGranularity}
            />
          </div>
        )}
      </div>

      {showLegend && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rangeMetadata.visibleRange > 0
              ? formatUptimeAgoLabel(rangeMetadata.visibleRange, resolvedGranularity)
              : "No data"}
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
          <span>{getUptimeCurrentLabel(resolvedGranularity)}</span>
        </div>
      )}
    </div>
  );
}

interface UptimeBarSegmentProps {
  data: UptimeDataPoint;
  granularity: UptimeGranularity;
  height: number;
  isFirst: boolean;
  isLast: boolean;
  isActive: boolean;
  index: number;
  segmentRef?: (node: HTMLDivElement | null) => void;
}

const severityColors: Record<IncidentSeverity, string> = {
  minor: "text-[var(--status-warning-solid)]",
  major: "text-[var(--status-warning-text)]",
  critical: "text-[var(--status-error-solid)]",
};

function UptimeBarSegment({
  data,
  granularity: _granularity,
  height,
  isFirst,
  isLast,
  isActive,
  index,
  segmentRef,
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
      ref={segmentRef}
      data-uptime-index={index}
      className={cn(
        "relative flex-1 min-w-[2px] transition-[opacity,box-shadow] flex flex-col-reverse overflow-hidden",
        isFirst && "rounded-l",
        isLast && "rounded-r",
        hasIncidents && "ring-1 ring-inset ring-[var(--status-error-solid)]/50",
        isActive && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]"
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
      ref={segmentRef}
      data-uptime-index={index}
      className={cn(
        "relative flex-1 min-w-[2px] transition-[opacity,box-shadow]",
        statusColors[solidStatus],
        isFirst && "rounded-l",
        isLast && "rounded-r",
        isActive && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]"
      )}
      style={{ height }}
    />
  );

  return segment;
}

function formatTimestamp(dateStr: string, granularity: UptimeGranularity) {
  const date = new Date(dateStr);

  if (granularity === "day") {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (granularity === "hour") {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function UptimeBarTooltipContent({
  data,
  granularity,
}: {
  data: UptimeDataPoint;
  granularity: UptimeGranularity;
}) {
  const hasIncidents = data.incidents && data.incidents.length > 0;
  const { successCount = 0, degradedCount = 0, failureCount = 0, totalCount = 0 } = data;
  const displayTimestamp = data.timestamp || data.date;

  return (
    <div className="max-w-xs rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="space-y-2">
        <div className="font-medium">{formatTimestamp(displayTimestamp, granularity)}</div>
        {data.uptimePercentage !== null ? (
          <>
            <div className="text-sm">Uptime: {data.uptimePercentage.toFixed(2)}%</div>
            {data.totalCount !== undefined && data.totalCount > 0 && (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex h-2 w-full overflow-hidden rounded">
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
                <div className="space-y-0.5">
                  <div>{successCount} successful</div>
                  {degradedCount > 0 && (
                    <div className="text-[var(--status-warning-solid)]">
                      {degradedCount} degraded (slow)
                    </div>
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
          <div className="border-t border-border/50 pt-1">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Known Incident{data.incidents!.length > 1 ? "s" : ""}:
            </div>
            {data.incidents!.map((incident) => (
              <div key={incident.id} className="flex items-center gap-1 text-xs">
                <span className={cn("font-medium", severityColors[incident.severity])}>
                  [{incident.severity}]
                </span>
                <span className="truncate">{incident.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
