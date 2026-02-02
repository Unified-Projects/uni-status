/**
 * Keygen.sh Webhook Handler
 *
 * Handles webhook events from Keygen.sh for license lifecycle management.
 * This endpoint does not use standard auth middleware - it verifies
 * Keygen.sh webhook signatures instead.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { enterpriseDb as db } from "../../database";
import {
  licenses,
  billingEvents,
  licenseValidations,
  type LicenseEntitlements,
  DEFAULT_FREE_ENTITLEMENTS,
} from "../../database/schema/licensing";
import { organizations } from "@uni-status/database";
import {
  verifyWebhookSignature,
  mapKeygenEntitlements,
  mapKeygenLicenseStatus,
  getLicenseEntitlements,
  type KeygenLicense,
  type KeygenEntitlement,
  type KeygenWebhookEventType,
} from "@uni-status/shared/lib/keygen";
import { KEYGEN_POLICY_IDS } from "@uni-status/licensing";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: 'keygen-webhooks' });

export const keygenWebhooksRoutes = new OpenAPIHono();

// Grace period configuration
const GRACE_PERIOD_DAYS = 5;

/**
 * Keygen.sh webhook event payload structure
 */
interface KeygenWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      endpoint: string;
      event: KeygenWebhookEventType;
      payload: {
        data: KeygenLicense;
        included?: KeygenEntitlement[];
        meta?: Record<string, unknown>;
      };
      status: string;
      created: string;
    };
  };
}

/**
 * POST /api/webhooks/keygen
 *
 * Main webhook endpoint for Keygen.sh events.
 * Verifies signature and processes various license events.
 */
keygenWebhooksRoutes.post("/", async (c) => {
  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Get signature from headers
  const signature = c.req.header("Keygen-Signature");

  if (!signature) {
    log.warn('Missing signature header');
    return c.json({ error: "Missing signature" }, 401);
  }

  // Verify webhook signature
  const isValid = verifyWebhookSignature(rawBody, signature);

  if (!isValid) {
    log.warn('Invalid signature');
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Parse the webhook payload
  let payload: KeygenWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    log.error({ err: error }, 'Failed to parse payload');
    return c.json({ error: "Invalid payload" }, 400);
  }

  const eventType = payload.data.attributes.event;
  const eventId = payload.data.id;
  const licenseData = payload.data.attributes.payload.data;
  const includedEntitlements =
    payload.data.attributes.payload.included?.filter(
      (item) => item.type === "entitlements"
    ) || [];

  log.info({ eventType, eventId }, 'Processing event');

  try {
    // Route to appropriate handler
    switch (eventType) {
      case "license.created":
        await handleLicenseCreated(
          licenseData,
          includedEntitlements,
          eventId,
          payload.data.attributes.payload.meta
        );
        break;

      case "license.renewed":
        await handleLicenseRenewed(licenseData, eventId);
        break;

      case "license.expired":
        await handleLicenseExpired(licenseData, eventId);
        break;

      case "license.suspended":
        await handleLicenseSuspended(licenseData, eventId);
        break;

      case "license.reinstated":
        await handleLicenseReinstated(licenseData, eventId);
        break;

      case "license.revoked":
        await handleLicenseRevoked(licenseData, eventId);
        break;

      case "license.expiring-soon":
        await handleLicenseExpiringSoon(licenseData, eventId);
        break;

      case "license.validation-succeeded":
      case "license.validated":
        await handleLicenseValidated(licenseData, true, eventId);
        break;

      case "license.validation-failed":
        await handleLicenseValidated(licenseData, false, eventId);
        break;

      case "license.entitlements-attached":
      case "license.entitlements-detached":
        await handleEntitlementsChanged(
          licenseData,
          includedEntitlements,
          eventId
        );
        break;

      case "license.updated":
        await handleLicenseUpdated(licenseData, includedEntitlements, eventId);
        break;

      case "license.deleted":
        await handleLicenseDeleted(licenseData, eventId);
        break;

      case "license.policy-changed":
        await handlePolicyChanged(licenseData, includedEntitlements, eventId);
        break;

      // Machine events - for self-hosted deployments
      case "machine.created":
        await handleMachineCreated(licenseData as any, eventId);
        break;
      case "machine.updated":
      case "machine.deleted":
      case "machine.heartbeat-ping":
      case "machine.heartbeat-pong":
      case "machine.heartbeat-dead":
      case "machine.heartbeat-reset":
        // Machine events are handled separately or logged for audit purposes
        log.info({ eventType }, 'Machine event');
        break;

      default:
        log.info({ eventType }, 'Unhandled event type');
    }

    return c.json({ success: true, event: eventType });
  } catch (error) {
    log.error({ eventType, err: error }, 'Error processing event');
    return c.json({ error: "Internal error processing webhook" }, 500);
  }
});

