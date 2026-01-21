/**
 * License Management Routes
 *
 * These routes handle license activation, validation, and management.
 * Used by both hosted and self-hosted deployments.
 *
 * For self-hosted: Full license activation/deactivation flow
 * For hosted: View-only license status (management via billing routes)
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { enterpriseDb as db } from "../../database";
import {
    licenses,
    licenseValidations,
    billingEvents,
    type LicenseEntitlements,
    DEFAULT_FREE_ENTITLEMENTS,
} from "../../database/schema/licensing";
import { organizations } from "@uni-status/database";
import { requireOrganization, requireRole } from "../middleware/auth";
import {
    validateLicenseOnline,
    verifyLicenseOffline,
    verifyLicenseFileCertificate,
    readLicenseFromEnvOrFile,
    getLicenseEntitlements,
    mapKeygenEntitlements,
    mapKeygenLicenseStatus,
    getPortalUrl,
    activateMachine,
    deactivateMachine,
    getLicenseMachines,
    isKeygenConfigured,
    initKeygenConfig,
} from "@uni-status/shared/lib/keygen";
import { isSelfHosted } from "@uni-status/shared/config";
import { resolveOrgType } from "@uni-status/shared/lib/org-type";
import { KEYGEN_POLICY_IDS } from "@uni-status/licensing";
import { createHash } from "crypto";
import { hostname } from "os";

/**
 * Get the entitlements to display based on deployment mode.
 * In self-hosted mode, we return unlimited limits and all features enabled.
 * In hosted mode, we return the license entitlements or free defaults.
 */
function getDisplayEntitlements(
    licenseEntitlements: LicenseEntitlements | null | undefined,
    hasEnterpriseLicense: boolean = false
): LicenseEntitlements {
    if (isSelfHosted()) {
        // Self-hosted mode always gets unlimited resources and ALL features
        // The deployment itself is enterprise - no cloud restrictions
        return {
            monitors: -1, // Unlimited
            statusPages: -1, // Unlimited
            teamMembers: -1, // Unlimited
            regions: -1, // Unlimited
            auditLogs: true, // Always enabled in self-hosted
            sso: true, // Always enabled in self-hosted
            oauthProviders: true, // Always enabled in self-hosted
            customRoles: true, // Always enabled in self-hosted
            slo: true, // Always enabled in self-hosted
            reports: true, // Always enabled in self-hosted
            multiRegion: true, // Always enabled in self-hosted
            oncall: true, // Always enabled in self-hosted
        };
    }
    // Hosted mode: use license entitlements or free defaults
    return licenseEntitlements || DEFAULT_FREE_ENTITLEMENTS;
}

export const licenseRoutes = new OpenAPIHono();

/**
 * Generate a machine fingerprint for this deployment.
 * Used to bind licenses to specific installations.
 */
function generateMachineFingerprint(): string {
    const data = [
        hostname(),
        process.env.DATABASE_URL?.split("@")[1] || "unknown-db",
        process.env.UNI_STATUS_WEB_URL || "unknown-web",
    ].join("|");

    return createHash("sha256").update(data).digest("hex").substring(0, 32);
}

/**
 * GET /api/v1/license
 *
 * Get the current license status and entitlements.
 * Works for both hosted and self-hosted deployments.
 */
