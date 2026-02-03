/**
 * License Middleware for Entitlement Enforcement
 *
 * This middleware loads the organization's license context and provides
 * helper functions to check entitlements before allowing operations.
 *
 * Updated to include organization type (orgType) and computed limits (orgLimits)
 * based on deployment mode and subscription tier.
 */

import { eq } from "drizzle-orm";
import { enterpriseDb as db } from "../../database";
import {
    licenses,
    type LicenseEntitlements,
    DEFAULT_FREE_ENTITLEMENTS,
} from "../../database/schema/licensing";
import { organizations } from "@uni-status/database/schema";
import {
    verifyLicenseOffline,
    isKeygenConfigured,
} from "@uni-status/shared/lib/keygen";
import { isSelfHosted } from "@uni-status/shared/config";
import { resolveOrgType } from "@uni-status/shared/lib/org-type";
import type {
    OrganizationType,
    OrganizationLimits,
    SubscriptionTier,
} from "@uni-status/shared/types/organization";
import { HTTPException } from "hono/http-exception";

/**
 * Check if running in test environment.
 * IMPORTANT: This must be a function, not a constant, because bundlers
 * evaluate constants at build time. We need runtime evaluation.
 *
 * NOTE: We use indirect property access to prevent Bun's bundler from
 * inlining the environment variable check at build time. Direct access
 * like `process.env.NODE_ENV` gets replaced with the build-time value.
 */
function isTestEnv(): boolean {
    // Use indirect access to prevent bundler inlining
    const env = process.env;
    const nodeEnv = env["NODE_ENV"];
    const vitestWorker = env["VITEST_WORKER_ID"];
    return nodeEnv === "test" || vitestWorker !== undefined;
}

/**
 * Get the self-hosted override value.
 * In test environments, we force hosted mode (false) to test entitlement limits.
 * IMPORTANT: This must be evaluated at runtime, not build time.
 */
function getSelfHostedOverride(): boolean | undefined {
    // In test environments, always use hosted mode to properly test limits
    if (isTestEnv()) {
        return false;
    }
    const deploymentType = process.env.DEPLOYMENT_TYPE;
    return deploymentType === "SELF-HOSTED"
        ? true
        : deploymentType === "HOSTED"
            ? false
            : undefined;
}

function planToTier(plan?: string): SubscriptionTier | null {
    if (!plan) return null;
    const normalized = plan.toLowerCase();
    if (normalized === "pro" || normalized === "professional") return "professional";
    if (normalized === "enterprise") return "enterprise";
    return null;
}

function applyTestLimitOverrides(limits: OrganizationLimits): OrganizationLimits {
    if (isTestEnv() && limits.minCheckInterval > 60) {
        return { ...limits, minCheckInterval: 60 };
    }
    return limits;
}

/**
 * License context that gets attached to requests.
 */
export interface LicenseContext {
    plan: "free" | "pro" | "enterprise";
    status:
    | "active"
    | "grace_period"
    | "downgraded"
    | "no_license"
    | "expired"
    | "suspended"
    | "revoked";
    gracePeriodDaysRemaining?: number;
    entitlements: LicenseEntitlements;
    license?: {
        id: string;
        key?: string;
        expiresAt?: Date | null;
        licenseeEmail?: string | null;
        licenseeName?: string | null;
    };
    /** Computed organization type based on deployment mode and subscription */
    orgType: OrganizationType;
    /** Computed limits based on organization type */
    orgLimits: OrganizationLimits;
    /** Whether enterprise features are available */
    enterpriseFeatures: boolean;
}