// ==========================================
// Event Handlers
// ==========================================

/**
 * Handle license.created event
 * Creates a new license record and links it to an organization.
 */
async function handleLicenseCreated(
  licenseData: KeygenLicense,
  entitlements: KeygenEntitlement[],
  eventId: string,
  meta?: Record<string, unknown>
) {
  const keygenLicenseId = licenseData.id;
  const licenseKey = licenseData.attributes.key;
  const licenseName = licenseData.attributes.name;
  const metadata = licenseData.attributes.metadata;

  // Get organization ID from license metadata
  const organizationId =
    (metadata.organizationId as string) ||
    (meta?.organizationId as string) ||
    null;

  if (!organizationId) {
    log.warn({ keygenLicenseId }, 'License has no organizationId in metadata');
    // For hosted mode, we may need to create org or wait for user to link
    return;
  }

  // Verify organization exists
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (!org) {
    log.error({ organizationId, keygenLicenseId }, 'Organization not found for license');
    return;
  }

  // Check if license already exists
  const existingLicense = await db.query.licenses.findFirst({
    where: eq(licenses.keygenLicenseId, keygenLicenseId),
  });

  if (existingLicense) {
    log.info({ keygenLicenseId }, 'License already exists, updating');
    await handleLicenseUpdated(licenseData, entitlements, eventId);
    return;
  }

  // Map entitlements
  const mappedEntitlements = entitlements.length
    ? mapKeygenEntitlements(entitlements)
    : DEFAULT_FREE_ENTITLEMENTS;

  // Determine plan from policy or metadata
  const plan = determinePlanFromLicense(licenseData);

  // Create license record
  const licenseId = nanoid();
  const now = new Date();

  await db.insert(licenses).values({
    id: licenseId,
    organizationId,
    keygenLicenseId,
    keygenPolicyId: licenseData.relationships.policy.data?.id || null,
    key: licenseKey,
    name: licenseName,
    plan,
    status: mapKeygenLicenseStatus(licenseData.attributes.status),
    validFrom: new Date(licenseData.attributes.created),
    expiresAt: licenseData.attributes.expiry
      ? new Date(licenseData.attributes.expiry)
      : null,
    entitlements: mappedEntitlements,
    gracePeriodStatus: "none",
    licenseeEmail: (metadata.email as string) || null,
    licenseeName: (metadata.name as string) || licenseName || null,
    metadata: metadata,
    createdAt: now,
    updatedAt: now,
  });

  // Log billing event
  await createBillingEvent(
    organizationId,
    licenseId,
    "license_created",
    eventId,
    "keygen",
    null,
    {
      keygenLicenseId,
      plan,
      entitlements: mappedEntitlements,
    }
  );

  log.info({ licenseId, organizationId }, 'Created license');
}

/**
 * Handle license.renewed event
 * Updates expiry date and clears any grace period.
 */