licenseRoutes.get("/", async (c) => {
    const organizationId = await requireOrganization(c);
    await requireRole(c, ["admin", "owner"]);

    // Get the organization's license
    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    // For self-hosted without a DB license, check env var and auto-activate
    if (!license && isSelfHosted()) {
        const envLicenseKey = process.env.UNI_STATUS_LICENCE;
        if (envLicenseKey) {
            // Auto-activate the env license
            try {
                const activationResult = await autoActivateEnvLicense(organizationId, envLicenseKey);
                if (activationResult.success) {
                    // Fetch the newly created license
                    const newLicense = await db.query.licenses.findFirst({
                        where: eq(licenses.organizationId, organizationId),
                    });
                    if (newLicense) {
                        return c.json({
                            success: true,
                            data: {
                                hasLicense: true,
                                plan: newLicense.plan,
                                status: "active",
                                source: "environment",
                                entitlements: getDisplayEntitlements(newLicense.entitlements, true),
                                gracePeriod: null,
                                license: {
                                    id: newLicense.id,
                                    name: newLicense.name,
                                    expiresAt: newLicense.expiresAt?.toISOString() || null,
                                    licenseeEmail: newLicense.licenseeEmail,
                                    licenseeName: newLicense.licenseeName,
                                    activated: true,
                                    activatedAt: newLicense.activatedAt?.toISOString() || null,
                                    machineId: newLicense.machineId,
                                    createdAt: newLicense.createdAt.toISOString(),
                                },
                                validation: {
                                    lastValidatedAt: newLicense.lastValidatedAt?.toISOString() || null,
                                    result: newLicense.lastValidationResult,
                                },
                            },
                        });
                    }
                } else {
                    // Activation failed - log and return error info
                    console.error("[License] Auto-activation failed:", activationResult.error);
                    return c.json({
                        success: true,
                        data: {
                            hasLicense: false,
                            plan: isSelfHosted() ? "self-hosted" : "free",
                            status: "activation_failed",
                            source: "environment",
                            entitlements: getDisplayEntitlements(null, false),
                            gracePeriod: null,
                            license: null,
                            validation: null,
                            activationError: activationResult.error,
                        },
                    });
                }
            } catch (error) {
                console.error("[License] Auto-activation of env license threw exception:", error);
                // Return info that env license exists but failed to activate
                return c.json({
                    success: true,
                    data: {
                        hasLicense: false,
                        plan: isSelfHosted() ? "self-hosted" : "free",
                        status: "activation_failed",
                        source: "environment",
                        entitlements: getDisplayEntitlements(null, false),
                        gracePeriod: null,
                        license: null,
                        validation: null,
                        activationError: error instanceof Error ? error.message : "Unknown error",
                    },
                });
            }
        }
    }

    if (!license) {
        return c.json({
            success: true,
            data: {
                hasLicense: false,
                plan: isSelfHosted() ? "self-hosted" : "free",
                status: "no_license",
                entitlements: getDisplayEntitlements(null, false),
                gracePeriod: null,
                license: null,
                validation: null,
            },
        });
    }

    // Calculate grace period info
    let gracePeriod = null;
    if (license.gracePeriodStatus === "active" && license.gracePeriodEndsAt) {
        const daysRemaining = Math.max(
            0,
            Math.ceil(
                (license.gracePeriodEndsAt.getTime() - Date.now()) /
                (24 * 60 * 60 * 1000)
            )
        );
        gracePeriod = {
            status: license.gracePeriodStatus,
            startedAt: license.gracePeriodStartedAt?.toISOString() || null,
            endsAt: license.gracePeriodEndsAt.toISOString(),
            daysRemaining,
        };
    }

    // Determine effective status
    let effectiveStatus = license.status;
    if (license.gracePeriodStatus === "active") {
        effectiveStatus = "grace_period" as any;
    } else if (license.gracePeriodStatus === "expired") {
        effectiveStatus = "downgraded" as any;
    }

    // Check if this is an active license for enterprise features
    const hasActiveLicense = license.status === "active" || license.gracePeriodStatus === "active";

    return c.json({
        success: true,
        data: {
            hasLicense: true,
            plan: license.plan,
            status: effectiveStatus,
            entitlements: getDisplayEntitlements(license.entitlements, hasActiveLicense),
            gracePeriod,
            // Top-level gracePeriodDaysRemaining for convenience
            gracePeriodDaysRemaining: gracePeriod?.daysRemaining ?? null,
            license: {
                id: license.id,
                name: license.name,
                expiresAt: license.expiresAt?.toISOString() || null,
                licenseeEmail: license.licenseeEmail,
                licenseeName: license.licenseeName,
                activated: !!license.activatedAt,
                activatedAt: license.activatedAt?.toISOString() || null,
                machineId: license.machineId,
                createdAt: license.createdAt.toISOString(),
            },
            validation: {
                lastValidatedAt: license.lastValidatedAt?.toISOString() || null,
                result: license.lastValidationResult,
                failureCount: license.validationFailureCount,
            },
        },
    });
});

/**
 * POST /api/v1/license/activate
 *
 * Activate a license key for this deployment (self-hosted only).
 * Validates the license with Keygen.sh and binds it to this machine.
 */
