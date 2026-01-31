"use client";

import { cn } from "@uni-status/ui";
import { Search, AlertCircle, Eye, CheckCircle, Clock } from "lucide-react";
import type { IncidentUpdate } from "@/lib/api-client";
import type { IncidentStatus } from "./severity-badge";

const statusConfig: Record<
  IncidentStatus,
  {
    icon: typeof Search;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  investigating: {
    icon: Search,
    color: "text-[var(--status-warning-text)]",
    bgColor: "bg-[var(--status-warning-bg)]",
    borderColor: "border-[var(--status-warning-border)]",
    label: "Investigating",
  },
  identified: {
    icon: AlertCircle,
    color: "text-[var(--status-error-text)]",
    bgColor: "bg-[var(--status-error-bg)]",
    borderColor: "border-[var(--status-error-border)]",
    label: "Identified",
  },
  monitoring: {
    icon: Eye,
    color: "text-[var(--status-info-text)]",
    bgColor: "bg-[var(--status-info-bg)]",
    borderColor: "border-[var(--status-info-border)]",
    label: "Monitoring",
  },
  resolved: {
    icon: CheckCircle,
    color: "text-[var(--status-success-text)]",
    bgColor: "bg-[var(--status-success-bg)]",
    borderColor: "border-[var(--status-success-border)]",
    label: "Resolved",
  },
};

export interface IncidentTimelineProps {
  updates: IncidentUpdate[];
  incidentStartedAt: string;
  incidentTitle?: string;
  className?: string;
}

export function IncidentTimeline({
  updates,
  incidentStartedAt,
  incidentTitle,
  className,
}: IncidentTimelineProps) {
  // Sort updates by creation time, newest first
  const sortedUpdates = [...updates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className={cn("relative", className)}>
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />

      <div className="space-y-6">
        {sortedUpdates.map((update, index) => {
          const config = statusConfig[update.status as IncidentStatus] || statusConfig.investigating;
          const Icon = config.icon;
          const isLatest = index === 0;

          return (
            <div key={update.id} className="relative flex gap-4">
              {/* Icon */}
              <div
                className={cn(
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
                  config.bgColor,
                  config.borderColor
                )}
              >
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("font-semibold", config.color)}>
                    {config.label}
                  </span>
                  {isLatest && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      Latest
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(update.createdAt)}
                </p>
                <p className="mt-2 text-sm whitespace-pre-wrap">{update.message}</p>
              </div>
            </div>
          );
        })}

        {/* Initial incident created */}
        <div className="relative flex gap-4">
          <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-gray-100 border-gray-300">
            <Clock className="h-4 w-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-gray-600">Incident Created</span>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(incidentStartedAt)}
            </p>
            {incidentTitle && (
              <p className="mt-2 text-sm">{incidentTitle}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact timeline for preview/cards
export interface IncidentTimelineCompactProps {
  updates: IncidentUpdate[];
  maxItems?: number;
  className?: string;
}

export function IncidentTimelineCompact({
  updates,
  maxItems = 3,
  className,
}: IncidentTimelineCompactProps) {
  const sortedUpdates = [...updates]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, maxItems);

  if (sortedUpdates.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No updates yet
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {sortedUpdates.map((update) => {
        const config = statusConfig[update.status as IncidentStatus] || statusConfig.investigating;

        return (
          <div key={update.id} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-1.5 h-2 w-2 rounded-full shrink-0",
                config.color.replace("text-", "bg-")
              )}
            />
            <div className="flex-1 min-w-0">
              <span className={cn("font-medium", config.color)}>
                {config.label}
              </span>
              <span className="mx-1 text-muted-foreground">-</span>
              <span className="text-muted-foreground truncate">
                {formatRelativeTime(update.createdAt)}
              </span>
            </div>
          </div>
        );
      })}
      {updates.length > maxItems && (
        <p className="text-xs text-muted-foreground">
          +{updates.length - maxItems} more update{updates.length - maxItems > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// Helper to format date/time
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDateTime(dateString);
}
