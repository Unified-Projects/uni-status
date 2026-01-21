"use client";

import { cn } from "@uni-status/ui";
import { STATUS_COLORS, type GeoRegion } from "./types";

interface GeoLatencyPopupProps {
  title: string;
  subtitle?: string;
  status: GeoRegion["status"];
  latency: {
    p50: number;
    p95: number;
    p99: number;
  } | null;
  monitorCount: number;
  probeCount?: number;
}

export function GeoLatencyPopup({
  title,
  subtitle,
  status,
  latency,
  monitorCount,
  probeCount = 0,
}: GeoLatencyPopupProps) {
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;

  const statusLabel =
    status === "active"
      ? "Operational"
      : status === "degraded"
      ? "Degraded"
      : status === "down"
      ? "Down"
      : "Pending";

  return (
    <div className="min-w-[220px] p-1">
      {/* Header */}
      <div className="mb-3">
        <div className="font-semibold text-[var(--status-text)] text-base">{title}</div>
        {subtitle && (
          <div className="text-sm text-[var(--status-muted-text)]">{subtitle}</div>
        )}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        <span className="text-sm font-medium">{statusLabel}</span>
      </div>

      {/* Latency metrics */}
      {latency ? (
        <div className="bg-[var(--status-muted)]/50 rounded-lg p-3 mb-3">
          <div className="text-xs text-[var(--status-muted-text)] mb-2 uppercase tracking-wide">
            Response Time
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LatencyMetric label="P50" value={latency.p50} />
            <LatencyMetric label="P95" value={latency.p95} />
            <LatencyMetric label="P99" value={latency.p99} />
          </div>
        </div>
      ) : (
        <div className="bg-[var(--status-muted)]/50 rounded-lg p-3 mb-3 text-center">
          <span className="text-sm text-[var(--status-muted-text)]">
            No latency data available
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-[var(--status-muted-text)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span>{monitorCount} monitor{monitorCount !== 1 ? "s" : ""}</span>
        </div>
        {probeCount > 0 && (
          <div className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-[var(--status-muted-text)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
              />
            </svg>
            <span>{probeCount} probe{probeCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface LatencyMetricProps {
  label: string;
  value: number;
}

function LatencyMetric({ label, value }: LatencyMetricProps) {
  const formattedValue = formatLatency(value);

  return (
    <div className="text-center">
      <div className="text-xs text-[var(--status-muted-text)]">{label}</div>
      <div
        className={cn(
          "font-mono font-semibold text-sm",
          getLatencyColorClass(value)
        )}
      >
        {formattedValue}
      </div>
    </div>
  );
}

function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function getLatencyColorClass(ms: number): string {
  if (ms < 100) {
    return "text-[var(--status-success-text)]";
  }
  if (ms < 300) {
    return "text-[var(--status-warning-text)]";
  }
  if (ms < 1000) {
    return "text-[var(--status-orange-text)]";
  }
  return "text-[var(--status-error-text)]";
}
