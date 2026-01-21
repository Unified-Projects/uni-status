/**
 * Webhook Test Helpers
 *
 * Utilities for generating Keygen.sh webhook payloads and signatures.
 */

import crypto from "crypto";
import { nanoid } from "nanoid";
import type { MockLicense } from "./license";
import type { KeygenWebhookEventType } from "@uni-status/shared/lib/keygen";

// ==========================================
// Webhook Payload Types
// ==========================================

export interface KeygenWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      event: KeygenWebhookEventType;
      endpoint: string;
      created: string;
      status: string;
      payload: {
        data: {
          id: string;
          type: string;
          attributes: Record<string, unknown>;
          relationships?: Record<string, unknown>;
          meta?: Record<string, unknown>;
        };
        included?: Array<{
          id: string;
          type: string;
          attributes: Record<string, unknown>;
        }>;
      };
    };
  };
}

// ==========================================
// Signature Generation
// ==========================================

/**
 * Generate a Keygen.sh webhook signature.
 * Note: Keygen uses Ed25519 signatures, but for testing we use HMAC-SHA256.
 * In real tests against a mock Keygen instance, use the actual Ed25519 signing.
 */
export function generateKeygenWebhookSignature(
  payload: object | string,
  secret: string,
  timestamp: number = Date.now()
): { signature: string; timestamp: number } {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signaturePayload = `${timestamp}.${body}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(signaturePayload)
    .digest("hex");

  return {
    signature: `t=${timestamp},v1=${signature}`,
    timestamp,
  };
}

/**
 * Create webhook headers with signature.
 */
export function createWebhookHeaders(
  payload: object | string,
  secret: string
): Record<string, string> {
  const { signature, timestamp } = generateKeygenWebhookSignature(
    payload,
    secret
  );

  return {
    "Content-Type": "application/vnd.api+json",
    "Keygen-Signature": signature,
    "Keygen-Timestamp": timestamp.toString(),
  };
}

// ==========================================
// Webhook Payload Builders
// ==========================================

/**
 * Create a base webhook payload structure.
 */
function createBaseWebhookPayload(
  event: KeygenWebhookEventType,
  licenseData: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
    relationships?: Record<string, unknown>;
  },
  included?: Array<{
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  }>
): KeygenWebhookPayload {
  return {
    data: {
      id: `event_${nanoid()}`,
      type: "webhook-events",
      attributes: {
        event,
        endpoint: "https://api.example.com/api/webhooks/keygen",
        created: new Date().toISOString(),
        status: "delivered",
        payload: {
          data: licenseData,
          included,
        },
      },
    },
  };
}

/**
 * Create a license.created webhook payload.
 */
export function createLicenseCreatedWebhook(
  license: MockLicense
): KeygenWebhookPayload {
  return createBaseWebhookPayload(
    "license.created",
    {
      id: license.keygenLicenseId,
      type: "licenses",
      attributes: {
        key: license.key,
        name: license.name,
        status: license.status.toUpperCase(),
        expiry: license.expiresAt?.toISOString() || null,
        created: license.createdAt.toISOString(),
        updated: license.updatedAt.toISOString(),
        metadata: {
          organizationId: license.organizationId,
          ...license.metadata,
        },
      },
      relationships: {
        policy: license.keygenPolicyId
          ? { data: { id: license.keygenPolicyId, type: "policies" } }
          : { data: null },
        product: { data: null },
        user: { data: null },
      },
    },
    createEntitlementIncludes(license.entitlements)
  );
}

/**
 * Create a license.expired webhook payload.
 */
export function createLicenseExpiredWebhook(
  licenseId: string,
  additionalData: Record<string, unknown> = {}
): KeygenWebhookPayload {
  return createBaseWebhookPayload("license.expired", {
    id: licenseId,
    type: "licenses",
    attributes: {
      status: "EXPIRED",
      ...additionalData,
    },
  });
}

/**
 * Create a license.suspended webhook payload.
 */
export function createLicenseSuspendedWebhook(
  licenseId: string,
  additionalData: Record<string, unknown> = {}
): KeygenWebhookPayload {
  return createBaseWebhookPayload("license.suspended", {
    id: licenseId,
    type: "licenses",
    attributes: {
      status: "SUSPENDED",
      ...additionalData,
    },
  });
}

/**
 * Create a license.renewed webhook payload.
 */
export function createLicenseRenewedWebhook(
  license: MockLicense,
  newExpiresAt?: Date
): KeygenWebhookPayload {
  const expiry = newExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  return createBaseWebhookPayload("license.renewed", {
    id: license.keygenLicenseId,
    type: "licenses",
    attributes: {
      key: license.key,
      status: "ACTIVE",
      expiry: expiry.toISOString(),
      created: license.createdAt.toISOString(),
      updated: new Date().toISOString(),
      metadata: license.metadata,
    },
  });
}

/**
 * Create a license.revoked webhook payload.
 */
export function createLicenseRevokedWebhook(
  licenseId: string,
  additionalData: Record<string, unknown> = {}
): KeygenWebhookPayload {
  return createBaseWebhookPayload("license.revoked", {
    id: licenseId,
    type: "licenses",
    attributes: {
      status: "BANNED",
      ...additionalData,
    },
  });
}

/**
 * Create a license.reinstated webhook payload.
 */
export function createLicenseReinstatedWebhook(
  license: MockLicense
): KeygenWebhookPayload {
  return createBaseWebhookPayload("license.reinstated", {
    id: license.keygenLicenseId,
    type: "licenses",
    attributes: {
      key: license.key,
      status: "ACTIVE",
      expiry: license.expiresAt?.toISOString() || null,
      created: license.createdAt.toISOString(),
      updated: new Date().toISOString(),
      metadata: license.metadata,
    },
  });
}

/**
 * Create a license.expiring-soon webhook payload.
 */
export function createLicenseExpiringSoonWebhook(
  license: MockLicense,
  daysUntilExpiry: number
): KeygenWebhookPayload {
  const expiresAt = new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000);

  return createBaseWebhookPayload("license.expiring-soon", {
    id: license.keygenLicenseId,
    type: "licenses",
    attributes: {
      key: license.key,
      status: "ACTIVE",
      expiry: expiresAt.toISOString(),
      created: license.createdAt.toISOString(),
      updated: new Date().toISOString(),
      metadata: {
        ...license.metadata,
        daysUntilExpiry,
      },
    },
  });
}

/**
 * Create a license.validated webhook payload.
 */
export function createLicenseValidatedWebhook(
  license: MockLicense,
  valid: boolean = true
): KeygenWebhookPayload {
  const event: KeygenWebhookEventType = valid
    ? "license.validation-succeeded"
    : "license.validation-failed";

  return createBaseWebhookPayload(event, {
    id: license.keygenLicenseId,
    type: "licenses",
    attributes: {
      key: license.key,
      status: license.status.toUpperCase(),
      expiry: license.expiresAt?.toISOString() || null,
      metadata: license.metadata,
    },
    meta: {
      valid,
      code: valid ? "VALID" : "INVALID",
    },
  });
}

/**
 * Create a license.entitlements-attached webhook payload.
 */
export function createEntitlementsChangedWebhook(
  license: MockLicense
): KeygenWebhookPayload {
  return createBaseWebhookPayload(
    "license.entitlements-attached",
    {
      id: license.keygenLicenseId,
      type: "licenses",
      attributes: {
        key: license.key,
        status: license.status.toUpperCase(),
      },
    },
    createEntitlementIncludes(license.entitlements)
  );
}

/**
 * Create a license.policy-changed webhook payload.
 */
export function createPolicyChangedWebhook(
  license: MockLicense,
  newPolicyId: string,
  newPlan: string
): KeygenWebhookPayload {
  return createBaseWebhookPayload("license.policy-changed", {
    id: license.keygenLicenseId,
    type: "licenses",
    attributes: {
      key: license.key,
      status: license.status.toUpperCase(),
      metadata: {
        ...license.metadata,
        previousPolicyId: license.keygenPolicyId,
        newPlan,
      },
    },
    relationships: {
      policy: { data: { id: newPolicyId, type: "policies" } },
    },
  });
}

/**
 * Create a machine.created webhook payload.
 */
export function createMachineCreatedWebhook(
  licenseId: string,
  machineId: string,
  fingerprint: string
): KeygenWebhookPayload {
  return createBaseWebhookPayload("machine.created", {
    id: machineId,
    type: "machines",
    attributes: {
      fingerprint,
      name: "Activated Machine",
      platform: "linux",
      cores: 4,
      created: new Date().toISOString(),
    },
    relationships: {
      license: { data: { id: licenseId, type: "licenses" } },
    },
  });
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Create entitlement includes for webhook payload.
 * Uses metadata-based format: all limits/features in a single entitlement's metadata.
 */
function createEntitlementIncludes(
  entitlements: MockLicense["entitlements"]
): Array<{ id: string; type: string; attributes: Record<string, unknown> }> {
  // Create a single entitlement with all features in metadata
  // This matches the new metadata-based entitlement system
  return [
    {
      id: `ent_${nanoid()}`,
      type: "entitlements",
      attributes: {
        name: "Plan Entitlements",
        code: "plan-entitlements",
        metadata: {
          monitors: entitlements.monitors,
          statusPages: entitlements.statusPages,
          teamMembers: entitlements.teamMembers,
          regions: entitlements.regions,
          auditLogs: entitlements.auditLogs,
          sso: entitlements.sso,
          customRoles: entitlements.customRoles,
          slo: entitlements.slo,
          reports: entitlements.reports,
          multiRegion: entitlements.multiRegion,
          oncall: entitlements.oncall,
        },
      },
    },
  ];
}

/**
 * Simulate sending a webhook to the API.
 */
export async function simulateWebhook(
  apiUrl: string,
  payload: KeygenWebhookPayload,
  secret: string
): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers = createWebhookHeaders(body, secret);

  return fetch(`${apiUrl}/api/webhooks/keygen`, {
    method: "POST",
    headers,
    body,
  });
}
