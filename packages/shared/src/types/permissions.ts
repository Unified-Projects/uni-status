// Permission definitions for RBAC system
// Used by both predefined and custom roles

export const PERMISSIONS = {
  // Organization
  "org.view": "View organization details",
  "org.settings": "Manage organization settings",
  "org.delete": "Delete organization",
  "org.billing": "Manage billing and subscriptions",

  // Members
  "members.view": "View team members",
  "members.invite": "Invite new members",
  "members.remove": "Remove members",
  "members.role": "Change member roles",

  // Monitors
  "monitors.view": "View monitors",
  "monitors.create": "Create monitors",
  "monitors.edit": "Edit monitors",
  "monitors.delete": "Delete monitors",
  "monitors.pause": "Pause/resume monitors",

  // Incidents
  "incidents.view": "View incidents",
  "incidents.create": "Create incidents",
  "incidents.update": "Update incidents",
  "incidents.resolve": "Resolve incidents",
  "incidents.delete": "Delete incidents",

  // Status Pages
  "status_pages.view": "View status pages",
  "status_pages.create": "Create status pages",
  "status_pages.edit": "Edit status pages",
  "status_pages.delete": "Delete status pages",

  // Alerts
  "alerts.view": "View alert channels",
  "alerts.manage": "Manage alert channels",

  // On-Call
  "oncall.view": "View on-call schedules",
  "oncall.manage": "Manage on-call rotations",

  // SLO
  "slo.view": "View SLO targets",
  "slo.manage": "Manage SLO targets",

  // API Keys
  "api_keys.view": "View API keys",
  "api_keys.manage": "Manage API keys",

  // Audit Logs
  "audit.view": "View audit logs",

  // Roles (meta-permission)
  "roles.view": "View custom roles",
  "roles.manage": "Create/edit custom roles",
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = {
  organization: {
    label: "Organization",
    permissions: ["org.view", "org.settings", "org.delete", "org.billing"] as Permission[],
  },
  members: {
    label: "Team Members",
    permissions: ["members.view", "members.invite", "members.remove", "members.role"] as Permission[],
  },
  monitors: {
    label: "Monitors",
    permissions: ["monitors.view", "monitors.create", "monitors.edit", "monitors.delete", "monitors.pause"] as Permission[],
  },
  incidents: {
    label: "Incidents",
    permissions: ["incidents.view", "incidents.create", "incidents.update", "incidents.resolve", "incidents.delete"] as Permission[],
  },
  status_pages: {
    label: "Status Pages",
    permissions: ["status_pages.view", "status_pages.create", "status_pages.edit", "status_pages.delete"] as Permission[],
  },
  alerts: {
    label: "Alerts",
    permissions: ["alerts.view", "alerts.manage"] as Permission[],
  },
  oncall: {
    label: "On-Call",
    permissions: ["oncall.view", "oncall.manage"] as Permission[],
  },
  slo: {
    label: "SLO",
    permissions: ["slo.view", "slo.manage"] as Permission[],
  },
  api_keys: {
    label: "API Keys",
    permissions: ["api_keys.view", "api_keys.manage"] as Permission[],
  },
  audit: {
    label: "Audit",
    permissions: ["audit.view"] as Permission[],
  },
  roles: {
    label: "Roles",
    permissions: ["roles.view", "roles.manage"] as Permission[],
  },
} as const;

export type PermissionCategory = keyof typeof PERMISSION_CATEGORIES;

// Get all permissions as array
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

// Check if a string is a valid permission
export function isValidPermission(permission: string): permission is Permission {
  return permission in PERMISSIONS;
}

// Expand wildcard patterns to actual permissions
// e.g., "monitors.*" -> ["monitors.view", "monitors.create", ...]
// e.g., "*.view" -> ["org.view", "members.view", ...]
// e.g., "*" -> all permissions
export function expandWildcards(patterns: string[]): Permission[] {
  const expanded = new Set<Permission>();
  const negated = new Set<Permission>();

  for (const pattern of patterns) {
    // Handle negation (e.g., "-org.delete")
    if (pattern.startsWith("-")) {
      const negatedPattern = pattern.slice(1);
      if (isValidPermission(negatedPattern)) {
        negated.add(negatedPattern);
      } else if (negatedPattern.includes("*")) {
        // Expand negated wildcards
        const expandedNegated = expandSingleWildcard(negatedPattern);
        for (const perm of expandedNegated) {
          negated.add(perm);
        }
      }
      continue;
    }

    // Handle regular patterns
    if (pattern === "*") {
      // All permissions
      for (const perm of ALL_PERMISSIONS) {
        expanded.add(perm);
      }
    } else if (pattern.includes("*")) {
      const expandedPerms = expandSingleWildcard(pattern);
      for (const perm of expandedPerms) {
        expanded.add(perm);
      }
    } else if (isValidPermission(pattern)) {
      expanded.add(pattern);
    }
  }

  // Remove negated permissions
  for (const perm of negated) {
    expanded.delete(perm);
  }

  return Array.from(expanded);
}

function expandSingleWildcard(pattern: string): Permission[] {
  const result: Permission[] = [];
  const [prefix, suffix] = pattern.split("*");

  for (const perm of ALL_PERMISSIONS) {
    if (prefix && suffix) {
      // e.g., "monitors.*" (prefix="monitors.", suffix="")
      if (perm.startsWith(prefix) && perm.endsWith(suffix)) {
        result.push(perm);
      }
    } else if (prefix) {
      // e.g., "monitors.*"
      if (perm.startsWith(prefix)) {
        result.push(perm);
      }
    } else if (suffix) {
      // e.g., "*.view"
      if (perm.endsWith(suffix)) {
        result.push(perm);
      }
    }
  }

  return result;
}

// Check if a user has a specific permission
export function hasPermission(
  userPermissions: string[],
  required: Permission | Permission[]
): boolean {
  const expandedPermissions = expandWildcards(userPermissions);
  const requiredArray = Array.isArray(required) ? required : [required];

  return requiredArray.every((perm) => expandedPermissions.includes(perm));
}

// Check if user has any of the specified permissions
export function hasAnyPermission(
  userPermissions: string[],
  required: Permission[]
): boolean {
  const expandedPermissions = expandWildcards(userPermissions);
  return required.some((perm) => expandedPermissions.includes(perm));
}
