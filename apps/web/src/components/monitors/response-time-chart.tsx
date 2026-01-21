"use client";

import { useMemo, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, cn } from "@uni-status/ui";

export interface ResponseTimeDataPoint {
  timestamp: string;
  avg: number | null;
  min?: number | null;
  max?: number | null;
  p50?: number | null;
  p90?: number | null;
  p99?: number | null;
  status?: "success" | "degraded" | "down" | "incident";
}

export interface IncidentPeriod {
  startTime: string;
  endTime: string;
  type: "degraded" | "down" | "incident" | "maintenance";
  label?: string;
}

export interface TooltipMetricsConfig {
  avg?: boolean;
  min?: boolean;
  max?: boolean;
  p50?: boolean;
  p90?: boolean;
  p99?: boolean;
}

export interface ResponseTimeChartProps {
  data: ResponseTimeDataPoint[];
  incidents?: IncidentPeriod[];
  degradedThreshold?: number;
  showPercentiles?: boolean;
  height?: number;
  className?: string;
  title?: string;
  tooltipMetrics?: TooltipMetricsConfig;
}

const COLORS = {
  // Main line - vibrant green
  primary: "#10b981", // emerald-500
  primaryFill: "rgba(16, 185, 129, 0.15)",
  // Status regions
  degraded: "rgba(251, 191, 36, 0.2)", // amber with transparency
  down: "rgba(239, 68, 68, 0.2)", // red with transparency
  incident: "rgba(168, 85, 247, 0.2)", // purple with transparency
  maintenance: "rgba(59, 130, 246, 0.15)", // blue with transparency
  // Grid and axis
  grid: "#e5e7eb",
  axis: "#9ca3af",
  text: "#6b7280",
};