licenseRoutes.post("/activate", async (c) => {
    const organizationId = await requireOrganization(c);
    await requireRole(c, ["owner"]);

    if (!isSelfHosted()) {
        return c.json(
            {
                success: false,
                error:
                    "License activation is only available for self-hosted deployments",
            },
            400
        );
    }

    if (!isKeygenConfigured()) {
        return c.json(
            {
                success: false,
                error: "License system not configured",
            },
            503
        );
    }

    const body = await c.req.json();
    const licenseKey = body.licenseKey as string;

    if (!licenseKey || typeof licenseKey !== "string") {
        return c.json(
            {
                success: false,
                error: "License key is required",
            },
            400
        );
    }

    // Check if org already has a license
    const existingLicense = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    if (existingLicense && existingLicense.status === "active") {
        return c.json(
            {
                success: false,
                error:
                    "Organization already has an active license. Deactivate it first.",
                currentLicense: {
                    plan: existingLicense.plan,
                    expiresAt: existingLicense.expiresAt?.toISOString(),
                },
            },
            409
        );
    }

    // Generate fingerprint for this deployment
    const fingerprint = generateMachineFingerprint();

    // Validate the license with Keygen.sh
    // NOTE: Do NOT pass fingerprint here - we're activating for the first time,
    // so the machine doesn't exist yet. Passing fingerprint would cause NO_MACHINE error.
    const validationResult = await validateLicenseOnline(licenseKey);

    if (!validationResult.valid) {
        // Record failed validation attempt
        if (existingLicense) {
            await db.insert(licenseValidations).values({
                id: nanoid(),
                licenseId: existingLicense.id,
                validationType: "activation",
                success: false,
                errorCode: validationResult.code,
                errorMessage: validationResult.detail,
                responseCode: 400,
                machineFingerprint: fingerprint,
                validatedAt: new Date(),
            });
        }

        return c.json(
            {
                success: false,
                error: "License validation failed",
                code: validationResult.code,
                detail: validationResult.detail,
            },
            400
        );
    }

    const keygenLicense = validationResult.license!;
    const keygenLicenseId = keygenLicense.id;

    // Activate machine with Keygen.sh
    let machine;
    try {
        machine = await activateMachine(keygenLicenseId, fingerprint, {
            name: `Uni-Status (${hostname()})`,
            hostname: hostname(),
            platform: process.platform,
            metadata: {
                organizationId,
                webUrl: process.env.UNI_STATUS_WEB_URL,
            },
            licenseKey, // Pass license key for auth in self-hosted mode
        });
    } catch (error) {
        console.error("[License] Machine activation failed:", error);
        return c.json(
            {
                success: false,
                error: "Failed to activate machine",
                detail: error instanceof Error ? error.message : "Unknown error",
            },
            500
        );
    }

    // Fetch entitlements
    let entitlements: LicenseEntitlements = DEFAULT_FREE_ENTITLEMENTS;
    if (validationResult.entitlements) {
        entitlements = mapKeygenEntitlements(validationResult.entitlements);
    } else {
        try {
            const keygenEntitlements = await getLicenseEntitlements(keygenLicenseId);
            entitlements = mapKeygenEntitlements(keygenEntitlements);
        } catch (error) {
            console.error("[License] Failed to fetch entitlements:", error);
        }
    }

    // Determine plan from license
    const plan = determinePlanFromLicense(keygenLicense);
    const now = new Date();
    const authContext = c.get("auth");
    const userId = authContext?.user?.id ?? null;

    // Create or update license record
    if (existingLicense) {
        await db
            .update(licenses)
            .set({
                keygenLicenseId,
                keygenPolicyId: keygenLicense.relationships.policy.data?.id || null,
                key: licenseKey,
                name: keygenLicense.attributes.name,
                plan,
                status: mapKeygenLicenseStatus(keygenLicense.attributes.status),
                validFrom: new Date(keygenLicense.attributes.created),
                expiresAt: keygenLicense.attributes.expiry
                    ? new Date(keygenLicense.attributes.expiry)
                    : null,
                entitlements,
                gracePeriodStatus: "none",
                gracePeriodStartedAt: null,
                gracePeriodEndsAt: null,
                gracePeriodEmailsSent: [],
                machineId: machine.id,
                machineFingerprint: fingerprint,
                activatedAt: now,
                activatedBy: userId,
                lastValidatedAt: now,
                lastValidationResult: "success",
                validationFailureCount: 0,
                licenseeEmail:
                    (keygenLicense.attributes.metadata.email as string) || null,
                licenseeName:
                    (keygenLicense.attributes.metadata.name as string) ||
                    keygenLicense.attributes.name ||
                    null,
                metadata: keygenLicense.attributes.metadata,
                updatedAt: now,
            })
            .where(eq(licenses.id, existingLicense.id));

        await createBillingEvent(
            organizationId,
            existingLicense.id,
            "license_activated",
            nanoid(),
            "system",
            { status: existingLicense.status },
            { status: "active", plan, machineId: machine.id }
        );
    } else {
        const licenseId = nanoid();

        await db.insert(licenses).values({
            id: licenseId,
            organizationId,
            keygenLicenseId,
            keygenPolicyId: keygenLicense.relationships.policy.data?.id || null,
            key: licenseKey,
            name: keygenLicense.attributes.name,
            plan,
            status: mapKeygenLicenseStatus(keygenLicense.attributes.status),
            validFrom: new Date(keygenLicense.attributes.created),
            expiresAt: keygenLicense.attributes.expiry
                ? new Date(keygenLicense.attributes.expiry)
                : null,
            entitlements,
            gracePeriodStatus: "none",
            machineId: machine.id,
            machineFingerprint: fingerprint,
            activatedAt: now,
            activatedBy: userId,
            lastValidatedAt: now,
            lastValidationResult: "success",
            validationFailureCount: 0,
            licenseeEmail:
                (keygenLicense.attributes.metadata.email as string) || null,
            licenseeName:
                (keygenLicense.attributes.metadata.name as string) ||
                keygenLicense.attributes.name ||
                null,
            metadata: keygenLicense.attributes.metadata,
            createdAt: now,
            updatedAt: now,
        });

        await createBillingEvent(
            organizationId,
            licenseId,
            "license_activated",
            nanoid(),
            "system",
            null,
            { plan, machineId: machine.id }
        );
    }

    // Record successful validation
    const licenseRecord = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    if (licenseRecord) {
        await db.insert(licenseValidations).values({
            id: nanoid(),
            licenseId: licenseRecord.id,
            validationType: "activation",
            success: true,
            responseCode: 200,
            machineFingerprint: fingerprint,
            validatedAt: now,
        });
    }

    return c.json({
        success: true,
        data: {
            activated: true,
            plan,
            entitlements,
            license: {
                id: licenseRecord?.id,
                name: keygenLicense.attributes.name,
                expiresAt: keygenLicense.attributes.expiry,
            },
            machine: {
                id: machine.id,
                fingerprint,
            },
        },
    });
});

/**
 * POST /api/v1/license/validate
 *
 * Force a license validation check.
 * Attempts online validation first, falls back to offline.
 */
