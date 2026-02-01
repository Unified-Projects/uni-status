"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  ExternalLink,
  Pencil,
  CheckCircle,
  Bell,
  BellOff,
  Clock,
  Activity,
  CalendarDays,
  Download,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@uni-status/ui";
import {
  EventTypeBadge,
  EventSeverityBadge,
  EventStatusBadge,
  EventIndicator,
} from "./event-badges";
import { EventTimelineCompact } from "./event-timeline";
import type { UnifiedEvent, EventType, IncidentSeverity, IncidentStatus, MaintenanceStatus } from "@uni-status/shared";

export interface EventCardProps {
  event: UnifiedEvent;
  onUpdate?: () => void;
  onResolve?: () => void;
  onEdit?: () => void;
  onSubscribe?: () => void;
  onUnsubscribe?: () => void;
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function EventCard({
  event,
  onUpdate,
  onResolve,
  onEdit,
  onSubscribe,
  onUnsubscribe,
  showActions = true,
  variant = "default",
  className,
}: EventCardProps) {
  const isResolved =
    event.type === "incident"
      ? event.status === "resolved"
      : event.status === "completed";
  const isActive =
    event.type === "maintenance"
      ? event.status === "active"
      : event.status !== "resolved";
  const duration = calculateDuration(event.startedAt, event.endedAt);

  if (variant === "compact") {
    return <EventCardCompact event={event} className={className} />;
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <EventIndicator
              type={event.type}
              severity={event.severity as IncidentSeverity | "maintenance"}
              pulse={isActive}
            />
            <Link
              href={`/events/${event.type}/${event.id}`}
              className="font-medium truncate hover:underline"
            >
              {event.title}
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.type === "incident" && (
              <EventSeverityBadge
                severity={event.severity as IncidentSeverity | "maintenance"}
                size="sm"
              />
            )}
            {showActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/events/${event.type}/${event.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {event.type === "incident" && onUpdate && !isResolved && (
                    <DropdownMenuItem onClick={onUpdate}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Post Update
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onEdit && (event.type === "maintenance" || !isResolved) && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {event.type === "incident" && onResolve && !isResolved && (
                    <DropdownMenuItem onClick={onResolve} className="text-green-600">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Resolve
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {event.isSubscribed ? (
                    onUnsubscribe && (
                      <DropdownMenuItem onClick={onUnsubscribe}>
                        <BellOff className="mr-2 h-4 w-4" />
                        Unsubscribe
                      </DropdownMenuItem>
                    )
                  ) : (
                    onSubscribe && (
                      <DropdownMenuItem onClick={onSubscribe}>
                        <Bell className="mr-2 h-4 w-4" />
                        Subscribe
                      </DropdownMenuItem>
                    )
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={`/api/v1/events/${event.type}/${event.id}/export?format=ics`}>
                      <Download className="mr-2 h-4 w-4" />
                      Export to Calendar
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <EventTypeBadge type={event.type} size="sm" />
          <EventStatusBadge
            type={event.type}
            status={event.status as IncidentStatus | MaintenanceStatus}
            size="sm"
          />
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {duration}
          </div>
        </div>

        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}

        {event.type === "maintenance" && event.startedAt && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>
              {formatDateRange(event.startedAt, event.endedAt, event.timezone)}
            </span>
          </div>
        )}

        {event.affectedMonitorDetails && event.affectedMonitorDetails.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap gap-1">
              {event.affectedMonitorDetails.slice(0, 3).map((monitor) => (
                <span
                  key={monitor.id}
                  className="text-xs bg-muted px-1.5 py-0.5 rounded"
                >
                  {monitor.name}
                </span>
              ))}
              {event.affectedMonitorDetails.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{event.affectedMonitorDetails.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {event.type === "incident" && event.updates && event.updates.length > 0 && (
          <div className="pt-2 border-t">
            <EventTimelineCompact updates={event.updates} maxItems={2} />
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span>Created {formatRelativeTime(event.createdAt)}</span>
          <div className="flex items-center gap-2">
            {event.subscriberCount !== undefined && event.subscriberCount > 0 && (
              <span className="flex items-center gap-1">
                <Bell className="h-3 w-3" />
                {event.subscriberCount}
              </span>
            )}
            {isResolved && event.endedAt && (
              <span className="text-green-600">
                {event.type === "incident" ? "Resolved" : "Completed"}{" "}
                {formatRelativeTime(event.endedAt)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Compact variant for lists
function EventCardCompact({
  event,
  className,
}: {
  event: UnifiedEvent;
  className?: string;
}) {
  const isResolved =
    event.type === "incident"
      ? event.status === "resolved"
      : event.status === "completed";
  const isActive =
    event.type === "maintenance"
      ? event.status === "active"
      : event.status !== "resolved";
  const duration = calculateDuration(event.startedAt, event.endedAt);

  return (
    <Link
      href={`/events/${event.type}/${event.id}`}
      className={cn(
        "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <EventIndicator
        type={event.type}
        severity={event.severity as IncidentSeverity | "maintenance"}
        size="lg"
        pulse={isActive}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{event.title}</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatRelativeTime(event.startedAt)}</span>
          <span>-</span>
          <span>{duration}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <EventTypeBadge type={event.type} size="sm" showLabel={false} />
        <EventStatusBadge
          type={event.type}
          status={event.status as IncidentStatus | MaintenanceStatus}
          size="sm"
        />
        {event.type === "incident" && (
          <EventSeverityBadge
            severity={event.severity as IncidentSeverity | "maintenance"}
            size="sm"
          />
        )}
      </div>
    </Link>
  );
}

// Helper functions
function calculateDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ${endedAt ? "duration" : "ongoing"}`;
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return `${diffHours}h ${mins > 0 ? `${mins}m` : ""} ${endedAt ? "duration" : "ongoing"}`;
  }
  const hours = diffHours % 24;
  return `${diffDays}d ${hours > 0 ? `${hours}h` : ""} ${endedAt ? "duration" : "ongoing"}`;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Handle future dates for scheduled maintenance
  if (diffMs < 0) {
    const absDiffMs = Math.abs(diffMs);
    const absDiffMins = Math.floor(absDiffMs / (1000 * 60));
    const absDiffHours = Math.floor(absDiffMins / 60);
    const absDiffDays = Math.floor(absDiffHours / 24);

    if (absDiffMins < 60) return `in ${absDiffMins}m`;
    if (absDiffHours < 24) return `in ${absDiffHours}h`;
    if (absDiffDays < 7) return `in ${absDiffDays}d`;
    return date.toLocaleDateString();
  }

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatDateRange(startsAt: string, endsAt: string | null, timezone?: string): string {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const tz = timezone || "Europe/London";
  const sameDay = end && start.toDateString() === end.toDateString();

  const dateOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  };

  if (!end) {
    return start.toLocaleDateString(undefined, dateOptions);
  }

  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOptions)} - ${end.toLocaleTimeString(undefined, timeOptions)}`;
  }

  return `${start.toLocaleDateString(undefined, dateOptions)} - ${end.toLocaleDateString(undefined, dateOptions)}`;
}