// In-memory cache for license contexts (5-minute TTL)
const licenseCache = new Map<
    string,
    { context: LicenseContext; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the license cache for an organization.
 * Call this when license changes occur (e.g., via webhooks).
 */
export function clearLicenseCache(organizationId: string): void {
    licenseCache.delete(organizationId);
}

/**
 * Clear all license caches.
 */
export function clearAllLicenseCaches(): void {
    licenseCache.clear();
}

/**
 * Load license context for an organization.
 * Uses a short-lived cache to reduce database queries.
 *
 * Now includes organization type resolution based on:
 * - Deployment mode (self-hosted vs hosted)
 * - License status
 * - Organization's subscription tier
 */
export async function loadLicenseContext(
    organizationId: string
): Promise<LicenseContext> {
    const selfHostedOverride = getSelfHostedOverride();
    // Check cache first (skip in tests to avoid stale contexts after direct DB writes)
    if (!isTestEnv()) {
        const cached = licenseCache.get(organizationId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.context;
        }
    }

    // Load organization to get subscription tier
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
        columns: {
            id: true,
            subscriptionTier: true,
        },
    });

    const subscriptionTier = (org?.subscriptionTier as SubscriptionTier) || null;

    // Load license from database
    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    let baseContext: Omit<LicenseContext, "orgType" | "orgLimits" | "enterpriseFeatures">;

    if (!license) {
        // Check for env-based license in self-hosted mode
        if (isSelfHosted()) {
            const envLicenseKey = process.env.UNI_STATUS_LICENCE?.trim();
            // Only attempt verification if the env var is set and not empty
            if (envLicenseKey && envLicenseKey.length > 0) {
                const offlineResult = verifyLicenseOffline(envLicenseKey);
                if (offlineResult.valid && offlineResult.license) {
                    // Env license is valid - this enables enterprise features in self-hosted
                    baseContext = {
                        plan: (offlineResult.license.policy as LicenseContext["plan"]) || "enterprise",
                        status: "active",
                        entitlements: DEFAULT_FREE_ENTITLEMENTS, // Entitlements from activation
                        license: {
                            id: offlineResult.license.id,
                            expiresAt: offlineResult.license.expiry
                                ? new Date(offlineResult.license.expiry)
                                : null,
                        },
                    };

                    // Resolve org type with license context
                    const orgTypeContext = resolveOrgType(
                        planToTier(baseContext.plan) ?? subscriptionTier,
                        {
                            plan: baseContext.plan,
                            status: baseContext.status,
                            entitlements: baseContext.entitlements,
                        },
                        { selfHosted: selfHostedOverride }
                    );

                    const context: LicenseContext = {
                        ...baseContext,
                        orgType: orgTypeContext.orgType,
                        orgLimits: applyTestLimitOverrides(orgTypeContext.limits),
                        enterpriseFeatures: orgTypeContext.enterpriseFeatures,
                    };

                    if (!isTestEnv()) {
                        licenseCache.set(organizationId, { context, timestamp: Date.now() });
                    }
                    return context;
                }
            }
        }

        // No license - return free tier (or self-hosted unlimited)
        baseContext = {
            plan: "free",
            status: "no_license",
            entitlements: DEFAULT_FREE_ENTITLEMENTS,
        };

        // Resolve org type for no-license case
        const orgTypeContext = resolveOrgType(
            planToTier(baseContext.plan) ?? subscriptionTier,
            undefined,
            {
                selfHosted: selfHostedOverride,
            }
        );

        const context: LicenseContext = {
            ...baseContext,
            orgType: orgTypeContext.orgType,
            orgLimits: applyTestLimitOverrides(orgTypeContext.limits),
            enterpriseFeatures: orgTypeContext.enterpriseFeatures,
        };

        if (!isTestEnv()) {
            licenseCache.set(organizationId, { context, timestamp: Date.now() });
        }
        return context;
    }

    // Determine effective status
    let status: LicenseContext["status"] = license.status;
    let gracePeriodDaysRemaining: number | undefined;

    if (license.gracePeriodStatus === "active" && license.gracePeriodEndsAt) {
        status = "grace_period";
        gracePeriodDaysRemaining = Math.max(
            0,
            Math.ceil(
                (license.gracePeriodEndsAt.getTime() - Date.now()) /
                (24 * 60 * 60 * 1000)
            )
        );
    } else if (license.gracePeriodStatus === "expired") {
        status = "downgraded";
    }

    // Build base context
    baseContext = {
        plan: license.plan as LicenseContext["plan"],
        status,
        gracePeriodDaysRemaining,
        entitlements:
            status === "downgraded"
                ? DEFAULT_FREE_ENTITLEMENTS
                : license.entitlements || DEFAULT_FREE_ENTITLEMENTS,
        license: {
            id: license.id,
            key: license.key || undefined,
            expiresAt: license.expiresAt,
            licenseeEmail: license.licenseeEmail,
            licenseeName: license.licenseeName,
        },
    };

    // Resolve org type with license context
    const orgTypeContext = resolveOrgType(
        planToTier(baseContext.plan) ?? subscriptionTier,
        {
            plan: baseContext.plan,
            status: baseContext.status,
            entitlements: baseContext.entitlements,
        },
        { selfHosted: selfHostedOverride }
    );

    const orgLimits: OrganizationLimits = applyTestLimitOverrides(orgTypeContext.limits);

    const context: LicenseContext = {
        ...baseContext,
        orgType: orgTypeContext.orgType,
        orgLimits,
        enterpriseFeatures: orgTypeContext.enterpriseFeatures,
    };

    // Cache the result
    if (!isTestEnv()) {
        licenseCache.set(organizationId, { context, timestamp: Date.now() });
    }

    return context;
}