licenseRoutes.post("/validate", async (c) => {
    const organizationId = await requireOrganization(c);
    await requireRole(c, ["admin", "owner"]);

    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    if (!license) {
        return c.json(
            {
                success: false,
                error: "No license found",
            },
            404
        );
    }

    const now = new Date();
    let validationResult: {
        valid: boolean;
        code: string;
        detail: string;
        method: "online" | "offline";
    };

    // Try online validation first
    if (isKeygenConfigured() && license.key) {
        try {
            const onlineResult = await validateLicenseOnline(license.key, {
                fingerprint: license.machineFingerprint || undefined,
            });

            validationResult = {
                valid: onlineResult.valid,
                code: onlineResult.code,
                detail: onlineResult.detail,
                method: "online",
            };

            // Sync entitlements if valid
            if (onlineResult.valid && onlineResult.entitlements) {
                const newEntitlements = mapKeygenEntitlements(
                    onlineResult.entitlements
                );
                await db
                    .update(licenses)
                    .set({
                        entitlements: newEntitlements,
                        updatedAt: now,
                    })
                    .where(eq(licenses.id, license.id));
            }
        } catch (error) {
            console.error("[License] Online validation failed:", error);

            // Fall back to offline validation
            if (license.key) {
                const offlineResult = verifyLicenseOffline(license.key);
                validationResult = {
                    valid: offlineResult.valid,
                    code: offlineResult.code,
                    detail: offlineResult.detail,
                    method: "offline",
                };
            } else {
                validationResult = {
                    valid: false,
                    code: "NO_KEY",
                    detail: "No license key available for validation",
                    method: "offline",
                };
            }
        }
    } else if (license.key) {
        // Offline-only validation
        const offlineResult = verifyLicenseOffline(license.key);
        validationResult = {
            valid: offlineResult.valid,
            code: offlineResult.code,
            detail: offlineResult.detail,
            method: "offline",
        };
    } else {
        validationResult = {
            valid: false,
            code: "NO_KEY",
            detail: "No license key available for validation",
            method: "offline",
        };
    }

    // Update license record
    await db
        .update(licenses)
        .set({
            lastValidatedAt: now,
            lastValidationResult: validationResult.valid ? "success" : "failed",
            validationFailureCount: validationResult.valid
                ? 0
                : (license.validationFailureCount || 0) + 1,
            updatedAt: now,
        })
        .where(eq(licenses.id, license.id));

    // Record validation
    await db.insert(licenseValidations).values({
        id: nanoid(),
        licenseId: license.id,
        validationType: "manual",
        success: validationResult.valid,
        errorCode: validationResult.valid ? null : validationResult.code,
        errorMessage: validationResult.valid ? null : validationResult.detail,
        machineFingerprint: license.machineFingerprint,
        validatedAt: now,
    });

    return c.json({
        success: true,
        data: {
            valid: validationResult.valid,
            code: validationResult.code,
            detail: validationResult.detail,
            method: validationResult.method,
            validatedAt: now.toISOString(),
        },
    });
});

/**
 * POST /api/v1/license/deactivate
 *
 * Deactivate the current license (self-hosted only).
 * Removes machine binding from Keygen.sh and starts a 5-day grace period.
 * The license is kept until grace period expires to allow re-activation.
 */
licenseRoutes.post("/deactivate", async (c) => {
    const organizationId = await requireOrganization(c);
    await requireRole(c, ["owner"]);

    if (!isSelfHosted()) {
        return c.json(
            {
                success: false,
                error:
                    "License deactivation is only available for self-hosted deployments",
            },
            400
        );
    }

    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    // Return success even if no license exists (idempotent operation)
    if (!license) {
        return c.json({
            success: true,
            data: {
                deactivated: true,
                message: "No license to deactivate.",
            },
        });
    }

    // Deactivate machine with Keygen.sh
    if (license.machineId && isKeygenConfigured()) {
        try {
            await deactivateMachine(license.machineId);
        } catch (error) {
            console.error("[License] Machine deactivation failed:", error);
            // Continue with local deactivation even if Keygen fails
        }
    }

    const now = new Date();
    const gracePeriodDays = 5;
    const gracePeriodEndsAt = new Date(now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    // Check if this was an active (paid) license - if so, start grace period
    const wasActiveLicense = license.status === "active" && license.plan !== "free";

    // In non-production environments (tests/dev), simplify by removing the license immediately
    if (process.env.NODE_ENV !== "production") {
        await db.delete(licenses).where(eq(licenses.id, license.id));
        return c.json({
            success: true,
            data: {
                deactivated: true,
                message: "License deactivated.",
            },
        });
    }

    if (wasActiveLicense) {
        // Start 5-day grace period instead of immediate deletion
        await db
            .update(licenses)
            .set({
                status: "revoked",
                gracePeriodStatus: "active",
                gracePeriodStartedAt: now,
                gracePeriodEndsAt: gracePeriodEndsAt,
                gracePeriodEmailsSent: [],
                machineId: null,
                machineFingerprint: null,
                key: null, // Clear the key for security
                updatedAt: now,
            })
            .where(eq(licenses.id, license.id));

        // Create billing event for grace period start
        await createBillingEvent(
            organizationId,
            license.id,
            "grace_period_started",
            nanoid(),
            "system",
            { status: license.status, plan: license.plan, machineId: license.machineId },
            { status: "revoked", gracePeriodEndsAt: gracePeriodEndsAt.toISOString(), reason: "manual_deactivation" }
        );

        return c.json({
            success: true,
            data: {
                deactivated: true,
                gracePeriod: {
                    status: "active",
                    startsAt: now.toISOString(),
                    endsAt: gracePeriodEndsAt.toISOString(),
                    daysRemaining: gracePeriodDays,
                },
                message: `License deactivated. You have ${gracePeriodDays} days to reactivate before features are downgraded.`,
            },
        });
    }

    // For free/inactive licenses, delete immediately
    await createBillingEvent(
        organizationId,
        license.id,
        "license_revoked",
        nanoid(),
        "system",
        { status: license.status, machineId: license.machineId },
        { status: "revoked", reason: "manual_deactivation" }
    );

    await db.delete(licenses).where(eq(licenses.id, license.id));

    return c.json({
        success: true,
        data: {
            deactivated: true,
            message: "License deactivated. You can reactivate with a new license key.",
        },
    });
});

/**
 * GET /api/v1/license/portal
 *
 * Get the portal URL for license management.
 * - Self-hosted: Returns Keygen portal for license key management
 * - Hosted: Returns landing portal for billing management
 */
licenseRoutes.get("/portal", async (c) => {
    const organizationId = await requireOrganization(c);
    await requireRole(c, ["admin", "owner"]);

    // For hosted deployments, redirect to landing portal
    // Always points to the official Unified Projects landing page
    if (!isSelfHosted()) {
        const billingUrl = `https://status.unified.sh/portal?tab=billing&org=${organizationId}`;

        return c.json({
            success: true,
            data: {
                url: billingUrl,
            },
        });
    }

    // For self-hosted, use Keygen portal for license key management
    if (!isKeygenConfigured()) {
        return c.json(
            {
                success: false,
                error: "License system not configured",
            },
            503
        );
    }

    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
        columns: { key: true },
    });

    const portalUrl = getPortalUrl(license?.key || undefined);

    return c.json({
        success: true,
        data: {
            url: portalUrl,
        },
    });
});

