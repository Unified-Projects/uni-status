/**
 * License Test Helpers
 *
 * Factory functions and mock data generators for license testing.
 */

import { nanoid } from "nanoid";
import type {
  LicenseEntitlements,
  License,
  NewLicense,
  LicenseStatus,
  GracePeriodStatus,
} from "../../src/database/schema/licensing";

// ==========================================
// Entitlement Presets
// ==========================================

// These values MUST match ORG_TYPE_LIMITS in packages/shared/src/constants/index.ts
// to ensure tests and server have the same limit expectations
export const FREE_ENTITLEMENTS: LicenseEntitlements = {
  monitors: 10,
  statusPages: 2,
  teamMembers: -1, // Unlimited (controlled by free org membership rule)
  regions: 1,
  auditLogs: false,
  sso: false,
  oauthProviders: false,
  customRoles: false,
  slo: false,
  reports: false,
  multiRegion: false,
  oncall: false,
};

// PRO entitlements must match ORG_TYPE_LIMITS.PROFESSIONAL
export const PRO_ENTITLEMENTS: LicenseEntitlements = {
  monitors: 50, // Match PROFESSIONAL tier (was 25)
  statusPages: 10, // Match PROFESSIONAL tier (was 5)
  teamMembers: 5, // Match PROFESSIONAL tier (was 10)
  regions: 3,
  auditLogs: true,
  sso: true,
  oauthProviders: true,
  customRoles: false,
  slo: true,
  reports: true,
  multiRegion: true,
  oncall: false,
};

export const ENTERPRISE_ENTITLEMENTS: LicenseEntitlements = {
  monitors: -1, // unlimited
  statusPages: -1,
  teamMembers: -1,
  regions: -1,
  auditLogs: true,
  sso: true,
  oauthProviders: true,
  customRoles: true,
  slo: true,
  reports: true,
  multiRegion: true,
  oncall: true,
};

// Self-hosted mode: all numeric limits are unlimited
// Boolean features default to false (can be enabled via license)
export const SELF_HOSTED_ENTITLEMENTS: LicenseEntitlements = {
  monitors: -1,
  statusPages: -1,
  teamMembers: -1,
  regions: -1,
  auditLogs: false,
  sso: false,
  oauthProviders: false,
  customRoles: false,
  slo: false,
  reports: false,
  multiRegion: false,
  oncall: false,
};

/**
 * Check if running in self-hosted mode.
 * In self-hosted mode, all numeric limits are unlimited (-1).
 */
export function isSelfHostedMode(): boolean {
  return (
    !process.env.DEPLOYMENT_TYPE ||
    process.env.DEPLOYMENT_TYPE === "SELF-HOSTED"
  );
}

/**
 * Get entitlements for a specific plan.
 */
export function getEntitlementsForPlan(
  plan: "free" | "pro" | "enterprise"
): LicenseEntitlements {
  switch (plan) {
    case "free":
      return FREE_ENTITLEMENTS;
    case "pro":
      return PRO_ENTITLEMENTS;
    case "enterprise":
      return ENTERPRISE_ENTITLEMENTS;
    default:
      return FREE_ENTITLEMENTS;
  }
}

// ==========================================
// Mock License Types
// ==========================================

