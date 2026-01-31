"use client";

import { Mail, Webhook, Phone, Bell, MessageSquare, Hash, type LucideIcon } from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import {
  siDiscord as discordIcon,
  siPagerduty as pagerdutyIcon,
  siX as xIcon,
} from "simple-icons";
// simple-icons v15 removed Slack and Microsoft Teams icons, so we use v12 for both
import { siSlack as slackIcon, siMicrosoftteams as microsoftteamsIcon } from "simple-icons-v12";
import { cn } from "@uni-status/ui";

function BrandIcon({ icon, className }: { icon: SimpleIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <path d={icon.path} />
    </svg>
  );
}

const SlackIcon = ({ className }: { className?: string }) => <BrandIcon icon={slackIcon} className={className} />;
const DiscordIcon = ({ className }: { className?: string }) => <BrandIcon icon={discordIcon} className={className} />;
const TeamsIcon = ({ className }: { className?: string }) => <BrandIcon icon={microsoftteamsIcon} className={className} />;
const PagerDutyIcon = ({ className }: { className?: string }) => <BrandIcon icon={pagerdutyIcon} className={className} />;
const TwitterIcon = ({ className }: { className?: string }) => <BrandIcon icon={xIcon} className={className} />;

export type AlertChannelType =
  | "email"
  | "slack"
  | "discord"
  | "teams"
  | "pagerduty"
  | "webhook"
  | "sms"
  | "ntfy"
  | "irc"
  | "twitter";

// Icon component type that accepts both Lucide icons and custom SVG components
type IconComponent = LucideIcon | React.ComponentType<{ className?: string }>;

interface ChannelTypeConfig {
  icon: IconComponent;
  label: string;
  color: string;
  bgColor: string;
}

const channelTypeConfig: Record<AlertChannelType, ChannelTypeConfig> = {
  email: {
    icon: Mail,
    label: "Email",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  slack: {
    icon: SlackIcon,
    label: "Slack",
    color: "text-[#4A154B]",
    bgColor: "bg-purple-100",
  },
  discord: {
    icon: DiscordIcon,
    label: "Discord",
    color: "text-[#5865F2]",
    bgColor: "bg-indigo-100",
  },
  teams: {
    icon: TeamsIcon,
    label: "Microsoft Teams",
    color: "text-[#6264A7]",
    bgColor: "bg-violet-100",
  },
  pagerduty: {
    icon: PagerDutyIcon,
    label: "PagerDuty",
    color: "text-[#06AC38]",
    bgColor: "bg-green-100",
  },
  webhook: {
    icon: Webhook,
    label: "Webhook",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
  sms: {
    icon: Phone,
    label: "SMS",
    color: "text-teal-600",
    bgColor: "bg-teal-100",
  },
  ntfy: {
    icon: Bell,
    label: "ntfy",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
  },
  irc: {
    icon: Hash,
    label: "IRC",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  twitter: {
    icon: TwitterIcon,
    label: "Twitter/X",
    color: "text-black dark:text-white",
    bgColor: "bg-gray-100",
  },
};

export interface ChannelTypeIconProps {
  type: AlertChannelType;
  size?: "sm" | "md" | "lg";
  showBackground?: boolean;
  disabled?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function ChannelTypeIcon({
  type,
  size = "md",
  showBackground = false,
  disabled = false,
  className,
}: ChannelTypeIconProps) {
  const config = channelTypeConfig[type];

  // Defensive check for unrecognized types
  if (!config) {
    console.warn(`Unknown channel type: ${type}`);
    return <Bell className={cn(sizeClasses[size], "text-muted-foreground", className)} />;
  }

  const Icon = config.icon;

  const bgSizeClasses = {
    sm: "p-1.5",
    md: "p-2",
    lg: "p-2.5",
  };

  if (showBackground) {
    return (
      <div
        className={cn(
          "rounded-lg",
          bgSizeClasses[size],
          disabled ? "bg-muted" : config.bgColor,
          className
        )}
      >
        <Icon
          className={cn(
            sizeClasses[size],
            disabled ? "text-muted-foreground" : config.color
          )}
        />
      </div>
    );
  }

  return (
    <Icon
      className={cn(
        sizeClasses[size],
        disabled ? "text-muted-foreground" : config.color,
        className
      )}
    />
  );
}

export function getChannelTypeLabel(type: AlertChannelType): string {
  return channelTypeConfig[type].label;
}

export function getChannelTypeConfig(type: AlertChannelType): ChannelTypeConfig {
  return channelTypeConfig[type];
}

export const CHANNEL_TYPES = Object.keys(channelTypeConfig) as AlertChannelType[];