/**
 * GET /api/v1/license/validations
 *
 * Get license validation history.
 */
licenseRoutes.get("/validations", async (c) => {
    const organizationId = await requireOrganization(c);
    await requireRole(c, ["admin", "owner"]);

    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
        columns: { id: true },
    });

    if (!license) {
        return c.json({
            success: true,
            data: { validations: [], meta: { total: 0, limit: 50, offset: 0 } },
        });
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
    const offset = parseInt(c.req.query("offset") || "0");

    const { desc } = await import("drizzle-orm");

    const validations = await db.query.licenseValidations.findMany({
        where: eq(licenseValidations.licenseId, license.id),
        orderBy: desc(licenseValidations.validatedAt),
        limit,
        offset,
    });

    const allValidations = await db.query.licenseValidations.findMany({
        where: eq(licenseValidations.licenseId, license.id),
        columns: { id: true },
    });

    return c.json({
        success: true,
        data: {
            validations: validations.map((v) => ({
                id: v.id,
                type: v.validationType,
                success: v.success,
                errorCode: v.errorCode,
                errorMessage: v.errorMessage,
                validatedAt: v.validatedAt.toISOString(),
            })),
            meta: {
                total: allValidations.length,
                limit,
                offset,
                hasMore: offset + validations.length < allValidations.length,
            },
        },
    });
});

// ==========================================
// Helper Functions
// ==========================================

/**
 * Auto-activate a license from environment variable.
 * This is called on first GET /api/v1/license when UNI_STATUS_LICENCE is set.
 *
 * Supports three license formats:
 * 1. License key (e.g., "XXXXXX-XXXXXX-XXXXXX") - requires online activation
 * 2. Signed license key (e.g., "key/...") - offline verification
 * 3. License file certificate (BEGIN LICENSE FILE) - offline verification
 */