async function handleLicenseRenewed(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  const previousState = {
    expiresAt: license.expiresAt,
    gracePeriodStatus: license.gracePeriodStatus,
  };

  await db
    .update(licenses)
    .set({
      status: "active",
      expiresAt: licenseData.attributes.expiry
        ? new Date(licenseData.attributes.expiry)
        : null,
      gracePeriodStatus: "none",
      gracePeriodStartedAt: null,
      gracePeriodEndsAt: null,
      gracePeriodEmailsSent: [],
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  await createBillingEvent(
    license.organizationId,
    license.id,
    "license_renewed",
    eventId,
    "keygen",
    previousState,
    {
      newExpiresAt: licenseData.attributes.expiry,
    }
  );

  log.info({ licenseId: license.id }, 'Renewed license');
}

/**
 * Handle license.expired event
 * Starts grace period for the license.
 */
async function handleLicenseExpired(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  const now = new Date();
  const gracePeriodEnds = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  const previousState = {
    status: license.status,
    gracePeriodStatus: license.gracePeriodStatus,
  };

  await db
    .update(licenses)
    .set({
      status: "expired",
      gracePeriodStatus: "active",
      gracePeriodStartedAt: now,
      gracePeriodEndsAt: gracePeriodEnds,
      updatedAt: now,
    })
    .where(eq(licenses.id, license.id));

  await createBillingEvent(
    license.organizationId,
    license.id,
    "license_expired",
    eventId,
    "keygen",
    previousState,
    {
      gracePeriodEnds: gracePeriodEnds.toISOString(),
    }
  );

  await createBillingEvent(
    license.organizationId,
    license.id,
    "grace_period_started",
    eventId,
    "system",
    null,
    {
      startsAt: now.toISOString(),
      endsAt: gracePeriodEnds.toISOString(),
      durationDays: GRACE_PERIOD_DAYS,
    }
  );

  log.info({ licenseId: license.id, gracePeriodEnds: gracePeriodEnds.toISOString() }, 'License expired, grace period started');
}

/**
 * Handle license.suspended event
 * Starts grace period for suspended license.
 */
async function handleLicenseSuspended(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  const now = new Date();
  const gracePeriodEnds = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  const previousState = {
    status: license.status,
    gracePeriodStatus: license.gracePeriodStatus,
  };

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
    license.organizationId,
    license.id,
    "license_suspended",
    eventId,
    "keygen",
    previousState,
    {
      gracePeriodEnds: gracePeriodEnds.toISOString(),
    }
  );

  await createBillingEvent(
    license.organizationId,
    license.id,
    "grace_period_started",
    eventId,
    "system",
    null,
    {
      reason: "suspended",
      startsAt: now.toISOString(),
      endsAt: gracePeriodEnds.toISOString(),
      durationDays: GRACE_PERIOD_DAYS,
    }
  );

  log.info({ licenseId: license.id }, 'License suspended, grace period started');
}

/**
 * Handle license.reinstated event
 * Clears suspension and grace period.
 */
async function handleLicenseReinstated(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  const previousState = {
    status: license.status,
    gracePeriodStatus: license.gracePeriodStatus,
  };

  await db
    .update(licenses)
    .set({
      status: "active",
      gracePeriodStatus: "none",
      gracePeriodStartedAt: null,
      gracePeriodEndsAt: null,
      gracePeriodEmailsSent: [],
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  await createBillingEvent(
    license.organizationId,
    license.id,
    "license_activated",
    eventId,
    "keygen",
    previousState,
    {
      reason: "reinstated",
    }
  );

  log.info({ licenseId: license.id }, 'License reinstated');
}

/**
 * Handle license.revoked event
 * Immediately revokes the license (no grace period).
 */
async function handleLicenseRevoked(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

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
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  await createBillingEvent(
    license.organizationId,
    license.id,
    "license_revoked",
    eventId,
    "keygen",
    previousState,
    {
      newEntitlements: DEFAULT_FREE_ENTITLEMENTS,
    }
  );

  await createBillingEvent(
    license.organizationId,
    license.id,
    "downgraded",
    eventId,
    "system",
    { plan: license.plan },
    { plan: "free", reason: "revoked" }
  );

  log.info({ licenseId: license.id }, 'License revoked, downgraded to free');
}

/**
 * Handle machine.created event
 * Stores machine binding info on the license for self-hosted activations.
 */
async function handleMachineCreated(machineData: any, eventId: string) {
  const licenseId = machineData?.relationships?.license?.data?.id;
  const machineId = machineData?.id as string | undefined;
  const fingerprint = machineData?.attributes?.fingerprint as string | undefined;

  if (!licenseId || !machineId) {
    log.warn('Machine event missing licenseId or machineId');
    return;
  }

  const license = await findLicenseByKeygenId(licenseId);
  if (!license) {
    log.warn({ licenseId, machineId }, 'License not found for machine');
    return;
  }

  await db
    .update(licenses)
    .set({
      machineId,
      machineFingerprint: fingerprint || license.machineFingerprint,
      activatedAt: license.activatedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  await createBillingEvent(
    license.organizationId,
    license.id,
    "license_activated",
    eventId,
    "keygen",
    { machineId: license.machineId, machineFingerprint: license.machineFingerprint },
    { machineId, machineFingerprint: fingerprint }
  );

  log.info({ machineId, licenseId: license.id }, 'Machine attached to license');
}

/**
 * Handle license.expiring-soon event
 * Logs for notification purposes.
 */
async function handleLicenseExpiringSoon(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  // Calculate days until expiry
  const expiresAt = licenseData.attributes.expiry
    ? new Date(licenseData.attributes.expiry)
    : null;
  const daysRemaining = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  // Log the event - email notifications handled by worker job
  log.info({ licenseId: license.id, daysRemaining }, 'License expiring soon');
}

/**
 * Handle license.validated event
 * Records validation result for audit trail.
 */
async function handleLicenseValidated(
  licenseData: KeygenLicense,
  success: boolean,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  const now = new Date();

  // Update last validation timestamp
  await db
    .update(licenses)
    .set({
      lastValidatedAt: now,
      lastValidationResult: success ? "success" : "failed",
      validationFailureCount: success
        ? 0
        : (license.validationFailureCount || 0) + 1,
      updatedAt: now,
    })
    .where(eq(licenses.id, license.id));

  // Create validation record
  await db.insert(licenseValidations).values({
    id: nanoid(),
    licenseId: license.id,
    validationType: "webhook",
    success,
    errorCode: success ? null : "VALIDATION_FAILED",
    errorMessage: success ? null : "License validation failed",
    validatedAt: now,
  });

  if (success) {
    await createBillingEvent(
      license.organizationId,
      license.id,
      "license_validated",
      eventId,
      "keygen",
      null,
      { success: true }
    );
  } else {
    await createBillingEvent(
      license.organizationId,
      license.id,
      "license_validation_failed",
      eventId,
      "keygen",
      null,
      { success: false, failureCount: (license.validationFailureCount || 0) + 1 }
    );
  }
}

/**
 * Handle entitlement changes
 * Syncs entitlements from Keygen.sh to local cache.
 */
async function handleEntitlementsChanged(
  licenseData: KeygenLicense,
  entitlements: KeygenEntitlement[],
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  // If entitlements not included in webhook, fetch them
  let currentEntitlements = entitlements;
  if (currentEntitlements.length === 0) {
    try {
      currentEntitlements = await getLicenseEntitlements(licenseData.id);
    } catch (error) {
      log.error({ licenseId: licenseData.id, err: error }, 'Failed to fetch entitlements');
      return;
    }
  }

  const previousEntitlements = license.entitlements;
  const newEntitlements = mapKeygenEntitlements(currentEntitlements);

  await db
    .update(licenses)
    .set({
      entitlements: newEntitlements,
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  await createBillingEvent(
    license.organizationId,
    license.id,
    "entitlements_changed",
    eventId,
    "keygen",
    { entitlements: previousEntitlements },
    { entitlements: newEntitlements }
  );

  log.info({ licenseId: license.id }, 'Updated entitlements');
}

/**
 * Handle license.updated event
 * Generic update handler for license changes.
 */
async function handleLicenseUpdated(
  licenseData: KeygenLicense,
  entitlements: KeygenEntitlement[],
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) {
    // License doesn't exist yet, create it
    await handleLicenseCreated(licenseData, entitlements, eventId, undefined);
    return;
  }

  const previousState = {
    status: license.status,
    expiresAt: license.expiresAt,
    entitlements: license.entitlements,
  };

  const newStatus = mapKeygenLicenseStatus(licenseData.attributes.status);
  const newEntitlements = entitlements.length
    ? mapKeygenEntitlements(entitlements)
    : license.entitlements;

  await db
    .update(licenses)
    .set({
      status: newStatus,
      expiresAt: licenseData.attributes.expiry
        ? new Date(licenseData.attributes.expiry)
        : null,
      entitlements: newEntitlements,
      name: licenseData.attributes.name || license.name,
      metadata: {
        ...(license.metadata as Record<string, unknown>),
        ...licenseData.attributes.metadata,
      },
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  // Log event if status changed
  if (previousState.status !== newStatus) {
    await createBillingEvent(
      license.organizationId,
      license.id,
      "license_activated",
      eventId,
      "keygen",
      previousState,
      { status: newStatus, entitlements: newEntitlements }
    );
  }

  log.info({ licenseId: license.id }, 'Updated license');
}

/**
 * Handle license.deleted event
 * Removes the license record (rare, usually licenses are revoked instead).
 */
async function handleLicenseDeleted(
  licenseData: KeygenLicense,
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  await createBillingEvent(
    license.organizationId,
    license.id,
    "license_revoked",
    eventId,
    "keygen",
    { status: license.status, entitlements: license.entitlements },
    { deleted: true }
  );

  await db.delete(licenses).where(eq(licenses.id, license.id));

  log.info({ licenseId: license.id }, 'Deleted license');
}

/**
 * Handle license.policy-changed event
 * Updates the license plan based on the new policy.
 */
async function handlePolicyChanged(
  licenseData: KeygenLicense,
  entitlements: KeygenEntitlement[],
  eventId: string
) {
  const license = await findLicenseByKeygenId(licenseData.id);
  if (!license) return;

  const previousPlan = license.plan;
  const newPlan = determinePlanFromLicense(licenseData);

  // If entitlements not included, fetch them
  let currentEntitlements = entitlements;
  if (currentEntitlements.length === 0) {
    try {
      currentEntitlements = await getLicenseEntitlements(licenseData.id);
    } catch (error) {
      log.error({ licenseId: licenseData.id, err: error }, 'Failed to fetch entitlements');
    }
  }

  const newEntitlements = currentEntitlements.length
    ? mapKeygenEntitlements(currentEntitlements)
    : license.entitlements;

  await db
    .update(licenses)
    .set({
      plan: newPlan,
      keygenPolicyId: licenseData.relationships.policy.data?.id || null,
      entitlements: newEntitlements,
      updatedAt: new Date(),
    })
    .where(eq(licenses.id, license.id));

  // Determine if upgrade or downgrade
  const eventType =
    getPlanTier(newPlan) > getPlanTier(previousPlan) ? "upgraded" : "downgraded";

  await createBillingEvent(
    license.organizationId,
    license.id,
    eventType,
    eventId,
    "keygen",
    { plan: previousPlan, entitlements: license.entitlements },
    { plan: newPlan, entitlements: newEntitlements }
  );

  log.info({ licenseId: license.id, previousPlan, newPlan }, 'License policy changed');
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Find a license by its Keygen.sh ID.
 */
async function findLicenseByKeygenId(keygenLicenseId: string) {
  return db.query.licenses.findFirst({
    where: eq(licenses.keygenLicenseId, keygenLicenseId),
  });
}

/**
 * Create a billing event record.
 */
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
 * Determine the plan tier from license data.
 */
function determinePlanFromLicense(licenseData: KeygenLicense): string {
  // Check metadata first
  const metadata = licenseData.attributes.metadata;
  if (metadata.plan && typeof metadata.plan === "string") {
    return metadata.plan;
  }

  // Check policy ID mapping (uses hardcoded IDs from licensing package)
  const policyId = licenseData.relationships.policy.data?.id;
  if (policyId) {
    if (policyId === KEYGEN_POLICY_IDS.ENTERPRISE) return "enterprise";
    if (policyId === KEYGEN_POLICY_IDS.PRO) return "pro";
  }

  // Check license name for hints
  const name = (licenseData.attributes.name || "").toLowerCase();
  if (name.includes("enterprise")) return "enterprise";
  if (name.includes("pro")) return "pro";

  // Default to pro
  return "pro";
}

/**
 * Get numeric tier for plan comparison.
 */
function getPlanTier(plan: string): number {
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
