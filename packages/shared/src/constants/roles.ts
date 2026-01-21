// Base predefined roles with their permissions
// These are system roles that cannot be deleted

import type { Permission } from "../types/permissions";

export interface PredefinedRole {
  id: string;
  name: string;
  description: string;
  permissions: string[]; // Can include wildcards like "*", "monitors.*", "*.view"
  isSystem: true;
  color: string;
  icon: "crown" | "shield" | "user" | "eye" | "credit-card" | "siren" | "activity" | "book-open";
}

// Base roles that can be assigned to enum column
export const BASE_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type BaseRole = (typeof BASE_ROLES)[number];

export const PREDEFINED_ROLES: Record<string, PredefinedRole> = {
  owner: {
    id: "owner",
    name: "Owner",
    description: "Full access to all organization resources including deletion",
    permissions: ["*"],
    isSystem: true,
    color: "#f59e0b", // amber
    icon: "crown",
  },
  admin: {
    id: "admin",
    name: "Admin",
    description: "Full access except organization deletion",
    permissions: ["*", "-org.delete"],
    isSystem: true,
    color: "#8b5cf6", // purple
    icon: "shield",
  },
  member: {
    id: "member",
    name: "Member",
    description: "Can create and manage monitors, incidents, and view most resources",
    permissions: [
      "org.view",
      "members.view",
      "monitors.*",
      "incidents.*",
      "status_pages.view",
      "alerts.view",
      "oncall.view",
      "slo.view",
      "roles.view",
    ],
    isSystem: true,
    color: "#3b82f6", // blue
    icon: "user",
  },
  viewer: {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access to all resources",
    permissions: ["*.view"],
    isSystem: true,
    color: "#6b7280", // gray
    icon: "eye",
  },
} as const;

// Get list of all predefined role IDs
export const PREDEFINED_ROLE_IDS = Object.keys(PREDEFINED_ROLES);

// Check if a role ID is a predefined role
export function isPredefinedRole(roleId: string): boolean {
  return roleId in PREDEFINED_ROLES;
}

// Get a predefined role by ID
export function getPredefinedRole(roleId: string): PredefinedRole | null {
  return PREDEFINED_ROLES[roleId] || null;
}

// Check if a role is a base role (stored in enum)
export function isBaseRole(roleId: string): roleId is BaseRole {
  return BASE_ROLES.includes(roleId as BaseRole);
}