export interface MockLicense {
  id: string;
  organizationId: string;
  keygenLicenseId: string;
  keygenPolicyId: string | null;
  key: string;
  name: string | null;
  plan: "pro" | "enterprise";
  status: LicenseStatus;
  entitlements: LicenseEntitlements;
  validFrom: Date;
  expiresAt: Date | null;
  lastValidatedAt: Date | null;
  lastValidationResult: string | null;
  validationFailureCount: number;
  gracePeriodStatus: GracePeriodStatus;
  gracePeriodStartedAt: Date | null;
  gracePeriodEndsAt: Date | null;
  gracePeriodEmailsSent: number[];
  machineId: string | null;
  machineFingerprint: string | null;
  activatedAt: Date | null;
  activatedBy: string | null;
  licenseeEmail: string | null;
  licenseeName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Factory Functions
// ==========================================

/**
 * Create a mock license with sensible defaults.
 * All properties can be overridden.
 */
export function createMockLicense(
  overrides: Partial<MockLicense> = {}
): MockLicense {
  const now = new Date();
  // Start a bit in the past so tests that update timestamps can assert monotonic change
  const baseTimestamp = new Date(now.getTime() - 1000);
  const thirtyDaysFromNow = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const plan = overrides.plan || "pro";

  return {
    id: nanoid(),
    organizationId: nanoid(),
    keygenLicenseId: `lic_${nanoid()}`,
    keygenPolicyId: `policy_${plan}`,
    key: generateMockLicenseKey(),
    name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} License`,
    plan,
    status: "active",
    entitlements: getEntitlementsForPlan(plan),
    validFrom: baseTimestamp,
    expiresAt: thirtyDaysFromNow,
    lastValidatedAt: baseTimestamp,
    lastValidationResult: "success",
    validationFailureCount: 0,
    gracePeriodStatus: "none",
    gracePeriodStartedAt: null,
    gracePeriodEndsAt: null,
    gracePeriodEmailsSent: [],
    machineId: null,
    machineFingerprint: null,
    activatedAt: now,
    activatedBy: null,
    licenseeEmail: "test@example.com",
    licenseeName: "Test User",
    metadata: {},
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides,
  };
}

/**
 * Create an expired license.
 */
export function createExpiredLicense(
  daysAgo: number = 1,
  overrides: Partial<MockLicense> = {}
): MockLicense {
  const now = new Date();
  const expiredAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

  return createMockLicense({
    status: "expired",
    expiresAt: expiredAt,
    lastValidationResult: "expired",
    ...overrides,
  });
}

/**
 * Create a license in grace period.
 */
export function createGracePeriodLicense(
  daysRemaining: number,
  overrides: Partial<MockLicense> = {}
): MockLicense {
  const now = new Date();
  const daysElapsed = 5 - daysRemaining;
  const gracePeriodStarted = new Date(
    now.getTime() - daysElapsed * 24 * 60 * 60 * 1000
  );
  const gracePeriodEnds = new Date(
    gracePeriodStarted.getTime() + 5 * 24 * 60 * 60 * 1000
  );

  // Determine which emails have been sent based on days remaining
  const emailsSent: number[] = [];
  if (daysRemaining < 5) emailsSent.push(5);
  if (daysRemaining < 3) emailsSent.push(3);
  if (daysRemaining < 1) emailsSent.push(1);

  return createMockLicense({
    status: "suspended",
    gracePeriodStatus: "active",
    gracePeriodStartedAt: gracePeriodStarted,
    gracePeriodEndsAt: gracePeriodEnds,
    gracePeriodEmailsSent: emailsSent,
    lastValidationResult: "suspended",
    ...overrides,
  });
}

/**
 * Create a suspended license (payment failed).
 */
export function createSuspendedLicense(
  overrides: Partial<MockLicense> = {}
): MockLicense {
  return createMockLicense({
    status: "suspended",
    gracePeriodStatus: "active",
    gracePeriodStartedAt: new Date(),
    gracePeriodEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    lastValidationResult: "suspended",
    ...overrides,
  });
}

/**
 * Create a revoked license.
 */
export function createRevokedLicense(
  overrides: Partial<MockLicense> = {}
): MockLicense {
  return createMockLicense({
    status: "revoked",
    gracePeriodStatus: "none",
    lastValidationResult: "revoked",
    ...overrides,
  });
}

/**
 * Create a license that has been downgraded after grace period expiry.
 */
export function createDowngradedLicense(
  overrides: Partial<MockLicense> = {}
): MockLicense {
  const now = new Date();
  const gracePeriodStarted = new Date(
    now.getTime() - 6 * 24 * 60 * 60 * 1000
  ); // 6 days ago
  const gracePeriodEnded = new Date(
    gracePeriodStarted.getTime() + 5 * 24 * 60 * 60 * 1000
  );

  return createMockLicense({
    status: "expired",
    gracePeriodStatus: "expired",
    gracePeriodStartedAt: gracePeriodStarted,
    gracePeriodEndsAt: gracePeriodEnded,
    gracePeriodEmailsSent: [5, 3, 1],
    entitlements: FREE_ENTITLEMENTS, // Downgraded to free tier
    lastValidationResult: "expired",
    ...overrides,
  });
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Generate a mock license key in Keygen.sh format.
 */
export function generateMockLicenseKey(): string {
  const segments = [
    nanoid(8).toUpperCase(),
    nanoid(8).toUpperCase(),
    nanoid(8).toUpperCase(),
    nanoid(8).toUpperCase(),
  ];
  return `UNIS-${segments.join("-")}`;
}

/**
 * Convert MockLicense to NewLicense for database insertion.
 */
export function mockLicenseToDbLicense(mock: MockLicense): NewLicense {
  return {
    id: mock.id,
    organizationId: mock.organizationId,
    keygenLicenseId: mock.keygenLicenseId,
    keygenPolicyId: mock.keygenPolicyId,
    key: mock.key,
    name: mock.name,
    plan: mock.plan,
    status: mock.status,
    validFrom: mock.validFrom,
    expiresAt: mock.expiresAt,
    lastValidatedAt: mock.lastValidatedAt,
    lastValidationResult: mock.lastValidationResult,
    validationFailureCount: mock.validationFailureCount,
    entitlements: mock.entitlements,
    gracePeriodStatus: mock.gracePeriodStatus,
    gracePeriodStartedAt: mock.gracePeriodStartedAt,
    gracePeriodEndsAt: mock.gracePeriodEndsAt,
    gracePeriodEmailsSent: mock.gracePeriodEmailsSent,
    machineId: mock.machineId,
    machineFingerprint: mock.machineFingerprint,
    activatedAt: mock.activatedAt,
    activatedBy: mock.activatedBy,
    licenseeEmail: mock.licenseeEmail,
    licenseeName: mock.licenseeName,
    metadata: mock.metadata,
    createdAt: mock.createdAt,
    updatedAt: mock.updatedAt,
  };
}

/**
 * Calculate grace period days remaining from a license.
 */
export function getGracePeriodDaysRemaining(license: MockLicense): number {
  if (
    license.gracePeriodStatus !== "active" ||
    !license.gracePeriodEndsAt
  ) {
    return 0;
  }

  const now = Date.now();
  const endsAt = license.gracePeriodEndsAt.getTime();
  const remaining = Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000));

  return Math.max(0, remaining);
}

/**
 * Check if a license is effectively active (including grace period).
 */
export function isLicenseEffectivelyActive(license: MockLicense): boolean {
  return (
    license.status === "active" ||
    (license.status === "suspended" && license.gracePeriodStatus === "active")
  );
}

// ==========================================
// Organization Type Context Helpers
// ==========================================

/**
 * Organization type string literal type.
 * Matches the values from @uni-status/shared/constants
 */
export type OrganizationType =
  | "SELF_HOSTED"
  | "FREE"
  | "PROFESSIONAL"
  | "ENTERPRISE"
  | "SELF_HOSTED_ENTERPRISE";

/**
 * Organization limits interface.
 * Matches the interface from @uni-status/shared/types/organization
 */
export interface OrganizationLimits {
  monitors: number;
  statusPages: number;
  teamMembers: number;
  minCheckInterval: number;
  dataRetention: number;
  enterpriseFeatures: boolean;
  regions: number;
  alertChannels: number;
}

/**
 * Organization type limits for testing.
 * These values match ORG_TYPE_LIMITS from @uni-status/shared/constants
 */
const ORG_TYPE_LIMITS: Record<OrganizationType, OrganizationLimits> = {
  SELF_HOSTED: {
    monitors: -1,
    statusPages: -1,
    teamMembers: -1,
    minCheckInterval: 30,
    dataRetention: -1,
    enterpriseFeatures: false,
    regions: -1,
    alertChannels: -1,
  },
  SELF_HOSTED_ENTERPRISE: {
    monitors: -1,
    statusPages: -1,
    teamMembers: -1,
    minCheckInterval: 30,
    dataRetention: -1,
    enterpriseFeatures: true,
    regions: -1,
    alertChannels: -1,
  },
  FREE: {
    monitors: 10,
    statusPages: 2,
    teamMembers: -1,
    minCheckInterval: 600,
    dataRetention: 14,
    enterpriseFeatures: false,
    regions: 1,
    alertChannels: 3,
  },
  PROFESSIONAL: {
    monitors: 50,
    statusPages: 10,
    teamMembers: 5,
    minCheckInterval: 60,
    dataRetention: 90,
    enterpriseFeatures: false,
    regions: 3,
    alertChannels: 10,
  },
  ENTERPRISE: {
    monitors: -1,
    statusPages: -1,
    teamMembers: -1,
    minCheckInterval: 30,
    dataRetention: 365,
    enterpriseFeatures: true,
    regions: -1,
    alertChannels: -1,
  },
};

/**
 * Get org type limits for FREE tier.
 */
export const FREE_ORG_LIMITS: OrganizationLimits = ORG_TYPE_LIMITS.FREE;

/**
 * Get org type limits for PROFESSIONAL tier.
 */
export const PROFESSIONAL_ORG_LIMITS: OrganizationLimits = ORG_TYPE_LIMITS.PROFESSIONAL;

/**
 * Get org type limits for ENTERPRISE tier.
 */
export const ENTERPRISE_ORG_LIMITS: OrganizationLimits = ORG_TYPE_LIMITS.ENTERPRISE;

/**
 * Get org type limits for SELF_HOSTED.
 */
export const SELF_HOSTED_ORG_LIMITS: OrganizationLimits = ORG_TYPE_LIMITS.SELF_HOSTED;

/**
 * Get org type limits for SELF_HOSTED_ENTERPRISE.
 */
export const SELF_HOSTED_ENTERPRISE_ORG_LIMITS: OrganizationLimits = ORG_TYPE_LIMITS.SELF_HOSTED_ENTERPRISE;

/**
 * Map plan to default org type (for hosted mode).
 */
export function planToOrgType(
  plan: "free" | "pro" | "enterprise"
): OrganizationType {
  switch (plan) {
    case "free":
      return "FREE";
    case "pro":
      return "PROFESSIONAL";
    case "enterprise":
      return "ENTERPRISE";
    default:
      return "FREE";
  }
}

/**
 * Get org limits for a specific org type.
 */
export function getOrgLimitsForType(orgType: OrganizationType): OrganizationLimits {
  return ORG_TYPE_LIMITS[orgType];
}
