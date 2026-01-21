"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  ExternalLink,
  Pencil,
  CheckCircle,
  Clock,
  Activity,
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
  SeverityBadge,
  IncidentStatusBadge,
  SeverityIndicator,
  type IncidentSeverity,
  type IncidentStatus,
} from "./severity-badge";
import { IncidentTimelineCompact } from "./incident-timeline";
import type { Incident, IncidentUpdate, Monitor } from "@/lib/api-client";

export interface IncidentCardProps {
  incident: Incident & { updates?: IncidentUpdate[]; monitors?: Monitor[] };
  onUpdate?: () => void;
  onResolve?: () => void;
  onEdit?: () => void;
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function IncidentCard({
  incident,
  onUpdate,
  onResolve,
  onEdit,
  showActions = true,
  variant = "default",
  className,
}: IncidentCardProps) {
  const isResolved = incident.status === "resolved";
  const duration = calculateDuration(incident.startedAt, incident.resolvedAt);

  if (variant === "compact") {
    return (
      <IncidentCardCompact
        incident={incident}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SeverityIndicator
              severity={incident.severity as IncidentSeverity}
              pulse={!isResolved}
            />
            <Link
              href={`/incidents/${incident.id}`}
              className="font-medium truncate hover:underline"
            >
              {incident.title}
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SeverityBadge severity={incident.severity as IncidentSeverity} size="sm" />
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
                    <Link href={`/incidents/${incident.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {onUpdate && !isResolved && (
                    <DropdownMenuItem onClick={onUpdate}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Post Update
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Incident
                    </DropdownMenuItem>
                  )}
                  {onResolve && !isResolved && (
                    <DropdownMenuItem onClick={onResolve} className="text-green-600">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Resolve
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <IncidentStatusBadge status={incident.status as IncidentStatus} size="sm" />
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {duration}
          </div>
        </div>

        {incident.message && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {incident.message}
          </p>
        )}

        {incident.monitors && incident.monitors.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap gap-1">
              {incident.monitors.slice(0, 3).map((monitor) => (
                <span
                  key={monitor.id}
                  className="text-xs bg-muted px-1.5 py-0.5 rounded"
                >
                  {monitor.name}
                </span>
              ))}
              {incident.monitors.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{incident.monitors.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {incident.updates && incident.updates.length > 0 && (
          <div className="pt-2 border-t">
            <IncidentTimelineCompact updates={incident.updates} maxItems={2} />
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span>Created {formatRelativeTime(incident.createdAt)}</span>
          {isResolved && incident.resolvedAt && (
            <span className="text-green-600">
              Resolved {formatRelativeTime(incident.resolvedAt)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Compact variant for lists
function IncidentCardCompact({
  incident,
  className,
}: {
  incident: Incident;
  className?: string;
}) {
  const isResolved = incident.status === "resolved";
  const duration = calculateDuration(incident.startedAt, incident.resolvedAt);

  return (
    <Link
      href={`/incidents/${incident.id}`}
      className={cn(
        "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <SeverityIndicator
        severity={incident.severity as IncidentSeverity}
        size="lg"
        pulse={!isResolved}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{incident.title}</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatRelativeTime(incident.startedAt)}</span>
          <span>-</span>
          <span>{duration}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <IncidentStatusBadge status={incident.status as IncidentStatus} size="sm" />
        <SeverityBadge severity={incident.severity as IncidentSeverity} size="sm" />
      </div>
    </Link>
  );
}

// Helper functions
function calculateDuration(startedAt: string, resolvedAt: string | null): string {
  const start = new Date(startedAt);
  const end = resolvedAt ? new Date(resolvedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ${resolvedAt ? "duration" : "ongoing"}`;
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return `${diffHours}h ${mins > 0 ? `${mins}m` : ""} ${resolvedAt ? "duration" : "ongoing"}`;
  }
  const hours = diffHours % 24;
  return `${diffDays}d ${hours > 0 ? `${hours}h` : ""} ${resolvedAt ? "duration" : "ongoing"}`;
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
