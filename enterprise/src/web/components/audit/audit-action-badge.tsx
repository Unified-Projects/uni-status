"use client";

import {
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Shield,
  Key,
  UserPlus,
  UserMinus,
  Users,
  Pause,
  Play,
  CheckCircle,
  Globe,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Badge, cn } from "@uni-status/ui";
import type { AuditAction } from "@/lib/api-client";

type ActionCategory = "create" | "update" | "delete" | "auth" | "access" | "system";

interface ActionConfig {
  label: string;
  category: ActionCategory;
  icon: LucideIcon;
}

const categoryColors: Record<ActionCategory, string> = {
  create: "bg-green-500/10 text-green-600 border-green-500/20",
  update: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  delete: "bg-red-500/10 text-red-600 border-red-500/20",
  auth: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  access: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  system: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const actionConfig: Record<AuditAction, ActionConfig> = {
  // Auth actions
  "user.login": { label: "Login", category: "auth", icon: LogIn },
  "user.logout": { label: "Logout", category: "auth", icon: LogOut },
  "user.password_change": { label: "Password Changed", category: "auth", icon: Key },
  "user.mfa_enable": { label: "MFA Enabled", category: "auth", icon: Shield },
  "user.mfa_disable": { label: "MFA Disabled", category: "auth", icon: Shield },

  // Organization actions
  "organization.create": { label: "Org Created", category: "create", icon: Plus },
  "organization.update": { label: "Org Updated", category: "update", icon: Pencil },
  "organization.delete": { label: "Org Deleted", category: "delete", icon: Trash2 },
  "organization.member_invite": { label: "Member Invited", category: "create", icon: UserPlus },
  "organization.member_remove": { label: "Member Removed", category: "delete", icon: UserMinus },
  "organization.member_role_change": { label: "Role Changed", category: "update", icon: Users },

  // Monitor actions
  "monitor.create": { label: "Monitor Created", category: "create", icon: Plus },
  "monitor.update": { label: "Monitor Updated", category: "update", icon: Pencil },
  "monitor.delete": { label: "Monitor Deleted", category: "delete", icon: Trash2 },
  "monitor.pause": { label: "Monitor Paused", category: "update", icon: Pause },
  "monitor.resume": { label: "Monitor Resumed", category: "update", icon: Play },

  // Incident actions
  "incident.create": { label: "Incident Created", category: "create", icon: Plus },
  "incident.update": { label: "Incident Updated", category: "update", icon: Pencil },
  "incident.resolve": { label: "Incident Resolved", category: "update", icon: CheckCircle },

  // Status page actions
  "status_page.create": { label: "Page Created", category: "create", icon: Plus },
  "status_page.update": { label: "Page Updated", category: "update", icon: Pencil },
  "status_page.delete": { label: "Page Deleted", category: "delete", icon: Trash2 },
  "status_page.publish": { label: "Page Published", category: "update", icon: Globe },
  "status_page.unpublish": { label: "Page Unpublished", category: "update", icon: Globe },

  // Alert actions
  "alert_channel.create": { label: "Channel Created", category: "create", icon: Plus },
  "alert_channel.update": { label: "Channel Updated", category: "update", icon: Pencil },
  "alert_channel.delete": { label: "Channel Deleted", category: "delete", icon: Trash2 },
  "alert_policy.create": { label: "Policy Created", category: "create", icon: Plus },
  "alert_policy.update": { label: "Policy Updated", category: "update", icon: Pencil },
  "alert_policy.delete": { label: "Policy Deleted", category: "delete", icon: Trash2 },

  // API key actions
  "api_key.create": { label: "API Key Created", category: "create", icon: Key },
  "api_key.delete": { label: "API Key Deleted", category: "delete", icon: Key },
  "api_key.use": { label: "API Key Used", category: "access", icon: Key },

  // Settings actions
  "settings.update": { label: "Settings Updated", category: "update", icon: Settings },
};

export interface AuditActionBadgeProps {
  action: AuditAction;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function AuditActionBadge({
  action,
  showIcon = true,
  showLabel = true,
  size = "default",
  className,
}: AuditActionBadgeProps) {
  const config = actionConfig[action] || {
    label: action,
    category: "system" as ActionCategory,
    icon: Settings,
  };
  const Icon = config.icon;
  const colorClass = categoryColors[config.category];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    default: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    default: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        sizeClasses[size],
        "inline-flex items-center gap-1 font-normal",
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {showLabel && config.label}
    </Badge>
  );
}

// Get human-readable action label
export function getActionLabel(action: AuditAction): string {
  return actionConfig[action]?.label || action;
}

// Get action category for filtering/grouping
export function getActionCategory(action: AuditAction): ActionCategory {
  return actionConfig[action]?.category || "system";
}

// Group actions by category
export const actionsByCategory: Record<ActionCategory, AuditAction[]> = {
  create: Object.entries(actionConfig)
    .filter(([, config]) => config.category === "create")
    .map(([action]) => action as AuditAction),
  update: Object.entries(actionConfig)
    .filter(([, config]) => config.category === "update")
    .map(([action]) => action as AuditAction),
  delete: Object.entries(actionConfig)
    .filter(([, config]) => config.category === "delete")
    .map(([action]) => action as AuditAction),
  auth: Object.entries(actionConfig)
    .filter(([, config]) => config.category === "auth")
    .map(([action]) => action as AuditAction),
  access: Object.entries(actionConfig)
    .filter(([, config]) => config.category === "access")
    .map(([action]) => action as AuditAction),
  system: Object.entries(actionConfig)
    .filter(([, config]) => config.category === "system")
    .map(([action]) => action as AuditAction),
};
