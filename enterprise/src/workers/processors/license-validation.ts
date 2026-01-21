/**
 * License Validation Worker
 *
 * Periodically validates licenses with Keygen.sh and syncs entitlements.
 * Runs daily to ensure license state is current.
 */

import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { enterpriseDb as db } from "../../database";
import {
  licenses,
  licenseValidations,
  billingEvents,
  DEFAULT_FREE_ENTITLEMENTS,
} from "../../database/schema/licensing";
import {
  validateLicenseOnline,
  getLicenseEntitlements,
  mapKeygenEntitlements,
  mapKeygenLicenseStatus,
  verifyLicenseOffline,
  isKeygenConfigured,
} from "@uni-status/shared/lib/keygen";
import { clearLicenseCache } from "../../api/middleware/license";

export interface LicenseValidationJobData {
  licenseId?: string; // Validate specific license
  organizationId?: string; // Validate all licenses in org
  full?: boolean; // Force full validation of all licenses
}

interface ValidationResult {
  licenseId: string;
  success: boolean;
  method: "online" | "offline";
  code: string;
  detail: string;
  entitlementsUpdated: boolean;
}

/**
 * Process license validation job.
 * Validates licenses with Keygen.sh and updates local state.
 */
export async function processLicenseValidation(
  job: Job<LicenseValidationJobData>
): Promise<{ processed: number; results: ValidationResult[] }> {
  const { licenseId, organizationId, full } = job.data;

  console.log(`[LicenseValidation] Starting job ${job.id}`, {
    licenseId,
    organizationId,
    full,
  });

  // Build query conditions
  const conditions = [
    // Only validate active, expired, or suspended licenses
    ne(licenses.status, "revoked"),
  ];

  if (licenseId) {
    conditions.push(eq(licenses.id, licenseId));
  }

  if (organizationId) {
    conditions.push(eq(licenses.organizationId, organizationId));
  }

  // Get licenses to validate
  const licensesToValidate = await db.query.licenses.findMany({
    where: and(...conditions),
  });

  console.log(
    `[LicenseValidation] Found ${licensesToValidate.length} licenses to validate`
  );

  const results: ValidationResult[] = [];

  for (const license of licensesToValidate) {
    try {
      const result = await validateSingleLicense(license, full || false);
      results.push(result);

      // Update progress
      await job.updateProgress(
        Math.round((results.length / licensesToValidate.length) * 100)
      );
    } catch (error) {
      console.error(
        `[LicenseValidation] Error validating license ${license.id}:`,
        error
      );
      results.push({
        licenseId: license.id,
        success: false,
        method: "offline",
        code: "ERROR",
        detail: error instanceof Error ? error.message : "Unknown error",
        entitlementsUpdated: false,
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  console.log(
    `[LicenseValidation] Completed: ${successful}/${results.length} successful`
  );

  return { processed: results.length, results };
}

/**
 * Validate a single license.
 */
async function validateSingleLicense(
  license: typeof licenses.$inferSelect,
  forceOnline: boolean
): Promise<ValidationResult> {
  const now = new Date();
  let validationResult: {
    valid: boolean;
    code: string;
    detail: string;
    method: "online" | "offline";
    entitlements?: ReturnType<typeof mapKeygenEntitlements>;
    newStatus?: typeof license.status;
  };

  // Try online validation first if Keygen is configured
  if (isKeygenConfigured() && (forceOnline || shouldDoOnlineValidation(license))) {
    try {
      const onlineResult = await validateLicenseOnline(
        license.key!,
        license.machineFingerprint
          ? { fingerprint: license.machineFingerprint }
          : undefined
      );

      validationResult = {
        valid: onlineResult.valid,
        code: onlineResult.code,
        detail: onlineResult.detail,
        method: "online",
      };

      // Sync entitlements if valid
      if (onlineResult.valid && onlineResult.entitlements) {
        validationResult.entitlements = mapKeygenEntitlements(
          onlineResult.entitlements
        );
      } else if (onlineResult.valid && onlineResult.license) {
        // Fetch entitlements separately
        try {
          const entitlements = await getLicenseEntitlements(
            onlineResult.license.id
          );
          validationResult.entitlements = mapKeygenEntitlements(entitlements);
        } catch {
          console.warn(
            `[LicenseValidation] Could not fetch entitlements for ${license.id}`
          );
        }
      }

      // Update status based on Keygen response
      if (onlineResult.license) {
        validationResult.newStatus = mapKeygenLicenseStatus(
          onlineResult.license.attributes.status
        );
      }
    } catch (error) {
      console.warn(
        `[LicenseValidation] Online validation failed for ${license.id}, falling back to offline:`,
        error
      );

      // Fall back to offline validation
      validationResult = await performOfflineValidation(license);
    }
  } else if (license.key) {
    // Offline-only validation
    validationResult = await performOfflineValidation(license);
  } else {
    validationResult = {
      valid: false,
      code: "NO_KEY",
      detail: "No license key available for validation",
      method: "offline",
    };
  }

  // Update license record
  const updateData: Partial<typeof licenses.$inferInsert> = {
    lastValidatedAt: now,
    lastValidationResult: validationResult.valid ? "success" : "failed",
    validationFailureCount: validationResult.valid
      ? 0
      : (license.validationFailureCount || 0) + 1,
    updatedAt: now,
  };

  // Update entitlements if changed
  let entitlementsUpdated = false;
  if (validationResult.entitlements) {
    const currentEntitlements = license.entitlements || DEFAULT_FREE_ENTITLEMENTS;
    if (
      JSON.stringify(currentEntitlements) !==
      JSON.stringify(validationResult.entitlements)
    ) {
      updateData.entitlements = validationResult.entitlements;
      entitlementsUpdated = true;
    }
  }

  // Update status if changed (but don't override grace period handling)
  if (
    validationResult.newStatus &&
    validationResult.newStatus !== license.status &&
    license.gracePeriodStatus !== "active"
  ) {
    updateData.status = validationResult.newStatus;
  }

  await db
    .update(licenses)
    .set(updateData)
    .where(eq(licenses.id, license.id));

  // Clear cache for this organization
  clearLicenseCache(license.organizationId);

  // Record validation
  await db.insert(licenseValidations).values({
    id: nanoid(),
    licenseId: license.id,
    validationType: "scheduled",
    success: validationResult.valid,
    errorCode: validationResult.valid ? null : validationResult.code,
    errorMessage: validationResult.valid ? null : validationResult.detail,
    machineFingerprint: license.machineFingerprint,
    validatedAt: now,
  });

  // Record entitlement change event if updated
  if (entitlementsUpdated) {
    await db.insert(billingEvents).values({
      id: nanoid(),
      organizationId: license.organizationId,
      licenseId: license.id,
      eventType: "entitlements_synced",
      source: "system",
      previousState: { entitlements: license.entitlements },
      newState: { entitlements: validationResult.entitlements },
      createdAt: now,
    });
  }

  return {
    licenseId: license.id,
    success: validationResult.valid,
    method: validationResult.method,
    code: validationResult.code,
    detail: validationResult.detail,
    entitlementsUpdated,
  };
}

/**
 * Perform offline validation using the license key signature.
 */
async function performOfflineValidation(
  license: typeof licenses.$inferSelect
): Promise<{
  valid: boolean;
  code: string;
  detail: string;
  method: "offline";
}> {
  if (!license.key) {
    return {
      valid: false,
      code: "NO_KEY",
      detail: "No license key available",
      method: "offline",
    };
  }

  const offlineResult = verifyLicenseOffline(license.key);

  return {
    valid: offlineResult.valid,
    code: offlineResult.code,
    detail: offlineResult.detail,
    method: "offline",
  };
}

/**
 * Determine if we should do online validation.
 * Online validation is done if:
 * - License has never been validated online
 * - Last validation was more than 24 hours ago
 * - There have been validation failures
 */
function shouldDoOnlineValidation(
  license: typeof licenses.$inferSelect
): boolean {
  if (!license.lastValidatedAt) {
    return true;
  }

  const hoursSinceValidation =
    (Date.now() - license.lastValidatedAt.getTime()) / (1000 * 60 * 60);

  // Validate more frequently if there have been failures
  if (license.validationFailureCount && license.validationFailureCount > 0) {
    return hoursSinceValidation >= 6; // Every 6 hours if failing
  }

  return hoursSinceValidation >= 24; // Once per day normally
}
