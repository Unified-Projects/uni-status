/**
 * Enterprise Extended Roles
 *
 * These predefined roles are part of the Uni-status Enterprise package
 * and require an enterprise license for production use.
 */

import type { PredefinedRole } from "@uni-status/shared/constants/roles";

// Extended roles (predefined but not in base enum)
export const EXTENDED_ROLES = ["billing", "incident_manager", "monitor_admin", "readonly_admin"] as const;
export type ExtendedRole = (typeof EXTENDED_ROLES)[number];

export const EXTENDED_PREDEFINED_ROLES: Record<ExtendedRole, PredefinedRole> = {
  billing: {
    id: "billing",
    name: "Billing Manager",
    description: "Manage billing, subscriptions, and view organization details",
    permissions: ["org.view", "org.billing"],
    isSystem: true,
    color: "#10b981", // emerald
    icon: "credit-card",
  },
  incident_manager: {
    id: "incident_manager",
    name: "Incident Manager",
    description: "Full incident, on-call, and status page management",
    permissions: [
      "org.view",
      "members.view",
      "monitors.view",
      "incidents.*",
      "oncall.*",
      "alerts.*",
      "status_pages.*",
    ],
    isSystem: true,
    color: "#ef4444", // red
    icon: "siren",
  },
  monitor_admin: {
    id: "monitor_admin",
    name: "Monitor Admin",
    description: "Full monitor and SLO management with alert viewing",
    permissions: [
      "org.view",
      "members.view",
      "monitors.*",
      "slo.*",
      "alerts.view",
    ],
    isSystem: true,
    color: "#06b6d4", // cyan
    icon: "activity",
  },
  readonly_admin: {
    id: "readonly_admin",
    name: "Readonly Admin",
    description: "View everything including audit logs and organization settings",
    permissions: ["*.view", "audit.view", "org.settings"],
    isSystem: true,
    color: "#64748b", // slate
    icon: "book-open",
  },
} as const;

// Check if a role is an extended predefined role
export function isExtendedRole(roleId: string): roleId is ExtendedRole {
  return EXTENDED_ROLES.includes(roleId as ExtendedRole);
}

// Get an extended predefined role by ID
export function getExtendedRole(roleId: string): PredefinedRole | null {
  return EXTENDED_PREDEFINED_ROLES[roleId as ExtendedRole] || null;
}
