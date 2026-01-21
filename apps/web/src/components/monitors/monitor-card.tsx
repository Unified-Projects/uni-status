"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Pencil,
  Trash2,
  Clock,
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
import { StatusBadge, StatusIndicator, type MonitorStatus } from "./status-badge";
import { UptimeCompact } from "./uptime-bar";
import { ResponseTimeCompact } from "./response-time-chart";
import type { Monitor } from "@/lib/api-client";

export interface MonitorCardProps {
  monitor: Monitor;
  uptimePercentage?: number | null;
  avgResponseTime?: number | null;
  onPause?: () => void;
  onResume?: () => void;
  onCheckNow?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function MonitorCard({
  monitor,
  uptimePercentage,
  avgResponseTime,
  onPause,
  onResume,
  onCheckNow,
  onEdit,
  onDelete,
  showActions = true,
  variant = "default",
  className,
}: MonitorCardProps) {
  const isPaused = monitor.paused || monitor.status === "paused";

  if (variant === "compact") {
    return (
      <MonitorCardCompact
        monitor={monitor}
        uptimePercentage={uptimePercentage}
        avgResponseTime={avgResponseTime}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIndicator status={monitor.status as MonitorStatus} pulse={!isPaused} />
            <Link
              href={`/monitors/${monitor.id}`}
              className="font-medium truncate hover:underline"
            >
              {monitor.name}
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={monitor.status as MonitorStatus} size="sm" />
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
                    <Link href={`/monitors/${monitor.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {onCheckNow && (
                    <DropdownMenuItem onClick={onCheckNow}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check Now
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {isPaused ? (
                    onResume && (
                      <DropdownMenuItem onClick={onResume}>
                        <Play className="mr-2 h-4 w-4" />
                        Resume
                      </DropdownMenuItem>
                    )
                  ) : (
                    onPause && (
                      <DropdownMenuItem onClick={onPause}>
                        <Pause className="mr-2 h-4 w-4" />
                        Pause
                      </DropdownMenuItem>
                    )
                  )}
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
          <span className="uppercase text-xs font-medium text-muted-foreground/70">
            {monitor.type}
          </span>
          <span className="mx-1">|</span>
          <a
            href={monitor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {monitor.url}
          </a>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Uptime</div>
              <UptimeCompact uptimePercentage={uptimePercentage ?? null} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Response</div>
              <ResponseTimeCompact
                value={avgResponseTime ?? null}
                threshold={monitor.degradedThresholdMs || 1000}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Interval</div>
            <div className="text-sm">
              {formatInterval(monitor.intervalSeconds)}
            </div>
          </div>
        </div>

        {monitor.lastCheckedAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last checked {formatRelativeTime(monitor.lastCheckedAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact variant for lists
function MonitorCardCompact({
  monitor,
  uptimePercentage,
  avgResponseTime,
  className,
}: Omit<MonitorCardProps, "variant" | "showActions">) {
  return (
    <Link
      href={`/monitors/${monitor.id}`}
      className={cn(
        "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <StatusIndicator
        status={monitor.status as MonitorStatus}
        size="lg"
        pulse={!monitor.paused}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{monitor.name}</div>
        <div className="text-sm text-muted-foreground truncate">{monitor.url}</div>
      </div>
      <div className="flex items-center gap-6 text-sm shrink-0">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Uptime</div>
          <UptimeCompact uptimePercentage={uptimePercentage ?? null} />
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Response</div>
          <ResponseTimeCompact
            value={avgResponseTime ?? null}
            threshold={monitor.degradedThresholdMs || 1000}
          />
        </div>
        <StatusBadge status={monitor.status as MonitorStatus} size="sm" />
      </div>
    </Link>
  );
}

// Helper functions
function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
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