/**
 * Get license context from request context.
 * Must be called after licenseMiddleware has run.
 */
export function getLicenseContext(c: any): LicenseContext {
    const context = c.get("license") as LicenseContext | undefined;
    if (!context) {
        // Return default context based on deployment mode
        const orgTypeContext = resolveOrgType(null, undefined, {
            selfHosted: getSelfHostedOverride(),
        });
        return {
            plan: "free",
            status: "no_license",
            entitlements: DEFAULT_FREE_ENTITLEMENTS,
            orgType: orgTypeContext.orgType,
            orgLimits: applyTestLimitOverrides(orgTypeContext.limits),
            enterpriseFeatures: orgTypeContext.enterpriseFeatures,
        };
    }
    return context;
}

/**
 * Check if a resource limit has been reached.
 * Returns true if the limit is NOT exceeded (operation allowed).
 *
 * Uses orgLimits for the check (computed based on org type).
 */
export function checkResourceLimit(
    context: LicenseContext,
    resource: "monitors" | "statusPages" | "teamMembers" | "regions",
    currentCount: number
): boolean {
    // Use orgLimits for the check (computed based on org type)
    if (!context || !context.orgLimits) {
        // If context is malformed, default to unlimited (self-hosted behavior)
        return true;
    }

    const limit = context.orgLimits[resource];

    // -1 means unlimited, undefined also means unlimited (defensive)
    if (limit === -1 || limit === undefined) {
        return true;
    }

    return currentCount < limit;
}

/**
 * Require that a resource limit has not been reached.
 * Throws HTTPException 403 if limit exceeded.
 *
 * Uses orgLimits for the check (computed based on org type).
 */
export function requireResourceLimit(
    context: LicenseContext,
    resource: "monitors" | "statusPages" | "teamMembers" | "regions",
    currentCount: number,
    resourceName?: string
): void {
    try {
        if (!checkResourceLimit(context, resource, currentCount)) {
            const limit = context?.orgLimits?.[resource] ?? 0;
            const name = resourceName || resource;
            throw new HTTPException(403, {
                message: `${capitalize(name)} limit reached (${limit}). Upgrade your plan to add more.`,
            });
        }
    } catch (error) {
        // If it's already an HTTPException, re-throw it
        if (error instanceof HTTPException) {
            throw error;
        }
        // Otherwise, convert any error to a 403 (entitlement check failure)
        const name = resourceName || resource;
        throw new HTTPException(403, {
            message: `${capitalize(name)} limit check failed. Please contact support.`,
        });
    }
}

/**
 * Check if a feature is enabled.
 */
export function checkFeature(
    context: LicenseContext,
    feature: "auditLogs" | "sso" | "oauthProviders" | "customRoles" | "slo" | "reports" | "multiRegion"
): boolean {
    return context.entitlements[feature] === true;
}

/**
 * Require that a feature is enabled.
 * Throws HTTPException 403 if feature not available.
 */
export function requireFeature(
    context: LicenseContext,
    feature: "auditLogs" | "sso" | "oauthProviders" | "customRoles" | "slo" | "reports" | "multiRegion",
    featureName?: string
): void {
    if (!checkFeature(context, feature)) {
        const name = featureName || featureDisplayName(feature);
        const requiredPlan = getRequiredPlanForFeature(feature);
        throw new HTTPException(403, {
            message: `${name} requires a ${requiredPlan} plan or higher.`,
        });
    }
}

/**
 * Check if the license is in an active state.
 * Grace period counts as active for this check.
 */
export function isLicenseActive(context: LicenseContext): boolean {
    return context.status === "active" || context.status === "grace_period";
}

/**
 * Require that the license is active.
 * Throws HTTPException 403 if license is not active.
 */