async function autoActivateEnvLicense(
    organizationId: string,
    envValue: string
): Promise<{ success: boolean; error?: string }> {
    // Check if org already has a license
    const existingLicense = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    if (existingLicense && existingLicense.status === "active") {
        // Already has an active license, nothing to do
        return { success: true };
    }

    // Read and determine license type
    const licenseData = readLicenseFromEnvOrFile(envValue);
    console.log(`[License] Detected license type: ${licenseData.type}`);

    const fingerprint = generateMachineFingerprint();
    const now = new Date();

    // Handle certificate-style license files (offline)
    if (licenseData.type === "certificate") {
        console.log(`[License] Verifying license file certificate...`);
        const certResult = verifyLicenseFileCertificate(licenseData.content);
        console.log(`[License] Certificate verification result: ${certResult.code} - ${certResult.detail}`);

        if (!certResult.valid) {
            console.error(`[License] Certificate verification FAILED: ${certResult.code} - ${certResult.detail}`);
            return {
                success: false,
                error: `License file verification failed: ${certResult.code} - ${certResult.detail}`,
            };
        }

        const licenseInfo = certResult.license!;

        // Map entitlements from certificate
        let entitlements: LicenseEntitlements = DEFAULT_FREE_ENTITLEMENTS;
        if (licenseInfo.entitlements && licenseInfo.entitlements.length > 0) {
            // Convert certificate entitlements to our format
            const keygenEntitlements = licenseInfo.entitlements.map(e => ({
                id: e.id,
                type: "entitlements" as const,
                attributes: {
                    name: e.code,
                    code: e.code,
                    created: now.toISOString(),
                    updated: now.toISOString(),
                    metadata: e.metadata,
                },
            }));
            entitlements = mapKeygenEntitlements(keygenEntitlements);
        }

        // Determine plan from policy ID or metadata
        let plan = "pro";
        if (licenseInfo.policy) {
            if (licenseInfo.policy === KEYGEN_POLICY_IDS.ENTERPRISE) plan = "enterprise";
            else if (licenseInfo.policy === KEYGEN_POLICY_IDS.PRO) plan = "pro";
        }
        if (licenseInfo.metadata.plan && typeof licenseInfo.metadata.plan === "string") {
            plan = licenseInfo.metadata.plan;
        }

        // Create or update license record (offline - no machine activation needed)
        if (existingLicense) {
            await db
                .update(licenses)
                .set({
                    keygenLicenseId: licenseInfo.id,
                    keygenPolicyId: licenseInfo.policy || null,
                    key: licenseInfo.key || null,
                    name: `License (${plan})`,
                    plan,
                    status: mapKeygenLicenseStatus(licenseInfo.status as any) || "active",
                    validFrom: now,
                    expiresAt: licenseInfo.expiry ? new Date(licenseInfo.expiry) : null,
                    entitlements,
                    gracePeriodStatus: "none",
                    gracePeriodStartedAt: null,
                    gracePeriodEndsAt: null,
                    gracePeriodEmailsSent: [],
                    machineId: null, // Offline - no machine binding
                    machineFingerprint: fingerprint,
                    activatedAt: now,
                    activatedBy: null, // Auto-activated from environment
                    lastValidatedAt: now,
                    lastValidationResult: "success",
                    validationFailureCount: 0,
                    licenseeEmail: (licenseInfo.metadata.email as string) || null,
                    licenseeName: (licenseInfo.metadata.name as string) || null,
                    metadata: { ...licenseInfo.metadata, source: "environment", type: "certificate" },
                    updatedAt: now,
                })
                .where(eq(licenses.id, existingLicense.id));
        } else {
            const licenseId = nanoid();
            await db.insert(licenses).values({
                id: licenseId,
                organizationId,
                keygenLicenseId: licenseInfo.id,
                keygenPolicyId: licenseInfo.policy || null,
                key: licenseInfo.key || null,
                name: `License (${plan})`,
                plan,
                status: mapKeygenLicenseStatus(licenseInfo.status as any) || "active",
                validFrom: now,
                expiresAt: licenseInfo.expiry ? new Date(licenseInfo.expiry) : null,
                entitlements,
                gracePeriodStatus: "none",
                machineId: null,
                machineFingerprint: fingerprint,
                activatedAt: now,
                activatedBy: null, // Auto-activated from environment
                lastValidatedAt: now,
                lastValidationResult: "success",
                validationFailureCount: 0,
                licenseeEmail: (licenseInfo.metadata.email as string) || null,
                licenseeName: (licenseInfo.metadata.name as string) || null,
                metadata: { ...licenseInfo.metadata, source: "environment", type: "certificate" },
                createdAt: now,
                updatedAt: now,
            });
        }

        console.log(`[License] Activated env license (certificate) for org ${organizationId}`);
        return { success: true };
    }

    // Handle signed license keys (offline)
    if (licenseData.type === "signed_key") {
        const offlineResult = verifyLicenseOffline(licenseData.content);

        if (!offlineResult.valid) {
            return {
                success: false,
                error: `Signed license key verification failed: ${offlineResult.code} - ${offlineResult.detail}`,
            };
        }

        const licenseInfo = offlineResult.license!;

        // Determine plan
        let plan = "pro";
        if (licenseInfo.policy) {
            if (licenseInfo.policy === KEYGEN_POLICY_IDS.ENTERPRISE) plan = "enterprise";
            else if (licenseInfo.policy === KEYGEN_POLICY_IDS.PRO) plan = "pro";
        }
        if (licenseInfo.metadata.plan && typeof licenseInfo.metadata.plan === "string") {
            plan = licenseInfo.metadata.plan;
        }

        // Create or update license record
        if (existingLicense) {
            await db
                .update(licenses)
                .set({
                    keygenLicenseId: licenseInfo.id,
                    keygenPolicyId: licenseInfo.policy || null,
                    key: licenseData.content,
                    name: `License (${plan})`,
                    plan,
                    status: "active",
                    validFrom: now,
                    expiresAt: licenseInfo.expiry ? new Date(licenseInfo.expiry) : null,
                    entitlements: DEFAULT_FREE_ENTITLEMENTS, // Signed keys don't include entitlements
                    gracePeriodStatus: "none",
                    gracePeriodStartedAt: null,
                    gracePeriodEndsAt: null,
                    gracePeriodEmailsSent: [],
                    machineId: null,
                    machineFingerprint: fingerprint,
                    activatedAt: now,
                    activatedBy: null, // Auto-activated from environment
                    lastValidatedAt: now,
                    lastValidationResult: "success",
                    validationFailureCount: 0,
                    licenseeEmail: (licenseInfo.metadata.email as string) || null,
                    licenseeName: (licenseInfo.metadata.name as string) || null,
                    metadata: { ...licenseInfo.metadata, source: "environment", type: "signed_key" },
                    updatedAt: now,
                })
                .where(eq(licenses.id, existingLicense.id));
        } else {
            const licenseId = nanoid();
            await db.insert(licenses).values({
                id: licenseId,
                organizationId,
                keygenLicenseId: licenseInfo.id,
                keygenPolicyId: licenseInfo.policy || null,
                key: licenseData.content,
                name: `License (${plan})`,
                plan,
                status: "active",
                validFrom: now,
                expiresAt: licenseInfo.expiry ? new Date(licenseInfo.expiry) : null,
                entitlements: DEFAULT_FREE_ENTITLEMENTS,
                gracePeriodStatus: "none",
                machineId: null,
                machineFingerprint: fingerprint,
                activatedAt: now,
                activatedBy: null, // Auto-activated from environment
                lastValidatedAt: now,
                lastValidationResult: "success",
                validationFailureCount: 0,
                licenseeEmail: (licenseInfo.metadata.email as string) || null,
                licenseeName: (licenseInfo.metadata.name as string) || null,
                metadata: { ...licenseInfo.metadata, source: "environment", type: "signed_key" },
                createdAt: now,
                updatedAt: now,
            });
        }

        console.log(`[License] Activated env license (signed key) for org ${organizationId}`);
        return { success: true };
    }

    // Handle regular license keys (online activation required)
    const licenseKey = licenseData.content;

    if (!isKeygenConfigured()) {
        return { success: false, error: "License system not configured for online activation" };
    }

    // Validate the license with Keygen.sh (without fingerprint - we're activating for the first time)
    const validationResult = await validateLicenseOnline(licenseKey);

    if (!validationResult.valid) {
        return {
            success: false,
            error: `License validation failed: ${validationResult.code} - ${validationResult.detail}`,
        };
    }

    const keygenLicense = validationResult.license!;
    const keygenLicenseId = keygenLicense.id;

    // Activate machine with Keygen.sh using license key for auth
    const config = initKeygenConfig();
    const machineUrl = `${config.apiUrl}/v1/accounts/${config.accountId}/machines`;

    const machineResponse = await fetch(machineUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/vnd.api+json",
            Accept: "application/vnd.api+json",
            Authorization: `License ${licenseKey}`,
        },
        body: JSON.stringify({
            data: {
                type: "machines",
                attributes: {
                    fingerprint,
                    name: `Uni-Status (${hostname()})`,
                    hostname: hostname(),
                    platform: process.platform,
                    metadata: {
                        organizationId,
                        source: "env_auto_activation",
                    },
                },
                relationships: {
                    license: {
                        data: { type: "licenses", id: keygenLicenseId },
                    },
                },
            },
        }),
    });

    if (!machineResponse.ok) {
        const errorBody = await machineResponse.text();
        return {
            success: false,
            error: `Machine activation failed: ${machineResponse.status} - ${errorBody}`,
        };
    }

    const machineResult = (await machineResponse.json()) as { data: { id: string } };
    const machine = machineResult.data;

    // Fetch entitlements
    let entitlements: LicenseEntitlements = DEFAULT_FREE_ENTITLEMENTS;
    if (validationResult.entitlements) {
        entitlements = mapKeygenEntitlements(validationResult.entitlements);
    }

    // Determine plan from license
    const plan = determinePlanFromLicense(keygenLicense);

    // Create or update license record
    if (existingLicense) {
        await db
            .update(licenses)
            .set({
                keygenLicenseId,
                keygenPolicyId: keygenLicense.relationships.policy.data?.id || null,
                key: licenseKey,
                name: keygenLicense.attributes.name,
                plan,
                status: mapKeygenLicenseStatus(keygenLicense.attributes.status),
                validFrom: new Date(keygenLicense.attributes.created),
                expiresAt: keygenLicense.attributes.expiry
                    ? new Date(keygenLicense.attributes.expiry)
                    : null,
                entitlements,
                gracePeriodStatus: "none",
                gracePeriodStartedAt: null,
                gracePeriodEndsAt: null,
                gracePeriodEmailsSent: [],
                machineId: machine.id,
                machineFingerprint: fingerprint,
                activatedAt: now,
                activatedBy: null, // Auto-activated from environment
                lastValidatedAt: now,
                lastValidationResult: "success",
                validationFailureCount: 0,
                licenseeEmail:
                    (keygenLicense.attributes.metadata.email as string) || null,
                licenseeName:
                    (keygenLicense.attributes.metadata.name as string) ||
                    keygenLicense.attributes.name ||
                    null,
                metadata: { ...keygenLicense.attributes.metadata, source: "environment", type: "key" },
                updatedAt: now,
            })
            .where(eq(licenses.id, existingLicense.id));
    } else {
        const licenseId = nanoid();

        await db.insert(licenses).values({
            id: licenseId,
            organizationId,
            keygenLicenseId,
            keygenPolicyId: keygenLicense.relationships.policy.data?.id || null,
            key: licenseKey,
            name: keygenLicense.attributes.name,
            plan,
            status: mapKeygenLicenseStatus(keygenLicense.attributes.status),
            validFrom: new Date(keygenLicense.attributes.created),
            expiresAt: keygenLicense.attributes.expiry
                ? new Date(keygenLicense.attributes.expiry)
                : null,
            entitlements,
            gracePeriodStatus: "none",
            machineId: machine.id,
            machineFingerprint: fingerprint,
            activatedAt: now,
            activatedBy: null, // Auto-activated from environment
            lastValidatedAt: now,
            lastValidationResult: "success",
            validationFailureCount: 0,
            licenseeEmail:
                (keygenLicense.attributes.metadata.email as string) || null,
            licenseeName:
                (keygenLicense.attributes.metadata.name as string) ||
                keygenLicense.attributes.name ||
                null,
            metadata: { ...keygenLicense.attributes.metadata, source: "environment", type: "key" },
            createdAt: now,
            updatedAt: now,
        });
    }

    console.log(`[License] Auto-activated env license (online) for org ${organizationId}`);
    return { success: true };
}

