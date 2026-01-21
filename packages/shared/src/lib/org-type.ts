/**
 * Organization Type Resolution Logic
 *
 * This module provides the core logic for determining an organization's type
 * and applicable limits based on deployment mode and license status.
 *
 * Organization type is computed at runtime - it is NOT stored in the database.
 * The type is derived from:
 * - Deployment mode (SELF-HOSTED vs HOSTED)
 * - License status/validity (from Keygen.sh)
 * - Subscription tier (for hosted mode, stored in database)
 */

import { isSelfHosted } from "../config/env";
import { ORG_TYPE_LIMITS } from "../constants";
import type {
    OrganizationType,
    OrganizationLimits,
    OrgTypeContext,
    SubscriptionTier,
} from "../types/organization";

/**
 * License context interface (simplified version for this module).
 * The full interface is defined in the enterprise package.
 */
export interface LicenseContextInput {
    plan?: string;
    status?: "active" | "grace_period" | "downgraded" | "no_license" | "expired" | "suspended" | "revoked";
    entitlements?: {
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
 * Resolve the organization type based on deployment mode and license.
 *
 * This is the SINGLE SOURCE OF TRUTH for org type computation.
 *
 * Logic:
 * - Self-hosted mode: Only SELF_HOSTED or SELF_HOSTED_ENTERPRISE possible
 *   - SELF_HOSTED_ENTERPRISE requires a valid Keygen.sh license
 *   - Both get unlimited resources; enterprise features are the differentiator
 * - Hosted mode: FREE, PROFESSIONAL, or ENTERPRISE based on subscriptionTier
 *   - Limits are hardcoded per tier (we control the deployment)
 *   - ENTERPRISE tier uses license-defined limits from Keygen.sh
 *
 * @param subscriptionTier - The organization's subscription tier (from database)
 * @param licenseContext - License information from Keygen.sh validation
 * @returns OrgTypeContext with computed type, limits, and feature flags
 */
export function resolveOrgType(
    subscriptionTier: SubscriptionTier | null,
    licenseContext?: LicenseContextInput,
    options?: { selfHosted?: boolean }
): OrgTypeContext {
    const selfHosted =
        options?.selfHosted !== undefined ? options.selfHosted : isSelfHosted();

    // Self-hosted mode: only SELF_HOSTED or SELF_HOSTED_ENTERPRISE possible
    if (selfHosted) {
        // Check for valid enterprise license (from Keygen.sh)
        const hasEnterpriseLicense =
            licenseContext &&
            (licenseContext.status === "active" ||
                licenseContext.status === "grace_period");

        // Self-hosted always gets unlimited resources
        // Enterprise features are the only thing gated by license
        if (hasEnterpriseLicense) {
            return {
                orgType: "SELF_HOSTED_ENTERPRISE" as OrganizationType,
                limits: { ...ORG_TYPE_LIMITS.SELF_HOSTED_ENTERPRISE },
                enterpriseFeatures: true,
                licenseEntitlements: licenseContext.entitlements,
            };
        }

        return {
            orgType: "SELF_HOSTED" as OrganizationType,
            limits: { ...ORG_TYPE_LIMITS.SELF_HOSTED },
            enterpriseFeatures: false,
        };
    }

    // Hosted mode: limits are hardcoded per tier (we control the deployment)
    // Enterprise tier gets limits from license entitlements
    // Prefer the license plan when present, otherwise fall back to stored subscription tier.
    // Tests and hosted deployments expect license validation to immediately reflect entitlements
    // even before subscription_tier is updated in the database.
    const tierFromLicense = mapLicensePlanToTier(licenseContext?.plan);
    const effectiveTier = tierFromLicense ?? subscriptionTier;

    if (effectiveTier === "enterprise") {
        return {
            orgType: "ENTERPRISE" as OrganizationType,
            limits: getEnterpriseLimits(licenseContext),
            enterpriseFeatures: true,
            licenseEntitlements: licenseContext?.entitlements,
        };
    }

    if (effectiveTier === "professional") {
        // Professional tier can get bonus resources from license entitlements
        const limits = getProfessionalLimits(licenseContext);
        return {
            orgType: "PROFESSIONAL" as OrganizationType,
            limits,
            enterpriseFeatures: false,
            licenseEntitlements: licenseContext?.entitlements,
        };
    }

    // Default to FREE for hosted mode
    return {
        orgType: "FREE" as OrganizationType,
        limits: { ...ORG_TYPE_LIMITS.FREE },
        enterpriseFeatures: false,
    };
}

/**
 * Get professional tier limits, optionally extended by license entitlements.
 *
 * This is a template function that can be customized to apply license-based
 * bonuses to the base professional limits.
 *
 * @param licenseContext - License information from Keygen.sh
 * @returns OrganizationLimits for the professional tier
 */
export function getProfessionalLimits(
    licenseContext?: LicenseContextInput
): OrganizationLimits {
    const baseLimits: OrganizationLimits = { ...ORG_TYPE_LIMITS.PROFESSIONAL };

    if (licenseContext?.entitlements) {
        const ent = licenseContext.entitlements;
        baseLimits.monitors = ent.monitors ?? baseLimits.monitors;
        baseLimits.statusPages = ent.statusPages ?? baseLimits.statusPages;
        baseLimits.teamMembers = ent.teamMembers ?? baseLimits.teamMembers;
        baseLimits.regions = ent.regions ?? baseLimits.regions;
    }

    return baseLimits;
}

/**
 * Get additional monitors from professional license entitlements.
 *
 * This is a template function that calculates bonus monitors based on
 * what the license entitles beyond the base professional amount.
 *
 * @param licenseContext - License information from Keygen.sh
 * @returns Number of additional monitors (0 if no bonus)
 */
export function getProfessionalMonitorBonus(
    licenseContext?: LicenseContextInput
): number {
    if (!licenseContext?.entitlements) return 0;

    const baseMonitors = ORG_TYPE_LIMITS.PROFESSIONAL.monitors;
    const entitledMonitors = licenseContext.entitlements.monitors;

    // If unlimited in entitlements, return a large bonus
    // (the actual limit check will see -1 and allow unlimited)
    if (entitledMonitors === -1) return 0; // Handled by limit check

    // Return bonus if entitlements exceed base
    if (entitledMonitors > baseMonitors) {
        return entitledMonitors - baseMonitors;
    }

    return 0;
}

function mapLicensePlanToTier(
    plan?: string
): SubscriptionTier | null {
    if (!plan) return null;

    const normalized = plan.toLowerCase();
    if (normalized === "pro" || normalized === "professional") return "professional";
    if (normalized === "enterprise") return "enterprise";
    return null;
}

/**
 * Get enterprise tier limits from license entitlements.
 *
 * Enterprise limits are defined by the Keygen.sh license.
 * If no license or entitlements are available, falls back to defaults.
 *
 * @param licenseContext - License information from Keygen.sh
 * @returns OrganizationLimits for the enterprise tier
 */
export function getEnterpriseLimits(
    licenseContext?: LicenseContextInput
): OrganizationLimits {
    const baseLimits: OrganizationLimits = { ...ORG_TYPE_LIMITS.ENTERPRISE };

    if (licenseContext?.entitlements) {
        const ent = licenseContext.entitlements;

        // Enterprise uses license-defined limits directly
        return {
            monitors: ent.monitors,
            statusPages: ent.statusPages,
            teamMembers: ent.teamMembers,
            regions: ent.regions,
            minCheckInterval: baseLimits.minCheckInterval,
            dataRetention: baseLimits.dataRetention,
            enterpriseFeatures: true,
            alertChannels: -1, // Unlimited for enterprise
        };
    }

    return baseLimits;
}

/**
 * Check if enterprise features are available for the given org type context.
 *
 * @param context - The org type context
 * @returns true if enterprise features are available
 */
export function hasEnterpriseFeatures(context: OrgTypeContext): boolean {
    return context.enterpriseFeatures;
}

/**
 * Check if a resource limit is exceeded.
 *
 * @param limit - The limit value (-1 = unlimited)
 * @param currentCount - The current count of the resource
 * @returns true if adding one more would exceed the limit
 */
export function isLimitExceeded(limit: number, currentCount: number): boolean {
    // -1 means unlimited
    if (limit === -1) {
        return false;
    }
    return currentCount >= limit;
}

/**
 * Check if a specific resource can be added (limit not exceeded).
 *
 * @param limits - The organization limits
 * @param resource - The resource type to check
 * @param currentCount - The current count of the resource
 * @returns true if the resource can be added
 */
export function canAddResource(
    limits: OrganizationLimits,
    resource: keyof Pick<
        OrganizationLimits,
        "monitors" | "statusPages" | "teamMembers" | "regions" | "alertChannels"
    >,
    currentCount: number
): boolean {
    const limit = limits[resource];
    return !isLimitExceeded(limit, currentCount);
}
