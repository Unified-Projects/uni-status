"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  cn,
} from "@uni-status/ui";
import {
  ChannelTypeIcon,
  getChannelTypeLabel,
  CHANNEL_TYPES,
  type AlertChannelType,
} from "./channel-type-icon";

interface ChannelTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectType: (type: AlertChannelType) => void;
}

// Descriptions for each channel type
function getChannelTypeDescription(type: AlertChannelType): string {
  const descriptions: Record<AlertChannelType, string> = {
    email: "Send alerts to email addresses",
    slack: "Post alerts to Slack channels",
    discord: "Post alerts to Discord channels",
    teams: "Post alerts to Microsoft Teams",
    pagerduty: "Create PagerDuty incidents",
    webhook: "Send to custom HTTP webhooks",
    sms: "Send SMS text messages",
    ntfy: "Push notifications via ntfy.sh",
    irc: "Post alerts to IRC channels",
    twitter: "Post alerts via Twitter/X",
  };
  return descriptions[type];
}

export function ChannelTypeSelector({
  open,
  onOpenChange,
  onSelectType,
}: ChannelTypeSelectorProps) {
  const handleSelect = (type: AlertChannelType) => {
    onSelectType(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Notification Provider</DialogTitle>
          <DialogDescription>
            Select how you want to receive alert notifications
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-4">
          {CHANNEL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleSelect(type)}
              className={cn(
                "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                "hover:border-primary hover:bg-primary/5",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "border-border"
              )}
            >
              <ChannelTypeIcon type={type} size="lg" showBackground />
              <div className="flex-1 min-w-0">
                <span className="font-medium block truncate">
                  {getChannelTypeLabel(type)}
                </span>
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {getChannelTypeDescription(type)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
