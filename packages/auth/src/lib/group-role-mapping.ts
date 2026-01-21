import { db, organizationMembers, ssoProvider, eq, and } from "@uni-status/database";
import type { GroupRoleMappingConfig } from "@uni-status/database/schema";

type MemberRole = "owner" | "admin" | "member" | "viewer";

/**
 * Decodes a JWT token and extracts the payload without verification.
 * We don't need to verify since the token was already verified by Better Auth.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    if (!payload) return null;

    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Extracts groups from a JWT token or userinfo response.
 * Supports common claim names used by various IdPs.
 */
export function extractGroups(
  tokenPayload: Record<string, unknown>,
  groupsClaim?: string
): string[] {
  // Check custom claim name first
  if (groupsClaim) {
    const groups = tokenPayload[groupsClaim];
    if (Array.isArray(groups)) {
      return groups.map(String);
    }
    if (typeof groups === "string") {
      return [groups];
    }
  }

  // Try common group claim names
  const commonClaimNames = [
    "groups",           // Standard OIDC
    "roles",            // Common alternative
    "group",            // Singular form
    "role",             // Singular form
    "_claim_names",     // Azure AD indirect claims
    "wids",             // Azure AD well-known directory IDs
    "cognito:groups",   // AWS Cognito
    "custom:groups",    // Custom claims
  ];

  for (const claimName of commonClaimNames) {
    const value = tokenPayload[claimName];
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === "string") {
      return [value];
    }
  }

  return [];
}

/**
 * Determines the role for a user based on their groups and the mapping configuration.
 * Mappings are evaluated in order, first match wins.
 */
export function resolveRoleFromGroups(
  userGroups: string[],
  config: GroupRoleMappingConfig
): MemberRole | null {
  if (!config.enabled || !config.mappings || config.mappings.length === 0) {
    return config.defaultRole || null;
  }

  // Normalize user groups for case-insensitive matching
  const normalizedUserGroups = new Set(userGroups.map(g => g.toLowerCase()));

  // Check mappings in order (first match wins)
  for (const mapping of config.mappings) {
    const normalizedGroup = mapping.group.toLowerCase();

    // Support wildcard matching
    if (mapping.group === "*") {
      return mapping.role;
    }

    // Support prefix matching (e.g., "admins-*" matches "admins-team1")
    if (mapping.group.endsWith("*")) {
      const prefix = normalizedGroup.slice(0, -1);
      for (const userGroup of normalizedUserGroups) {
        if (userGroup.startsWith(prefix)) {
          return mapping.role;
        }
      }
    }

    // Exact match (case-insensitive)
    if (normalizedUserGroups.has(normalizedGroup)) {
      return mapping.role;
    }
  }

  // No match found, return default role
  return config.defaultRole || null;
}

/**
 * Gets the SSO provider configuration for an organization.
 */
async function getSsoProviderConfig(
  providerId: string
): Promise<{ organizationId: string | null; groupRoleMapping: GroupRoleMappingConfig | null } | null> {
  const provider = await db.query.ssoProvider.findFirst({
    where: eq(ssoProvider.providerId, providerId),
  });

  if (!provider) return null;

  let groupRoleMapping: GroupRoleMappingConfig | null = null;

  if (provider.type === "oidc" && provider.oidcConfig) {
    try {
      const config = typeof provider.oidcConfig === "string"
        ? JSON.parse(provider.oidcConfig)
        : provider.oidcConfig;
      groupRoleMapping = config.groupRoleMapping || null;
    } catch {
      // Invalid config
    }
  } else if (provider.type === "saml" && provider.samlConfig) {
    try {
      const config = typeof provider.samlConfig === "string"
        ? JSON.parse(provider.samlConfig)
        : provider.samlConfig;
      groupRoleMapping = config.groupRoleMapping || null;
    } catch {
      // Invalid config
    }
  }

  return {
    organizationId: provider.organizationId,
    groupRoleMapping,
  };
}

/**
 * Applies group-based role mapping for a user after SSO authentication.
 * This should be called after the account is created/updated.
 */
