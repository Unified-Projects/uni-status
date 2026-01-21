"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Calendar, Activity } from "lucide-react";
import { cn, Badge } from "@uni-status/ui";
import type { UnifiedEvent } from "@uni-status/shared";
import { useTimezone } from "@/contexts/timezone-context";
import {
  eventStatusConfig as baseEventStatusConfig,
  severityConfig as baseSeverityConfig,
} from "@/lib/status-colors";

interface PublicEventTimelineProps {
  events: UnifiedEvent[];
  slug: string;
  basePath?: string;
}

// Build status config from centralized colors
const statusConfig = Object.fromEntries(
  Object.entries(baseEventStatusConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      icon: config.icon,
      dotClass: config.colors.solid,
      lineClass: config.colors.border,
    },
  ])
) as Record<
  string,
  {
    label: string;
    icon: typeof baseEventStatusConfig.investigating.icon;
    dotClass: string;
    lineClass: string;
  }
>;

// Build severity config from centralized colors
const severityConfig = Object.fromEntries(
  Object.entries(baseSeverityConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      className: `${config.colors.bg} ${config.colors.text}`,
    },
  ])
) as Record<string, { label: string; className: string }>;

function createFormatDate(timezone: string) {
  return function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };
}

function createFormatTime(timezone: string) {
  return function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };
}

function createFormatRelativeTime(timezone: string) {
  const formatTime = createFormatTime(timezone);
  return function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 0) {
      // Future date
      const futureMins = Math.abs(diffMins);
      const futureHours = Math.abs(diffHours);
      const futureDays = Math.abs(diffDays);

      if (futureMins < 60) return `in ${futureMins}m`;
      if (futureHours < 24) return `in ${futureHours}h`;
      if (futureDays < 7) return `in ${futureDays}d`;
      return formatTime(dateStr);
    }

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatTime(dateStr);
  };
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

interface GroupedEvents {
  date: Date;
  dateStr: string;
  events: UnifiedEvent[];
}

export function PublicEventTimeline({ events, slug, basePath }: PublicEventTimelineProps) {
  const { resolvedTimezone } = useTimezone();
  // Use basePath for links (empty string on custom domains, /status/{slug} on main domain)
  const linkBase = basePath ?? `/status/${slug}`;

  // Create timezone-aware formatting functions
  const formatDate = createFormatDate(resolvedTimezone);
  const formatRelativeTime = createFormatRelativeTime(resolvedTimezone);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: GroupedEvents[] = [];

    for (const event of events) {
      const eventDate = new Date(event.startedAt);

      const existingGroup = groups.find((g) => isSameDay(g.date, eventDate));
      if (existingGroup) {
        existingGroup.events.push(event);
      } else {
        groups.push({
          date: eventDate,
          dateStr: formatDate(event.startedAt),
          events: [event],
        });
      }
    }

    // Sort groups by date (newest first)
    groups.sort((a, b) => b.date.getTime() - a.date.getTime());

    return groups;
  }, [events, formatDate]);

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {groupedEvents.map((group, groupIndex) => {
        const isToday = isSameDay(group.date, new Date());
        const isYesterday = isSameDay(
          group.date,
          new Date(Date.now() - 86400000)
        );

        return (
          <div key={group.dateStr}>
            {/* Date header */}
            <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[var(--status-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--status-bg)]/60">
              <h2 className="text-sm font-semibold text-[var(--status-muted-text)]">
                {isToday ? "Today" : isYesterday ? "Yesterday" : group.dateStr}
              </h2>
            </div>

            {/* Events for this date */}
            <div className="relative mt-4">
              {/* Vertical line */}
              <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-[var(--status-border)]" />

              <div className="space-y-6">
                {group.events.map((event, eventIndex) => {
                  const config = statusConfig[event.status] || statusConfig.investigating;
                  const severity = severityConfig[event.severity] || severityConfig.minor;
                  const Icon = config.icon;
                  const isIncident = event.type === "incident";
                  const isLast =
                    groupIndex === groupedEvents.length - 1 &&
                    eventIndex === group.events.length - 1;

                  return (
                    <div key={`${event.type}-${event.id}`} className="relative pl-8">
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          "absolute left-0 top-1 h-5 w-5 rounded-full flex items-center justify-center",
                          config.dotClass
                        )}
                      >
                        {isIncident ? (
                          <AlertTriangle className="h-3 w-3 text-[hsl(var(--background))]" />
                        ) : (
                          <Calendar className="h-3 w-3 text-[hsl(var(--background))]" />
                        )}
                      </div>

                      {/* Event card */}
                      <Link
                        href={`${linkBase}/events/${event.type}/${event.id}`}
                        className="block group"
                      >
                        <div className="rounded-lg border bg-[var(--status-card)] p-4 transition-colors group-hover:bg-[var(--status-muted)]/50">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium group-hover:text-primary transition-colors">
                                {event.title}
                              </span>
                              <Badge className={cn("text-xs", severity.className)}>
                                {isIncident ? severity.label : "Maintenance"}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {config.label}
                              </Badge>
                            </div>
                            <span className="text-xs text-[var(--status-muted-text)] shrink-0">
                              {formatRelativeTime(event.startedAt)}
                            </span>
                          </div>

                          {/* Description */}
                          {event.description && (
                            <p className="mt-2 text-sm text-[var(--status-muted-text)] line-clamp-2">
                              {event.description}
                            </p>
                          )}

                          {/* Affected services */}
                          {event.affectedMonitorDetails &&
                            event.affectedMonitorDetails.length > 0 && (
                              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--status-muted-text)]">
                                <Activity className="h-3.5 w-3.5" />
                                <span>
                                  Affecting:{" "}
                                  {event.affectedMonitorDetails
                                    .slice(0, 3)
                                    .map((m) => m.name)
                                    .join(", ")}
                                  {event.affectedMonitorDetails.length > 3 &&
                                    ` +${event.affectedMonitorDetails.length - 3} more`}
                                </span>
                              </div>
                            )}

                          {/* Latest update preview */}
                          {event.updates && event.updates.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="text-xs text-[var(--status-muted-text)]">
                                Latest update:{" "}
                                <span className="text-[var(--status-text)]">
                                  {event.updates[0].message.length > 100
                                    ? event.updates[0].message.slice(0, 100) + "..."
                                    : event.updates[0].message}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
