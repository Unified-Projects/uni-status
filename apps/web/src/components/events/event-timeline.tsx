"use client";

import { cn } from "@uni-status/ui";
import {
  Search,
  AlertCircle,
  Eye,
  CheckCircle,
  Clock,
  CalendarDays,
  Play,
  Wrench,
} from "lucide-react";
import type { EventUpdate, EventType, IncidentStatus, MaintenanceStatus } from "@uni-status/shared";

const incidentStatusConfig: Record<
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
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    borderColor: "border-yellow-400",
    label: "Investigating",
  },
  identified: {
    icon: AlertCircle,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    borderColor: "border-orange-400",
    label: "Identified",
  },
  monitoring: {
    icon: Eye,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    borderColor: "border-blue-400",
    label: "Monitoring",
  },
  resolved: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100",
    borderColor: "border-green-400",
    label: "Resolved",
  },
};

const maintenanceStatusConfig: Record<
  MaintenanceStatus,
  {
    icon: typeof Clock;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  scheduled: {
    icon: CalendarDays,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    borderColor: "border-blue-400",
    label: "Scheduled",
  },
  active: {
    icon: Play,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    borderColor: "border-yellow-400",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100",
    borderColor: "border-green-400",
    label: "Completed",
  },
};

export interface EventTimelineProps {
  type: EventType;
  updates: EventUpdate[];
  eventStartedAt: string;
  eventTitle?: string;
  className?: string;
}

export function EventTimeline({
  type,
  updates,
  eventStartedAt,
  eventTitle,
  className,
}: EventTimelineProps) {
  // Sort updates by creation time, newest first
  const sortedUpdates = [...updates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const getStatusConfig = (status: string) => {
    if (type === "incident") {
      return incidentStatusConfig[status as IncidentStatus] || incidentStatusConfig.investigating;
    }
    return maintenanceStatusConfig[status as MaintenanceStatus] || maintenanceStatusConfig.scheduled;
  };

  return (
    <div className={cn("relative", className)}>
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />

      <div className="space-y-6">
        {sortedUpdates.map((update, index) => {
          const config = getStatusConfig(update.status);
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
                  {update.createdBy && (
                    <span className="ml-2">by {update.createdBy.name}</span>
                  )}
                </p>
                <p className="mt-2 text-sm whitespace-pre-wrap">{update.message}</p>
              </div>
            </div>
          );
        })}

        {/* Initial event created */}
        <div className="relative flex gap-4">
          <div
            className={cn(
              "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
              type === "incident"
                ? "bg-gray-100 border-gray-300"
                : "bg-blue-100 border-blue-300"
            )}
          >
            {type === "incident" ? (
              <Clock className="h-4 w-4 text-gray-600" />
            ) : (
              <Wrench className="h-4 w-4 text-blue-600" />
            )}
          </div>
          <div className="flex-1">
            <span
              className={cn(
                "font-semibold",
                type === "incident" ? "text-gray-600" : "text-blue-600"
              )}
            >
              {type === "incident" ? "Incident Created" : "Maintenance Scheduled"}
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(eventStartedAt)}
            </p>
            {eventTitle && <p className="mt-2 text-sm">{eventTitle}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact timeline for preview/cards
export interface EventTimelineCompactProps {
  updates: EventUpdate[];
  type?: EventType;
  maxItems?: number;
  className?: string;
}

export function EventTimelineCompact({
  updates,
  type = "incident",
  maxItems = 3,
  className,
}: EventTimelineCompactProps) {
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

  const getStatusConfig = (status: string) => {
    if (type === "incident") {
      return incidentStatusConfig[status as IncidentStatus] || incidentStatusConfig.investigating;
    }
    return maintenanceStatusConfig[status as MaintenanceStatus] || maintenanceStatusConfig.scheduled;
  };

  return (
    <div className={cn("space-y-2", className)}>
      {sortedUpdates.map((update) => {
        const config = getStatusConfig(update.status);

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

// Full events feed timeline (showing multiple events)
export interface EventsFeedTimelineProps {
  events: Array<{
    id: string;
    type: EventType;
    title: string;
    status: string;
    severity: string;
    startedAt: string;
    endedAt: string | null;
  }>;
  className?: string;
}

export function EventsFeedTimeline({ events, className }: EventsFeedTimelineProps) {
  // Group events by date
  const groupedEvents = events.reduce(
    (acc, event) => {
      const date = new Date(event.startedAt).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, typeof events>
  );

  return (
    <div className={cn("space-y-8", className)}>
      {Object.entries(groupedEvents).map(([date, dateEvents]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 sticky top-0 bg-background py-2">
            {formatDateHeader(date)}
          </h3>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />

            <div className="space-y-4">
              {dateEvents.map((event) => {
                const isIncident = event.type === "incident";
                const color = isIncident
                  ? event.severity === "critical"
                    ? "border-red-400 bg-red-100"
                    : event.severity === "major"
                    ? "border-orange-400 bg-orange-100"
                    : "border-yellow-400 bg-yellow-100"
                  : "border-blue-400 bg-blue-100";

                return (
                  <div key={`${event.type}-${event.id}`} className="relative flex gap-4">
                    <div
                      className={cn(
                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
                        color
                      )}
                    >
                      {isIncident ? (
                        <AlertCircle className="h-4 w-4 text-current" />
                      ) : (
                        <Wrench className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{event.title}</span>
                        <span
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            isIncident ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {event.type}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(event.startedAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper functions
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

function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
