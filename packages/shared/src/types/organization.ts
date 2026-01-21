/**
 * Organization Type System
 *
 * Defines the organization types and their associated limits.
 * Organization type is computed at runtime based on:
 * - Deployment mode (SELF-HOSTED vs HOSTED)
 * - License status/validity
 * - Subscription tier (for hosted mode)
 */

/**
 * Organization types enum.
 *
 * SELF_HOSTED: Self-hosted deployment without enterprise license (unlimited resources, no enterprise features)
 * SELF_HOSTED_ENTERPRISE: Self-hosted deployment with valid enterprise license (unlimited resources + enterprise features)
 * FREE: Hosted mode, free tier
 * PROFESSIONAL: Hosted mode, paid professional subscription
 * ENTERPRISE: Hosted mode, enterprise subscription with license-defined limits
 */
export const OrganizationType = {
  SELF_HOSTED: "SELF_HOSTED",
  FREE: "FREE",
  PROFESSIONAL: "PROFESSIONAL",
  ENTERPRISE: "ENTERPRISE",
  SELF_HOSTED_ENTERPRISE: "SELF_HOSTED_ENTERPRISE",
} as const;

export type OrganizationType =
  (typeof OrganizationType)[keyof typeof OrganizationType];

/**
 * Subscription tier for hosted mode billing.
 * This is stored in the database and used to determine the organization type in hosted mode.
 */
export type SubscriptionTier = "free" | "professional" | "enterprise";

/**
 * Organization limits structure.
 * Defines resource limits and feature flags for each organization type.
 */
export interface OrganizationLimits {
  /** Maximum number of monitors (-1 = unlimited) */
  monitors: number;
  /** Maximum number of status pages (-1 = unlimited) */
  statusPages: number;
  /** Maximum number of team members (-1 = unlimited) */
  teamMembers: number;
  /** Minimum check interval in seconds */
  minCheckInterval: number;
  /** Data retention period in days (-1 = unlimited) */
  dataRetention: number;
  /** Whether enterprise features are enabled */
  enterpriseFeatures: boolean;
  /** Maximum number of monitoring regions (-1 = unlimited) */
  regions: number;
  /** Maximum number of alert channels (-1 = unlimited) */
  alertChannels: number;
}

/**
 * Context returned by org type resolution.
 * Contains the computed organization type, limits, and feature flags.
 */
export interface OrgTypeContext {
  /** The computed organization type */
  orgType: OrganizationType;
  /** The applicable limits for this organization */
  limits: OrganizationLimits;
  /** Whether enterprise features are available */
  enterpriseFeatures: boolean;
  /** License entitlements (if applicable) */
  licenseEntitlements?: {
    monitors: number;
    statusPages: number;
    teamMembers: number;
    regions: number;
    auditLogs: boolean;
    sso: boolean;
    customRoles: boolean;
    slo: boolean;
    reports: boolean;
    multiRegion: boolean;
  };
}

/**
 * Result of free org membership check.
 */
export interface FreeOrgCheckResult {
  /** Whether the operation can proceed */
  canProceed: boolean;
  /** ID of existing free org if user is already a member of one */
  existingFreeOrgId?: string;
  /** Name of existing free org */
  existingFreeOrgName?: string;
}
