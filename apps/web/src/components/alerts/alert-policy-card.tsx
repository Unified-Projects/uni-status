"use client";

import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Bell,
  AlertTriangle,
  Clock,
  Activity,
  CheckCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@uni-status/ui";
import type { AlertPolicy } from "@/lib/api-client";

export interface AlertPolicyCardProps {
  policy: AlertPolicy;
  channelCount?: number;
  monitorCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleEnabled?: () => void;
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function AlertPolicyCard({
  policy,
  channelCount = 0,
  monitorCount = 0,
  onEdit,
  onDelete,
  onToggleEnabled,
  showActions = true,
  variant = "default",
  className,
}: AlertPolicyCardProps) {
  const conditionsSummary = getConditionsSummary(policy.conditions);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
          className
        )}
      >
        <div
          className={cn(
            "p-2 rounded-lg",
            policy.enabled ? "bg-primary/10" : "bg-muted"
          )}
        >
          <Bell
            className={cn(
              "h-5 w-5",
              policy.enabled ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{policy.name}</span>
            {!policy.enabled && (
              <Badge variant="secondary" className="text-xs">
                Disabled
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {conditionsSummary}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-sm text-muted-foreground">
          <span>{channelCount} channels</span>
          <span>|</span>
          <span>{monitorCount} monitors</span>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "p-2 rounded-lg",
                policy.enabled ? "bg-primary/10" : "bg-muted"
              )}
            >
              <Bell
                className={cn(
                  "h-5 w-5",
                  policy.enabled ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{policy.name}</h3>
                {!policy.enabled && (
                  <Badge variant="secondary" className="text-xs">
                    Disabled
                  </Badge>
                )}
              </div>
              {policy.description && (
                <p className="text-sm text-muted-foreground">
                  {policy.description}
                </p>
              )}
            </div>
          </div>

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
                {onToggleEnabled && (
                  <DropdownMenuItem onClick={onToggleEnabled}>
                    {policy.enabled ? (
                      <>
                        <PowerOff className="mr-2 h-4 w-4" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Power className="mr-2 h-4 w-4" />
                        Enable
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Conditions */}
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Conditions
          </h4>
          <div className="flex flex-wrap gap-2">
            {policy.conditions.consecutiveFailures && (
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {policy.conditions.consecutiveFailures} consecutive failures
              </Badge>
            )}
            {policy.conditions.failuresInWindow && (
              <Badge variant="outline" className="gap-1">
                <Activity className="h-3 w-3" />
                {policy.conditions.failuresInWindow.count} failures in{" "}
                {policy.conditions.failuresInWindow.windowMinutes}min
              </Badge>
            )}
            {policy.conditions.degradedDuration && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Degraded for {policy.conditions.degradedDuration}min
              </Badge>
            )}
            {policy.conditions.consecutiveSuccesses && (
              <Badge variant="outline" className="gap-1 bg-green-50">
                <CheckCircle className="h-3 w-3 text-green-600" />
                {policy.conditions.consecutiveSuccesses} consecutive recoveries
              </Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{channelCount} channel{channelCount !== 1 ? "s" : ""}</span>
            <span>{monitorCount} monitor{monitorCount !== 1 ? "s" : ""}</span>
          </div>
          <span>Cooldown: {policy.cooldownMinutes}min</span>
        </div>
      </CardContent>
    </Card>
  );
}

function getConditionsSummary(conditions: AlertPolicy["conditions"]): string {
  const parts: string[] = [];

  if (conditions.consecutiveFailures) {
    parts.push(`${conditions.consecutiveFailures} failures`);
  }
  if (conditions.failuresInWindow) {
    parts.push(
      `${conditions.failuresInWindow.count}/${conditions.failuresInWindow.windowMinutes}min`
    );
  }
  if (conditions.degradedDuration) {
    parts.push(`degraded ${conditions.degradedDuration}min`);
  }
  if (conditions.consecutiveSuccesses) {
    parts.push(`${conditions.consecutiveSuccesses} recoveries`);
  }

  return parts.length > 0 ? parts.join(", ") : "No conditions set";
}
