"use client";

import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  Power,
  PowerOff,
  CheckCircle2,
  XCircle,
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
import {
  ChannelTypeIcon,
  getChannelTypeLabel,
  type AlertChannelType,
} from "./channel-type-icon";
import type { AlertChannel } from "@/lib/api-client";

export interface AlertChannelCardProps {
  channel: AlertChannel;
  onEdit?: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  onToggleEnabled?: () => void;
  isTestPending?: boolean;
  testResult?: { success: boolean; timestamp: number };
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function AlertChannelCard({
  channel,
  onEdit,
  onDelete,
  onTest,
  onToggleEnabled,
  isTestPending = false,
  testResult,
  showActions = true,
  variant = "default",
  className,
}: AlertChannelCardProps) {
  const configSummary = getConfigSummary(channel);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
          className
        )}
      >
        <ChannelTypeIcon
          type={channel.type as AlertChannelType}
          size="md"
          showBackground
          disabled={!channel.enabled}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{channel.name}</span>
            {!channel.enabled && (
              <Badge variant="secondary" className="text-xs">
                Disabled
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {getChannelTypeLabel(channel.type as AlertChannelType)}
            {configSummary && ` - ${configSummary}`}
          </div>
        </div>
        {showActions && (
          <div className="flex items-center gap-1 shrink-0">
            {onTest && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTest}
                disabled={isTestPending || !channel.enabled}
              >
                <Send className={cn("h-4 w-4", isTestPending && "animate-pulse")} />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ChannelTypeIcon
              type={channel.type as AlertChannelType}
              size="lg"
              showBackground
              disabled={!channel.enabled}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{channel.name}</h3>
                {!channel.enabled && (
                  <Badge variant="secondary" className="text-xs">
                    Disabled
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {getChannelTypeLabel(channel.type as AlertChannelType)}
              </p>
              {configSummary && (
                <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                  {configSummary}
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
                {onTest && (
                  <DropdownMenuItem
                    onClick={onTest}
                    disabled={isTestPending || !channel.enabled}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send Test
                  </DropdownMenuItem>
                )}
                {onToggleEnabled && (
                  <DropdownMenuItem onClick={onToggleEnabled}>
                    {channel.enabled ? (
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

        {showActions && onTest && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant={testResult?.success ? "default" : "outline"}
              size="sm"
              onClick={onTest}
              disabled={isTestPending || !channel.enabled}
              className={cn("w-full", testResult?.success && "bg-green-600 hover:bg-green-700")}
            >
              {isTestPending ? (
                <>
                  <Send className="mr-2 h-4 w-4 animate-pulse" />
                  Sending...
                </>
              ) : testResult?.success ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Test Sent Successfully
                </>
              ) : testResult?.success === false ? (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Test Failed
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Test Notification
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getConfigSummary(channel: AlertChannel): string | null {
  const config = channel.config;
  switch (channel.type) {
    case "email":
      return config.email || null;
    case "slack":
    case "discord":
    case "teams":
      return config.webhookUrl
        ? `${config.webhookUrl.substring(0, 40)}...`
        : null;
    case "pagerduty":
      return config.routingKey
        ? `Key: ${config.routingKey.substring(0, 10)}...`
        : null;
    case "webhook":
      return config.url
        ? `${config.url.substring(0, 40)}...`
        : null;
    case "sms":
      return config.phoneNumber || null;
    case "ntfy":
      return config.topic
        ? `${config.server || "ntfy.sh"}/${config.topic}`
        : null;
    default:
      return null;
  }
}
