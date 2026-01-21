"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  ExternalLink,
  Pencil,
  Trash2,
  StopCircle,
  Clock,
  Activity,
  CalendarDays,
  Repeat,
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
  MaintenanceStatusBadge,
  MaintenanceStatusIndicator,
  type MaintenanceStatus,
} from "./maintenance-status-badge";
import type { MaintenanceWindow, Monitor } from "@/lib/api-client";

export interface MaintenanceCardProps {
  maintenance: MaintenanceWindow & { monitors?: Monitor[] };
  onEdit?: () => void;
  onDelete?: () => void;
  onEndEarly?: () => void;
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function MaintenanceCard({
  maintenance,
  onEdit,
  onDelete,
  onEndEarly,
  showActions = true,
  variant = "default",
  className,
}: MaintenanceCardProps) {
  const status = (maintenance.computedStatus || "scheduled") as MaintenanceStatus;
  const isActive = status === "active";
  const isCompleted = status === "completed";

  if (variant === "compact") {
    return (
      <MaintenanceCardCompact
        maintenance={maintenance}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MaintenanceStatusIndicator
              status={status}
              pulse={isActive}
            />
            <Link
              href={`/maintenance-windows/${maintenance.id}`}
              className="font-medium truncate hover:underline"
            >
              {maintenance.name}
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <MaintenanceStatusBadge status={status} size="sm" />
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
                    <Link href={`/maintenance-windows/${maintenance.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {onEdit && !isCompleted && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onEndEarly && isActive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onEndEarly} className="text-yellow-600">
                        <StopCircle className="mr-2 h-4 w-4" />
                        End Early
                      </DropdownMenuItem>
                    </>
                  )}
                  {onDelete && !isActive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {maintenance.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {maintenance.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{formatDateRange(maintenance.startsAt, maintenance.endsAt, maintenance.timezone)}</span>
          </div>
          {maintenance.recurrence && maintenance.recurrence.type !== "none" && (
            <div className="flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" />
              <span>{formatRecurrence(maintenance.recurrence)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDuration(maintenance.startsAt, maintenance.endsAt)}</span>
        </div>

        {maintenance.affectedMonitors && maintenance.affectedMonitors.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">
                {maintenance.affectedMonitors.length} monitor{maintenance.affectedMonitors.length !== 1 ? "s" : ""} affected
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span>Created {formatRelativeTime(maintenance.createdAt)}</span>
          {maintenance.createdByUser && (
            <span>by {maintenance.createdByUser.name || maintenance.createdByUser.email}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Compact variant for lists
function MaintenanceCardCompact({
  maintenance,
  className,
}: {
  maintenance: MaintenanceWindow;
  className?: string;
}) {
  const status = (maintenance.computedStatus || "scheduled") as MaintenanceStatus;
  const isActive = status === "active";

  return (
    <Link
      href={`/maintenance-windows/${maintenance.id}`}
      className={cn(
        "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <MaintenanceStatusIndicator
        status={status}
        size="lg"
        pulse={isActive}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{maintenance.name}</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatDateRange(maintenance.startsAt, maintenance.endsAt, maintenance.timezone)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">
          {maintenance.affectedMonitors.length} monitors
        </span>
        <MaintenanceStatusBadge status={status} size="sm" />
      </div>
    </Link>
  );
}

// Helper functions
function formatDateRange(startsAt: string, endsAt: string, timezone: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();

  const dateOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  };

  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOptions)} - ${end.toLocaleTimeString(undefined, timeOptions)}`;
  }

  return `${start.toLocaleDateString(undefined, dateOptions)} - ${end.toLocaleDateString(undefined, dateOptions)}`;
}

function formatDuration(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m duration`;
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return `${diffHours}h ${mins > 0 ? `${mins}m` : ""} duration`;
  }
  const hours = diffHours % 24;
  return `${diffDays}d ${hours > 0 ? `${hours}h` : ""} duration`;
}

function formatRecurrence(recurrence: MaintenanceWindow["recurrence"]): string {
  switch (recurrence.type) {
    case "daily":
      return recurrence.interval && recurrence.interval > 1
        ? `Every ${recurrence.interval} days`
        : "Daily";
    case "weekly":
      return recurrence.interval && recurrence.interval > 1
        ? `Every ${recurrence.interval} weeks`
        : "Weekly";
    case "monthly":
      return recurrence.interval && recurrence.interval > 1
        ? `Every ${recurrence.interval} months`
        : "Monthly";
    default:
      return "";
  }
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

  return date.toLocaleDateString();
}
