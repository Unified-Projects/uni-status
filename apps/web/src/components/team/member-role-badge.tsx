"use client";

import { Badge, cn } from "@uni-status/ui";
import { Crown, Shield, User, Eye, CreditCard, Siren, Activity, BookOpen, Tag } from "lucide-react";
import { PREDEFINED_ROLES, isPredefinedRole } from "@uni-status/shared/constants/roles";
import type { OrganizationRole } from "@/lib/api-client";

export type MemberRole = "owner" | "admin" | "member" | "viewer";
export type ExtendedRole = "billing" | "incident_manager" | "monitor_admin" | "readonly_admin";
export type AnyRole = MemberRole | ExtendedRole | string;

interface MemberRoleBadgeProps {
  role: AnyRole;
  customRole?: OrganizationRole | null;
  className?: string;
  showIcon?: boolean;
}

// Icon mapping for predefined roles
const roleIcons: Record<string, typeof Crown> = {
  crown: Crown,
  shield: Shield,
  user: User,
  eye: Eye,
  "credit-card": CreditCard,
  siren: Siren,
  activity: Activity,
  "book-open": BookOpen,
};

// Base role config (for fallback)
const baseRoleConfig: Record<
  MemberRole,
  {
    label: string;
    className: string;
    icon: typeof Crown;
  }
> = {
  owner: {
    label: "Owner",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20",
    icon: Crown,
  },
  admin: {
    label: "Admin",
    className: "bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20",
    icon: Shield,
  },
  member: {
    label: "Member",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20",
    icon: User,
  },
  viewer: {
    label: "Viewer",
    className: "bg-gray-500/10 text-gray-600 border-gray-500/20 hover:bg-gray-500/20",
    icon: Eye,
  },
};

export function MemberRoleBadge({ role, customRole, className, showIcon = false }: MemberRoleBadgeProps) {
  // If there's a custom role, use its properties
  if (customRole) {
    const Icon = customRole.icon ? roleIcons[customRole.icon] || Tag : Tag;
    const hasCustomColor = !!customRole.color;

    return (
      <Badge
        variant="outline"
        className={cn(
          !hasCustomColor && "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20",
          className
        )}
        style={hasCustomColor && customRole.color ? {
          backgroundColor: `${customRole.color}15`,
          color: customRole.color,
          borderColor: `${customRole.color}30`,
        } : undefined}
      >
        {showIcon && <Icon className="mr-1 h-3 w-3" />}
        {customRole.name}
      </Badge>
    );
  }

  // Check if it's a predefined role (extended or base)
  if (isPredefinedRole(role)) {
    const predefined = PREDEFINED_ROLES[role];
    const Icon = roleIcons[predefined.icon] || Tag;

    return (
      <Badge
        variant="outline"
        className={cn(className)}
        style={{
          backgroundColor: `${predefined.color}15`,
          color: predefined.color,
          borderColor: `${predefined.color}30`,
        }}
      >
        {showIcon && <Icon className="mr-1 h-3 w-3" />}
        {predefined.name}
      </Badge>
    );
  }

  // Fall back to base role config
  const baseConfig = baseRoleConfig[role as MemberRole];
  if (baseConfig) {
    const Icon = baseConfig.icon;
    return (
      <Badge
        variant="outline"
        className={cn(baseConfig.className, className)}
      >
        {showIcon && <Icon className="mr-1 h-3 w-3" />}
        {baseConfig.label}
      </Badge>
    );
  }

  // Unknown role - show as-is
  return (
    <Badge
      variant="outline"
      className={cn("bg-gray-500/10 text-gray-600 border-gray-500/20", className)}
    >
      {showIcon && <Tag className="mr-1 h-3 w-3" />}
      {role}
    </Badge>
  );
}

export function getRoleLabel(role: AnyRole): string {
  if (isPredefinedRole(role)) {
    return PREDEFINED_ROLES[role].name;
  }
  const baseConfig = baseRoleConfig[role as MemberRole];
  return baseConfig?.label || role;
}

export function getRolePermissions(role: MemberRole): {
  canManageMembers: boolean;
  canManageSettings: boolean;
  canCreateMonitors: boolean;
  canDeleteOrganization: boolean;
} {
  switch (role) {
    case "owner":
      return {
        canManageMembers: true,
        canManageSettings: true,
        canCreateMonitors: true,
        canDeleteOrganization: true,
      };
    case "admin":
      return {
        canManageMembers: true,
        canManageSettings: true,
        canCreateMonitors: true,
        canDeleteOrganization: false,
      };
    case "member":
      return {
        canManageMembers: false,
        canManageSettings: false,
        canCreateMonitors: true,
        canDeleteOrganization: false,
      };
    case "viewer":
      return {
        canManageMembers: false,
        canManageSettings: false,
        canCreateMonitors: false,
        canDeleteOrganization: false,
      };
  }
}
