"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  User,
  Globe,
  Clock,
  Monitor,
} from "lucide-react";
import { Button, Avatar, cn } from "@uni-status/ui";
import { AuditActionBadge } from "./audit-action-badge";
import type { AuditLog, ResourceType } from "@/lib/api-client";

export interface AuditLogRowProps {
  log: AuditLog;
  className?: string;
}

const resourceTypeLabels: Record<ResourceType, string> = {
  user: "User",
  organization: "Organisation",
  monitor: "Monitor",
  incident: "Incident",
  status_page: "Status Page",
  alert_channel: "Alert Channel",
  alert_policy: "Alert Policy",
  api_key: "API Key",
  maintenance_window: "Maintenance Window",
  subscriber: "Subscriber",
};

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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

export function AuditLogRow({ log, className }: AuditLogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges =
    log.metadata?.changes && log.metadata.changes.length > 0;
  const hasBefore = log.metadata?.before && Object.keys(log.metadata.before).length > 0;
  const hasAfter = log.metadata?.after && Object.keys(log.metadata.after).length > 0;
  const hasDetails = hasChanges || hasBefore || hasAfter;

  return (
    <div
      className={cn(
        "border-b last:border-b-0 hover:bg-muted/30 transition-colors",
        className
      )}
    >
      {/* Main Row */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Expand Button */}
        {hasDetails ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <div className="h-6 w-6 shrink-0" />
        )}

        {/* User */}
        <div className="flex items-center gap-2 w-48 shrink-0">
          {log.user ? (
            <>
              <Avatar className="h-6 w-6">
                {log.user.image ? (
                  <img
                    src={log.user.image}
                    alt={log.user.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center text-xs font-medium">
                    {log.user.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}
              </Avatar>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{log.user.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {log.user.email}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">System</span>
            </>
          )}
        </div>

        {/* Action */}
        <div className="w-36 shrink-0">
          <AuditActionBadge action={log.action} />
        </div>

        {/* Resource */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">
              {resourceTypeLabels[log.resourceType] || log.resourceType}
            </span>
            {log.resourceName && (
              <span className="text-sm font-medium truncate">
                {log.resourceName}
              </span>
            )}
            {!log.resourceName && log.resourceId && (
              <span className="text-sm font-mono text-muted-foreground truncate">
                {log.resourceId}
              </span>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span title={formatTimestamp(log.createdAt)}>
            {formatRelativeTime(log.createdAt)}
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && hasDetails && (
        <div className="px-4 pb-4 ml-10 space-y-3">
          {/* Changes */}
          {hasChanges && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Changes
              </div>
              <div className="space-y-1">
                {log.metadata!.changes!.map((change, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-sm bg-muted/50 rounded px-3 py-2"
                  >
                    <span className="font-medium text-muted-foreground min-w-[100px]">
                      {change.field}
                    </span>
                    <span className="text-red-600 line-through">
                      {formatValue(change.from)}
                    </span>
                    <span className="text-muted-foreground">to</span>
                    <span className="text-green-600">
                      {formatValue(change.to)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Before/After States (if no changes computed) */}
          {!hasChanges && (hasBefore || hasAfter) && (
            <div className="grid grid-cols-2 gap-4">
              {hasBefore && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Before
                  </div>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-48">
                    {JSON.stringify(log.metadata!.before, null, 2)}
                  </pre>
                </div>
              )}
              {hasAfter && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    After
                  </div>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-48">
                    {JSON.stringify(log.metadata!.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          {log.metadata?.reason && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reason
              </div>
              <p className="text-sm">{log.metadata.reason}</p>
            </div>
          )}

          {/* Request Info */}
          {(log.ipAddress || log.userAgent) && (
            <div className="flex gap-6 text-xs text-muted-foreground pt-2 border-t">
              {log.ipAddress && (
                <div className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  <span>{log.ipAddress}</span>
                </div>
              )}
              {log.userAgent && (
                <div className="flex items-center gap-1">
                  <Monitor className="h-3 w-3" />
                  <span className="truncate max-w-[300px]" title={log.userAgent}>
                    {log.userAgent}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(empty)";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