export function ResponseTimeChart({
  data,
  incidents = [],
  degradedThreshold,
  height = 300,
  className,
  title,
  tooltipMetrics = { avg: true },
}: ResponseTimeChartProps) {
  // State to track hovered time for tooltip
  const [hoverTime, setHoverTime] = useState<Date | null>(null);

  // Get time range for interpolation and smart formatting
  const timeRange = useMemo(() => {
    if (data.length < 2) return null;
    const startTime = new Date(data[0].timestamp).getTime();
    const endTime = new Date(data[data.length - 1].timestamp).getTime();
    const spanHours = (endTime - startTime) / (1000 * 60 * 60);
    return { start: startTime, end: endTime, spanHours };
  }, [data]);

  // Smart time formatter based on data span
  const smartFormatTime = useMemo(() => {
    return (timestamp: string): string => {
      const date = new Date(timestamp);
      const spanHours = timeRange?.spanHours ?? 24;

      // For very short spans (< 2 hours), show HH:MM
      if (spanHours <= 2) {
        return date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      // For short spans (< 6 hours), show HH:MM
      if (spanHours <= 6) {
        return date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      // For medium spans (< 24 hours), show HH:MM
      if (spanHours <= 24) {
        return date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      // For longer spans (1-7 days), show day and time
      if (spanHours <= 168) {
        return date.toLocaleDateString(undefined, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).replace(",", "");
      }
      // For very long spans (> 7 days), show date
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    };
  }, [timeRange?.spanHours]);

  // Transform data to simple format that Recharts expects
  const chartData = useMemo(() => {
    return data.map((point) => ({
      time: smartFormatTime(point.timestamp),
      fullTime: point.timestamp,
      avg: point.avg,
      min: point.min,
      max: point.max,
      p50: point.p50,
      p90: point.p90,
      p99: point.p99,
      status: point.status ?? "success",
    }));
  }, [data, smartFormatTime]);

  // Calculate tick interval to show ~8-12 labels while keeping all grid lines
  const tickInterval = useMemo(() => {
    const dataLength = chartData.length;
    if (dataLength <= 12) return 0; // Show all ticks
    // Target ~10 labels
    return Math.floor(dataLength / 10);
  }, [chartData.length]);

  // Handle mouse move to show the actual data point time (not interpolated)
  const handleMouseMove = useCallback((state: {
    activeTooltipIndex?: number;
    chartX?: number;
    chartY?: number;
    activeCoordinate?: { x: number; y: number };
  }) => {
    if (chartData.length === 0) {
      return;
    }

    const index = state.activeTooltipIndex;
    if (index !== undefined && index >= 0 && index < chartData.length) {
      // Use the actual timestamp from the data point being hovered
      // This ensures the hover time matches the recorded data point time
      const currentPoint = chartData[index];
      const currentTime = new Date(currentPoint.fullTime).getTime();
      setHoverTime(new Date(currentTime));
    }
  }, [chartData]);

  const handleMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  // Calculate Y-axis domain based on avg values
  const yDomain = useMemo(() => {
    const avgValues = data
      .map((point) => point.avg)
      .filter((v): v is number => v != null);

    if (avgValues.length === 0) {
      return [0, 100] as [number, number];
    }

    const maxAvg = Math.max(...avgValues);
    return [0, Math.ceil(maxAvg * 1.2)] as [number, number];
  }, [data]);

  // Find time indices for incident periods
  const incidentAreas = useMemo(() => {
    if (incidents.length === 0 || chartData.length === 0) return [];

    return incidents.map((incident) => {
      const startIdx = chartData.findIndex(
        (d) => new Date(d.fullTime) >= new Date(incident.startTime)
      );
      const endIdx = chartData.findIndex(
        (d) => new Date(d.fullTime) >= new Date(incident.endTime)
      );

      return {
        ...incident,
        x1: startIdx >= 0 ? chartData[startIdx].time : chartData[0].time,
        x2: endIdx >= 0 ? chartData[endIdx].time : chartData[chartData.length - 1].time,
      };
    });
  }, [incidents, chartData]);

  // Detect degraded periods from threshold
  const degradedAreas = useMemo(() => {
    if (!degradedThreshold || chartData.length === 0) return [];

    const areas: { x1: string; x2: string }[] = [];
    let inDegraded = false;
    let startIdx = 0;

    chartData.forEach((point, idx) => {
      const isDegraded = point.avg !== null && point.avg > degradedThreshold;

      if (isDegraded && !inDegraded) {
        inDegraded = true;
        startIdx = idx;
      } else if (!isDegraded && inDegraded) {
        inDegraded = false;
        areas.push({
          x1: chartData[startIdx].time,
          x2: chartData[idx - 1].time,
        });
      }
    });

    // Handle case where degraded extends to end
    if (inDegraded) {
      areas.push({
        x1: chartData[startIdx].time,
        x2: chartData[chartData.length - 1].time,
      });
    }

    return areas;
  }, [chartData, degradedThreshold]);

  if (chartData.length === 0) {
    return (
      <Card className={className}>
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className={cn(!title && "pt-4")}>
          <div className="flex items-center justify-center" style={{ height }}>
            <p className="text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(!title && "pt-4")}>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={COLORS.grid}
              vertical={true}
              horizontal={true}
            />

            <XAxis
              dataKey="time"
              tick={{ fill: COLORS.text, fontSize: 11 }}
              tickLine={{ stroke: COLORS.grid }}
              axisLine={{ stroke: COLORS.grid }}
              interval={tickInterval}
              angle={chartData.length > 20 ? -45 : 0}
              textAnchor={chartData.length > 20 ? "end" : "middle"}
              height={chartData.length > 20 ? 60 : 30}
            />

            <YAxis
              domain={yDomain}
              tick={{ fill: COLORS.text, fontSize: 11 }}
              tickLine={{ stroke: COLORS.grid }}
              axisLine={{ stroke: COLORS.grid }}
              tickFormatter={(value) => `${value}ms`}
              width={55}
              tickCount={8}
            />

            <Tooltip content={<CustomTooltip metrics={tooltipMetrics} hoverTime={hoverTime} />} />

            {/* Incident periods - render as background areas */}
            {incidentAreas.map((area, idx) => (
              <ReferenceArea
                key={`incident-${idx}`}
                x1={area.x1}
                x2={area.x2}
                fill={
                  area.type === "down"
                    ? COLORS.down
                    : area.type === "incident"
                    ? COLORS.incident
                    : area.type === "maintenance"
                    ? COLORS.maintenance
                    : COLORS.degraded
                }
                fillOpacity={1}
              />
            ))}

            {/* Auto-detected degraded periods */}
            {degradedAreas.map((area, idx) => (
              <ReferenceArea
                key={`degraded-${idx}`}
                x1={area.x1}
                x2={area.x2}
                fill={COLORS.degraded}
                fillOpacity={1}
              />
            ))}

            {/* Main response time area */}
            <Area
              type="monotone"
              dataKey="avg"
              stroke={COLORS.primary}
              strokeWidth={2.5}
              fill="url(#colorAvg)"
              name="Response Time"
              connectNulls
              dot={false}
              activeDot={{
                r: 6,
                fill: COLORS.primary,
                stroke: "#fff",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({
  active,
  payload,
  metrics = { avg: true },
  hoverTime,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: {
      status?: string;
      fullTime?: string;
      avg?: number | null;
      min?: number | null;
      max?: number | null;
      p50?: number | null;
      p90?: number | null;
      p99?: number | null;
    };
  }>;
  label?: string;
  metrics?: TooltipMetricsConfig;
  hoverTime?: Date | null;
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const status = data.status;

  // Build metrics to display based on configuration
  const metricsToShow: Array<{ label: string; value: number }> = [];
  if (metrics.avg && data.avg != null) {
    metricsToShow.push({ label: "Avg", value: data.avg });
  }
  if (metrics.min && data.min != null) {
    metricsToShow.push({ label: "Min", value: data.min });
  }
  if (metrics.max && data.max != null) {
    metricsToShow.push({ label: "Max", value: data.max });
  }
  if (metrics.p50 && data.p50 != null) {
    metricsToShow.push({ label: "P50", value: data.p50 });
  }
  if (metrics.p90 && data.p90 != null) {
    metricsToShow.push({ label: "P90", value: data.p90 });
  }
  if (metrics.p99 && data.p99 != null) {
    metricsToShow.push({ label: "P99", value: data.p99 });
  }

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    success: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    degraded: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    down: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    incident: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  };

  const statusLabels: Record<string, string> = {
    success: "Healthy",
    degraded: "Degraded",
    down: "Down",
    incident: "Incident",
  };

  const dataTime = data.fullTime ? new Date(data.fullTime) : null;
  const displayTime = hoverTime ?? dataTime;
  const statusStyle = statusColors[status || "success"];

  // Format relative time for clarity - smart rounding based on age
  const getRelativeTime = (d: Date | null): string => {
    if (!d) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) {
      const mins = diffMins % 60;
      return mins > 0 ? `${diffHours}h ${mins}m ago` : `${diffHours}h ago`;
    }
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  };

  // Format time based on data granularity - show appropriate precision
  const formatHoverTime = (d: Date): string => {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };



  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden min-w-[220px]">
      {/* Header with hover time */}
      <div className="px-3 py-2 border-b bg-muted/30">
        {/* Show the time position being hovered */}
        {displayTime && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              {displayTime.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric"
              })}
            </p>
            <span className="text-sm font-mono font-semibold text-foreground">
              {formatHoverTime(displayTime)}
            </span>
          </div>
        )}
        {/* Show relative time from now */}
        {displayTime && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {getRelativeTime(displayTime)}
          </p>
        )}
      </div>


      {/* Metrics */}
      <div className="px-3 py-2 space-y-1">
        {metricsToShow.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{metric.label}</span>
            <span className="text-sm font-semibold" style={{ color: COLORS.primary }}>
              {Math.round(metric.value)}ms
            </span>
          </div>
        ))}

        {metricsToShow.length === 0 && (
          <div className="text-xs text-muted-foreground">No data</div>
        )}

        {/* Status badge */}
        {status && (
          <div className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border mt-1",
            statusStyle.bg,
            statusStyle.text,
            statusStyle.border
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full mr-1.5",
              status === "success" ? "bg-emerald-500" :
              status === "degraded" ? "bg-amber-500" :
              status === "down" ? "bg-red-500" : "bg-purple-500"
            )} />
            {statusLabels[status]}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeDetailed(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Stats display component
export interface ResponseTimeStatsProps {
  avg: number | null;
  min?: number | null;
  max?: number | null;
  p50?: number | null;
  p90?: number | null;
  p99?: number | null;
  className?: string;
}

export function ResponseTimeStats({
  avg,
  min,
  max,
  p50,
  p90,
  p99,
  className,
}: ResponseTimeStatsProps) {
  const stats = [
    { label: "Avg", value: avg },
    { label: "Min", value: min },
    { label: "Max", value: max },
    { label: "P50", value: p50 },
    { label: "P90", value: p90 },
    { label: "P99", value: p99 },
  ].filter((s) => s.value !== undefined);

  return (
    <div className={cn("grid grid-cols-3 gap-4 sm:grid-cols-6", className)}>
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="text-xs text-muted-foreground">{stat.label}</div>
          <div className="text-sm font-medium">
            {stat.value != null ? `${Math.round(stat.value)}ms` : "--"}
          </div>
        </div>
      ))}
    </div>
  );
}

// Compact response time display
export interface ResponseTimeCompactProps {
  value: number | null;
  threshold?: number;
  className?: string;
}

export function ResponseTimeCompact({
  value,
  threshold = 1000,
  className,
}: ResponseTimeCompactProps) {
  if (value === null) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>--</span>
    );
  }

  const getColor = (ms: number) => {
    if (ms < threshold * 0.5) return "text-green-600";
    if (ms < threshold) return "text-yellow-500";
    return "text-red-500";
  };

  const formatValue = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <span className={cn("text-sm font-medium", getColor(value), className)}>
      {formatValue(value)}
    </span>
  );
}