function determinePlanFromLicense(license: {
    attributes: {
        name: string | null;
        metadata: Record<string, unknown>;
    };
    relationships: {
        policy: { data: { id: string } | null };
    };
}): string {
    const metadata = license.attributes.metadata;
    if (metadata.plan && typeof metadata.plan === "string") {
        return metadata.plan;
    }

    const policyId = license.relationships.policy.data?.id;
    if (policyId) {
        if (policyId === KEYGEN_POLICY_IDS.ENTERPRISE) return "enterprise";
        if (policyId === KEYGEN_POLICY_IDS.PRO) return "pro";
    }

    const name = (license.attributes.name || "").toLowerCase();
    if (name.includes("enterprise")) return "enterprise";
    if (name.includes("pro")) return "pro";

    return "pro";
}

async function createBillingEvent(
    organizationId: string,
    licenseId: string | null,
    eventType: (typeof billingEvents.$inferInsert)["eventType"],
    sourceEventId: string,
    source: string,
    previousState: Record<string, unknown> | null,
    newState: Record<string, unknown> | null
) {
    await db.insert(billingEvents).values({
        id: nanoid(),
        organizationId,
        licenseId,
        eventType,
        source,
        sourceEventId,
        previousState,
        newState,
        createdAt: new Date(),
    });
}

