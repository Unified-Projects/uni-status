/**
 * Keygen Webhook API Tests
 *
 * Tests for webhook processing endpoints:
 * - POST /api/webhooks/keygen - Keygen.sh webhook handler
 *
 * Tests cover:
 * - Signature verification
 * - License lifecycle events
 * - Grace period handling
 * - Entitlement sync
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { nanoid } from "nanoid";
import {
  createMockLicense,
  createGracePeriodLicense,
  mockLicenseToDbLicense,
} from "../helpers/license";
import {
  generateKeygenWebhookSignature,
  createWebhookHeaders,
  createLicenseCreatedWebhook,
  createLicenseExpiredWebhook,
  createLicenseSuspendedWebhook,
  createLicenseRenewedWebhook,
  createLicenseRevokedWebhook,
  createLicenseReinstatedWebhook,
  createEntitlementsChangedWebhook,
  createMachineCreatedWebhook,
} from "../helpers/webhook";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api";
const WEBHOOK_SECRET = process.env.UNI_STATUS_KEYGEN_WEBHOOK_SECRET ?? "test-webhook-secret";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

let ctx: TestContext;
let dbClient: Client;

beforeAll(async () => {
  dbClient = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await dbClient.connect();
  ctx = await bootstrapTestContext();
});

afterAll(async () => {
  await dbClient?.end();
});

// Helper to insert a license
async function insertLicense(license: ReturnType<typeof createMockLicense>) {
  const dbLicense = mockLicenseToDbLicense(license);
  await dbClient.query(
    `INSERT INTO licenses (
      id, organization_id, keygen_license_id, keygen_policy_id,
      key, name, plan, status, valid_from, expires_at,
      last_validated_at, last_validation_result, validation_failure_count,
      entitlements, grace_period_status, grace_period_started_at,
      grace_period_ends_at, grace_period_emails_sent,
      machine_id, machine_fingerprint, activated_at, activated_by,
      licensee_email, licensee_name,
      metadata, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24, $25, $26, $27
    )`,
    [
      dbLicense.id,
      dbLicense.organizationId,
      dbLicense.keygenLicenseId,
      dbLicense.keygenPolicyId,
      dbLicense.key,
      dbLicense.name,
      dbLicense.plan,
      dbLicense.status,
      dbLicense.validFrom,
      dbLicense.expiresAt,
      dbLicense.lastValidatedAt,
      dbLicense.lastValidationResult,
      dbLicense.validationFailureCount,
      JSON.stringify(dbLicense.entitlements),
      dbLicense.gracePeriodStatus,
      dbLicense.gracePeriodStartedAt,
      dbLicense.gracePeriodEndsAt,
      JSON.stringify(dbLicense.gracePeriodEmailsSent),
      dbLicense.machineId,
      dbLicense.machineFingerprint,
      dbLicense.activatedAt,
      dbLicense.activatedBy,
      dbLicense.licenseeEmail,
      dbLicense.licenseeName,
      JSON.stringify(dbLicense.metadata),
      dbLicense.createdAt,
      dbLicense.updatedAt,
    ]
  );
}

// Helper to get license from database
async function getLicense(keygenLicenseId: string) {
  const result = await dbClient.query(
    "SELECT * FROM licenses WHERE keygen_license_id = $1",
    [keygenLicenseId]
  );
  return result.rows[0];
}

// Helper to clean up licenses
async function cleanupLicenses(organizationId?: string) {
  if (organizationId) {
    await dbClient.query("DELETE FROM licenses WHERE organization_id = $1", [
      organizationId,
    ]);
  } else {
    // Clean up all test licenses
    await dbClient.query(
      "DELETE FROM licenses WHERE organization_id LIKE 'test_%'"
    );
  }
}

// Send webhook with proper signature
async function sendWebhook(payload: object) {
  const body = JSON.stringify(payload);
  const headers = createWebhookHeaders(body, WEBHOOK_SECRET);

  return fetch(`${API_URL}/webhooks/keygen`, {
    method: "POST",
    headers,
    body,
  });
}

describe("Keygen Webhook Routes", () => {
  beforeEach(async () => {
    await cleanupLicenses(ctx.organizationId);
  });

  // ==========================================
  // Signature Verification
  // ==========================================

  describe("Signature Verification", () => {
    it("rejects requests without signature header", async () => {
      const payload = createLicenseCreatedWebhook(createMockLicense());

      const response = await fetch(`${API_URL}/webhooks/keygen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(401);
    });

    it("rejects requests with invalid signature", async () => {
      const payload = createLicenseCreatedWebhook(createMockLicense());

      const response = await fetch(`${API_URL}/webhooks/keygen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          "Keygen-Signature": "invalid-signature",
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(401);
    });

    it("accepts requests with valid signature", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      const payload = createLicenseCreatedWebhook(license);

      const response = await sendWebhook(payload);

      // Should not be 401 (signature accepted)
      expect(response.status).not.toBe(401);
    });
  });

  // ==========================================
  // license.created Event
  // ==========================================

  describe("license.created Event", () => {
    it("creates a new license in the database", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      const payload = createLicenseCreatedWebhook(license);

      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      // Verify license was created
      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense).toBeDefined();
      expect(dbLicense.status).toBe("active");
      expect(dbLicense.organization_id).toBe(ctx.organizationId);
    });

    it("stores entitlements from the webhook", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      const payload = createLicenseCreatedWebhook(license);

      await sendWebhook(payload);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.entitlements).toBeDefined();
      expect(dbLicense.plan).toBe("pro");
    });

    it("creates billing event for license creation", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      const payload = createLicenseCreatedWebhook(license);

      await sendWebhook(payload);

      // Check billing event was created
      const result = await dbClient.query(
        "SELECT * FROM billing_events WHERE organization_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT 1",
        [ctx.organizationId, "license_created"]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].event_type).toBe("license_created");
    });
  });

  // ==========================================
  // license.expired Event
  // ==========================================

  describe("license.expired Event", () => {
    it("starts grace period for expired license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseExpiredWebhook(license.keygenLicenseId);
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      // Verify grace period started
      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.grace_period_status).toBe("active");
      expect(dbLicense.grace_period_started_at).toBeDefined();
      expect(dbLicense.grace_period_ends_at).toBeDefined();
    });

    it("updates license status to expired", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseExpiredWebhook(license.keygenLicenseId);
      await sendWebhook(payload);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("expired");
    });
  });

  // ==========================================
  // license.suspended Event
  // ==========================================

  describe("license.suspended Event", () => {
    it("suspends license and starts grace period", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseSuspendedWebhook(license.keygenLicenseId);
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("suspended");
      expect(dbLicense.grace_period_status).toBe("active");
    });

    it("creates billing event for suspension", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseSuspendedWebhook(license.keygenLicenseId);
      await sendWebhook(payload);

      const result = await dbClient.query(
        "SELECT * FROM billing_events WHERE organization_id = $1 AND event_type = $2",
        [ctx.organizationId, "license_suspended"]
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // license.renewed Event
  // ==========================================

  describe("license.renewed Event", () => {
    it("clears grace period on renewal", async () => {
      const license = createGracePeriodLicense(2, {
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseRenewedWebhook(license);
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.grace_period_status).toBe("none");
      expect(dbLicense.status).toBe("active");
    });

    it("updates expiry date on renewal", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const newExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const payload = createLicenseRenewedWebhook(license, newExpiry);
      await sendWebhook(payload);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(new Date(dbLicense.expires_at).getTime()).toBeCloseTo(
        newExpiry.getTime(),
        -4 // Allow 10 second difference
      );
    });
  });

  // ==========================================
  // license.revoked Event
  // ==========================================

  describe("license.revoked Event", () => {
    it("immediately revokes license without grace period", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseRevokedWebhook(license.keygenLicenseId);
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("revoked");
      // Revocation should not start grace period
      expect(dbLicense.grace_period_status).toBe("none");
    });
  });

  // ==========================================
  // license.reinstated Event
  // ==========================================

  describe("license.reinstated Event", () => {
    it("reinstates a suspended license", async () => {
      const license = createGracePeriodLicense(3, {
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseReinstatedWebhook(license);
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("active");
      expect(dbLicense.grace_period_status).toBe("none");
    });
  });

  // ==========================================
  // license.entitlements-attached Event
  // ==========================================

  describe("license.entitlements-attached Event", () => {
    it("updates cached entitlements", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Update to business entitlements
      license.plan = "pro";
      const payload = createEntitlementsChangedWebhook(license);
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.entitlements).toBeDefined();
    });
  });

  // ==========================================
  // machine.created Event
  // ==========================================

  describe("machine.created Event", () => {
    it("stores machine info on license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const machineId = `mach_${nanoid()}`;
      const fingerprint = `fp_${nanoid(16)}`;
      const payload = createMachineCreatedWebhook(
        license.keygenLicenseId,
        machineId,
        fingerprint
      );
      const response = await sendWebhook(payload);

      expect(response.status).toBe(200);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.machine_id).toBe(machineId);
      expect(dbLicense.machine_fingerprint).toBe(fingerprint);
    });
  });

  // ==========================================
  // Error Handling
  // ==========================================

  describe("Error Handling", () => {
    it("handles unknown event types gracefully", async () => {
      const payload = {
        data: {
          id: nanoid(),
          type: "webhook-events",
          attributes: {
            event: "unknown.event" as any,
            endpoint: "https://example.com",
            created: new Date().toISOString(),
            status: "delivered",
            payload: { data: { id: "test", type: "test" } },
          },
        },
      };

      const response = await sendWebhook(payload);

      // Should acknowledge but not process
      expect(response.status).toBe(200);
    });

    it("handles missing license gracefully for update events", async () => {
      const payload = createLicenseExpiredWebhook(`lic_${nanoid()}`);
      const response = await sendWebhook(payload);

      // Should not error, just log and continue
      expect(response.status).toBe(200);
    });

    it("returns 200 to prevent webhook retries on handled errors", async () => {
      // Even on processing errors, return 200 to prevent infinite retries
      const payload = createLicenseCreatedWebhook(
        createMockLicense({
          organizationId: "non-existent-org",
        })
      );

      const response = await sendWebhook(payload);

      // Should still return 200 to acknowledge receipt
      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // Idempotency
  // ==========================================

  describe("Idempotency", () => {
    it("handles duplicate webhook events safely", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      const payload = createLicenseCreatedWebhook(license);

      // Send same webhook twice
      const response1 = await sendWebhook(payload);
      const response2 = await sendWebhook(payload);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Should only have one license
      const result = await dbClient.query(
        "SELECT COUNT(*) FROM licenses WHERE keygen_license_id = $1",
        [license.keygenLicenseId]
      );
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });
});