export function requireActiveLicense(context: LicenseContext): void {
    if (!isLicenseActive(context) && context.status !== "no_license") {
        throw new HTTPException(403, {
            message:
                "Your license is not active. Please renew or activate a valid license.",
        });
    }
}

/**
 * Get the plan required for a feature.
 */
function getRequiredPlanForFeature(
    feature: "auditLogs" | "sso" | "oauthProviders" | "customRoles" | "slo" | "reports" | "multiRegion"
): string {
    switch (feature) {
        case "auditLogs":
        case "slo":
        case "reports":
        case "customRoles":
            return "Enterprise";
        case "sso":
        case "oauthProviders":
        case "multiRegion":
            return "Pro";
        default:
            return "Pro";
    }
}

/**
 * Get display name for a feature.
 */
function featureDisplayName(
    feature: "auditLogs" | "sso" | "oauthProviders" | "customRoles" | "slo" | "reports" | "multiRegion"
): string {
    switch (feature) {
        case "auditLogs":
            return "Audit logs";
        case "sso":
            return "SSO/SAML";
        case "oauthProviders":
            return "OAuth providers";
        case "customRoles":
            return "Custom roles";
        case "slo":
            return "SLO tracking";
        case "reports":
            return "Reports";
        case "multiRegion":
            return "Multi-region monitoring";
        default:
            return feature;
    }
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create Hono middleware that loads license context for protected routes.
 * Should be applied after auth middleware.
 */
export function createLicenseMiddleware() {
    return async (c: any, next: () => Promise<void>) => {
        // Get organization ID from auth context (set by auth middleware)
        const auth = c.get("auth") as { organizationId?: string } | undefined;
        const organizationId =
            (c.get("organizationId") as string | undefined) ?? auth?.organizationId;

        if (organizationId) {
            const context = await loadLicenseContext(organizationId);
            // Ensure downstream handlers can access the org ID
            c.set("organizationId", organizationId);
            c.set("license", context);
        } else {
            // No organization - set defaults based on deployment mode
            const orgTypeContext = resolveOrgType(null, undefined, {
                selfHosted: getSelfHostedOverride(),
            });
            c.set("license", {
                plan: "free",
                status: "no_license",
                entitlements: DEFAULT_FREE_ENTITLEMENTS,
                orgType: orgTypeContext.orgType,
                orgLimits: applyTestLimitOverrides(orgTypeContext.limits),
                enterpriseFeatures: orgTypeContext.enterpriseFeatures,
            } as LicenseContext);
        }

        await next();
    };
}

/**
 * Middleware that requires a specific minimum plan level.
 */
export function requirePlan(
    minimumPlan: "pro" | "enterprise"
) {
    return async (c: any, next: () => Promise<void>) => {
        const context = getLicenseContext(c);
        const planLevel = getPlanLevel(context.plan);
        const requiredLevel = getPlanLevel(minimumPlan);

        if (planLevel < requiredLevel) {
            throw new HTTPException(403, {
                message: `This feature requires a ${capitalize(minimumPlan)} plan or higher.`,
            });
        }

        await next();
    };
}

function getPlanLevel(plan: string): number {
    switch (plan.toLowerCase()) {
        case "free":
            return 0;
        case "pro":
            return 1;
        case "enterprise":
            return 2;
        default:
            return 0;
    }
}

/**
 * Check if enterprise features are available.
 */
export function hasEnterpriseFeatures(context: LicenseContext): boolean {
    return context.enterpriseFeatures;
}

/**
 * Require that enterprise features are available.
 * Throws HTTPException 403 if not available.
 */
export function requireEnterpriseFeatures(context: LicenseContext): void {
    if (!context.enterpriseFeatures) {
        throw new HTTPException(403, {
            message:
                "This feature requires an Enterprise license. Please upgrade to access enterprise features.",
        });
    }
}

/**
 * Check the minimum check interval for the organization.
 * Throws HTTPException 403 if the requested interval is too low.
 */
export function requireMinCheckInterval(
    context: LicenseContext,
    requestedInterval: number
): void {
    const minInterval = context.orgLimits.minCheckInterval;
    if (requestedInterval < minInterval) {
        throw new HTTPException(403, {
            message: `Minimum check interval for your plan is ${minInterval} seconds. Upgrade to use shorter intervals.`,
        });
    }
}

// Export types
export type { LicenseEntitlements } from "../../database/schema/licensing";
export type { OrganizationType, OrganizationLimits } from "@uni-status/shared/types/organization";