/**
 * POST /api/v1/internal/license-sync
 *
 * Internal endpoint called by the landing portal to notify the main API
 * about license changes (revocation, suspension, reinstatement).
 * This clears license caches and ensures the main app reflects the latest state.
 *
 * Protected by internal API key, not standard auth.
 */
licenseRoutes.post("/internal/license-sync", async (c) => {
    // Verify internal API key
    const authHeader = c.req.header("Authorization");
    const expectedKey = process.env.UNI_STATUS_INTERNAL_API_KEY;

    if (!expectedKey) {
        console.error("[License Sync] INTERNAL_API_KEY not configured");
        return c.json({ error: "Internal endpoint not configured" }, 503);
    }

    const providedKey = authHeader?.replace("Bearer ", "");
    if (!providedKey || providedKey !== expectedKey) {
        console.warn("[License Sync] Invalid internal API key");
        return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { event, organizationId, timestamp } = body;

    if (!event || !organizationId) {
        return c.json({ error: "Missing event or organizationId" }, 400);
    }

    console.log(
        `[License Sync] Received ${event} for org ${organizationId} at ${timestamp}`
    );

    const license = await db.query.licenses.findFirst({
        where: eq(licenses.organizationId, organizationId),
    });

    const now = new Date();

    switch (event) {
        case "license.revoked":
            // Immediate revocation - user cancelled subscription
            if (license) {
                const previousState = {
                    status: license.status,
                    entitlements: license.entitlements,
                };

                await db
                    .update(licenses)
                    .set({
                        status: "revoked",
                        gracePeriodStatus: "none",
                        gracePeriodStartedAt: null,
                        gracePeriodEndsAt: null,
                        gracePeriodEmailsSent: [],
                        entitlements: DEFAULT_FREE_ENTITLEMENTS,
                        updatedAt: now,
                    })
                    .where(eq(licenses.id, license.id));

                await createBillingEvent(
                    organizationId,
                    license.id,
                    "license_revoked",
                    `portal-sync-${Date.now()}`,
                    "portal",
                    previousState,
                    {
                        status: "revoked",
                        reason: "subscription_cancelled",
                        newEntitlements: DEFAULT_FREE_ENTITLEMENTS,
                    }
                );

                await createBillingEvent(
                    organizationId,
                    license.id,
                    "downgraded",
                    `portal-sync-${Date.now()}`,
                    "portal",
                    { plan: license.plan },
                    { plan: "free", reason: "subscription_cancelled" }
                );

                console.log(
                    `[License Sync] Revoked license ${license.id} for org ${organizationId}`
                );
            }
            break;

        case "license.suspended":
            // Payment failure - start grace period
            if (license) {
                const gracePeriodEnds = new Date(
                    now.getTime() + 5 * 24 * 60 * 60 * 1000
                );

                await db
                    .update(licenses)
                    .set({
                        status: "suspended",
                        gracePeriodStatus: "active",
                        gracePeriodStartedAt: now,
                        gracePeriodEndsAt: gracePeriodEnds,
                        updatedAt: now,
                    })
                    .where(eq(licenses.id, license.id));

                await createBillingEvent(
                    organizationId,
                    license.id,
                    "license_suspended",
                    `portal-sync-${Date.now()}`,
                    "portal",
                    { status: license.status },
                    {
                        status: "suspended",
                        gracePeriodEnds: gracePeriodEnds.toISOString(),
                        reason: "payment_failed",
                    }
                );

                console.log(
                    `[License Sync] Suspended license ${license.id} for org ${organizationId}`
                );
            }
            break;

        case "license.reinstated":
            // Payment succeeded after failure
            if (license) {
                await db
                    .update(licenses)
                    .set({
                        status: "active",
                        gracePeriodStatus: "none",
                        gracePeriodStartedAt: null,
                        gracePeriodEndsAt: null,
                        gracePeriodEmailsSent: [],
                        updatedAt: now,
                    })
                    .where(eq(licenses.id, license.id));

                await createBillingEvent(
                    organizationId,
                    license.id,
                    "license_activated",
                    `portal-sync-${Date.now()}`,
                    "portal",
                    { status: license.status, gracePeriodStatus: license.gracePeriodStatus },
                    { status: "active", reason: "payment_recovered" }
                );

                console.log(
                    `[License Sync] Reinstated license ${license.id} for org ${organizationId}`
                );
            }
            break;

        default:
            console.log(`[License Sync] Unknown event type: ${event}`);
    }

    return c.json({
        success: true,
        processed: event,
        organizationId,
    });
});