export async function applyGroupRoleMapping(params: {
  userId: string;
  providerId: string;
  idToken?: string | null;
  accessToken?: string | null;
}): Promise<{ success: boolean; role?: MemberRole; error?: string }> {
  const { userId, providerId, idToken, accessToken } = params;

  try {
    // Get SSO provider configuration
    const providerConfig = await getSsoProviderConfig(providerId);
    if (!providerConfig) {
      return { success: false, error: "SSO provider not found" };
    }

    const { organizationId, groupRoleMapping } = providerConfig;

    // Check if group role mapping is configured and enabled
    if (!groupRoleMapping || !groupRoleMapping.enabled) {
      return { success: true }; // Not enabled, nothing to do
    }

    if (!organizationId) {
      return { success: false, error: "SSO provider not linked to an organization" };
    }

    // Extract groups from ID token or access token
    let userGroups: string[] = [];

    if (idToken) {
      const payload = decodeJwtPayload(idToken);
      if (payload) {
        userGroups = extractGroups(payload, groupRoleMapping.groupsClaim);
      }
    }

    // If no groups found in ID token, try access token
    if (userGroups.length === 0 && accessToken) {
      const payload = decodeJwtPayload(accessToken);
      if (payload) {
        userGroups = extractGroups(payload, groupRoleMapping.groupsClaim);
      }
    }

    // Resolve role based on groups
    const resolvedRole = resolveRoleFromGroups(userGroups, groupRoleMapping);

    if (!resolvedRole) {
      console.log(`[Auth] No role mapping match for user ${userId} with groups: ${userGroups.join(", ")}`);
      return { success: true }; // No match, keep default role
    }

    // Check if user is already a member of the organization
    const existingMember = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ),
    });

    if (existingMember) {
      // Check if we should sync on login
      if (!groupRoleMapping.syncOnLogin) {
        console.log(`[Auth] User ${userId} already member, syncOnLogin disabled, keeping role: ${existingMember.role}`);
        return { success: true, role: existingMember.role as MemberRole };
      }

      // Don't demote owners unless explicitly configured
      if (existingMember.role === "owner" && resolvedRole !== "owner") {
        console.log(`[Auth] Skipping role update for owner ${userId}`);
        return { success: true, role: existingMember.role as MemberRole };
      }

      // Update role if different
      if (existingMember.role !== resolvedRole) {
        await db
          .update(organizationMembers)
          .set({ role: resolvedRole, updatedAt: new Date() })
          .where(eq(organizationMembers.id, existingMember.id));

        console.log(`[Auth] Updated role for user ${userId} from ${existingMember.role} to ${resolvedRole} based on groups: ${userGroups.join(", ")}`);
        return { success: true, role: resolvedRole };
      }

      return { success: true, role: existingMember.role as MemberRole };
    }

    // User not yet a member - they'll be provisioned by Better Auth's SSO plugin
    // The role will be applied when they're provisioned
    console.log(`[Auth] User ${userId} not yet member, resolved role from groups: ${resolvedRole}`);
    return { success: true, role: resolvedRole };

  } catch (error) {
    console.error(`[Auth] Error applying group role mapping:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Gets the resolved role for a user based on their SSO groups.
 * This can be called during the provisioning process to determine the initial role.
 */
export async function getResolvedRoleFromSso(params: {
  providerId: string;
  idToken?: string | null;
}): Promise<MemberRole | null> {
  const { providerId, idToken } = params;

  try {
    const providerConfig = await getSsoProviderConfig(providerId);
    if (!providerConfig?.groupRoleMapping?.enabled) {
      return null;
    }

    if (!idToken) {
      return providerConfig.groupRoleMapping.defaultRole || null;
    }

    const payload = decodeJwtPayload(idToken);
    if (!payload) {
      return providerConfig.groupRoleMapping.defaultRole || null;
    }

    const userGroups = extractGroups(payload, providerConfig.groupRoleMapping.groupsClaim);
    return resolveRoleFromGroups(userGroups, providerConfig.groupRoleMapping);
  } catch (error) {
    console.error(`[Auth] Error getting resolved role from SSO:`, error);
    return null;
  }
}
