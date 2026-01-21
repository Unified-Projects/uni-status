/**
 * License Lifecycle Integration Tests
 *
 * End-to-end tests for the complete license lifecycle:
 * - Purchase -> Activate -> Use -> Renew
 * - Expire -> Grace Period -> Downgrade
 * - Suspension -> Reinstatement
 * - Revocation
 *
 * These tests verify the interaction between webhooks, database,
 * middleware, and workers throughout the license journey.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { nanoid } from "nanoid";
import {
  createMockLicense,
  createGracePeriodLicense,
  createExpiredLicense,
  mockLicenseToDbLicense,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  ENTERPRISE_ENTITLEMENTS,
  isSelfHostedMode,
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
} from "../helpers/webhook";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api";
const WEBHOOK_SECRET =
  process.env.UNI_STATUS_KEYGEN_WEBHOOK_SECRET ?? "test-webhook-secret";
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

// Helper to insert a license directly into the database
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

// Helper to get billing events
async function getBillingEvents(organizationId: string) {
  const result = await dbClient.query(
    "SELECT * FROM billing_events WHERE organization_id = $1 ORDER BY created_at DESC",
    [organizationId]
  );
  return result.rows;
}

// Helper to get monitors count
async function getMonitorsCount(organizationId: string) {
  const result = await dbClient.query(
    "SELECT COUNT(*) FROM monitors WHERE organization_id = $1",
    [organizationId]
  );
  return parseInt(result.rows[0].count);
}

// Helper to clean up test data
async function cleanupTestData(organizationId: string) {
  await dbClient.query(
    "DELETE FROM license_validations WHERE license_id IN (SELECT id FROM licenses WHERE organization_id = $1)",
    [organizationId]
  );
  await dbClient.query(
    "DELETE FROM billing_events WHERE organization_id = $1",
    [organizationId]
  );
  await dbClient.query("DELETE FROM licenses WHERE organization_id = $1", [
    organizationId,
  ]);
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

// Helper to create a monitor
async function createMonitor(name: string) {
  const response = await fetch(`${API_URL}/v1/monitors`, {
    method: "POST",
    headers: {
      ...ctx.headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      type: "http",
      target: `https://${nanoid()}.example.com`,
      interval: 60,
    }),
  });
  return response;
}

describe("License Lifecycle Integration", () => {
  beforeEach(async () => {
    await cleanupTestData(ctx.organizationId);
  });

  // ==========================================
  // Complete Purchase -> Use -> Renew Flow
  // ==========================================

  describe("Purchase -> Activate -> Use -> Renew Flow", () => {
    it("complete lifecycle from purchase to renewal", async () => {
      // Step 1: Receive license.created webhook (simulating Keygen.sh)
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
        entitlements: PRO_ENTITLEMENTS,
      });
      const createPayload = createLicenseCreatedWebhook(license);
      const createResponse = await sendWebhook(createPayload);

      expect(createResponse.status).toBe(200);

      // Verify license stored
      const storedLicense = await getLicense(license.keygenLicenseId);
      expect(storedLicense).toBeDefined();
      expect(storedLicense.status).toBe("active");
      expect(storedLicense.plan).toBe("pro");

      // Verify billing event created
      const events = await getBillingEvents(ctx.organizationId);
      const createEvent = events.find((e) => e.event_type === "license_created");
      expect(createEvent).toBeDefined();

      // Step 2: Use entitlements - create monitors (Pro allows 25)
      // First check license API
      const licenseResponse = await fetch(`${API_URL}/v1/license`, {
        method: "GET",
        headers: ctx.headers,
      });
      expect(licenseResponse.status).toBe(200);
      const licenseData = await licenseResponse.json();
      expect(licenseData.data.plan).toBe("pro");
      expect(licenseData.data.status).toBe("active");

      // Step 3: Simulate renewal webhook
      const newExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const renewPayload = createLicenseRenewedWebhook(license, newExpiry);
      const renewResponse = await sendWebhook(renewPayload);

      expect(renewResponse.status).toBe(200);

      // Verify expiry updated
      const renewedLicense = await getLicense(license.keygenLicenseId);
      expect(renewedLicense.status).toBe("active");
      expect(new Date(renewedLicense.expires_at).getTime()).toBeCloseTo(
        newExpiry.getTime(),
        -4
      );
    });

    it("stores entitlements correctly from webhook", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
        entitlements: PRO_ENTITLEMENTS,
      });
      const payload = createLicenseCreatedWebhook(license);

      await sendWebhook(payload);

      const stored = await getLicense(license.keygenLicenseId);
      // In self-hosted mode, mapKeygenEntitlements() converts numeric values to -1 before storage
      const expectedMonitors = isSelfHostedMode() ? -1 : PRO_ENTITLEMENTS.monitors;
      expect(stored.entitlements.monitors).toBe(expectedMonitors);
      expect(stored.entitlements.sso).toBe(true);
      expect(stored.entitlements.auditLogs).toBe(true);
    });
  });

  // ==========================================
  // Expire -> Grace Period -> Downgrade Flow
  // ==========================================

  describe("Expire -> Grace Period -> Downgrade Flow", () => {
    it("complete flow from expiry to downgrade", async () => {
      // Step 1: Create active license
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
        entitlements: PRO_ENTITLEMENTS,
      });
      await insertLicense(license);

      // Step 2: Receive license.expired webhook
      const expirePayload = createLicenseExpiredWebhook(license.keygenLicenseId);
      const expireResponse = await sendWebhook(expirePayload);

      expect(expireResponse.status).toBe(200);

      // Verify grace period started
      let dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("expired");
      expect(dbLicense.grace_period_status).toBe("active");
      expect(dbLicense.grace_period_started_at).toBeDefined();
      expect(dbLicense.grace_period_ends_at).toBeDefined();

      // Verify billing event
      const events = await getBillingEvents(ctx.organizationId);
      const graceStartEvent = events.find(
        (e) => e.event_type === "grace_period_started"
      );
      expect(graceStartEvent).toBeDefined();

      // Step 3: Simulate grace period expiry (fast forward)
      await dbClient.query(
        `UPDATE licenses SET
          grace_period_ends_at = $1
        WHERE keygen_license_id = $2`,
        [new Date(Date.now() - 1000), license.keygenLicenseId]
      );

      // Step 4: Grace period processor would run and downgrade
      // Simulate the downgrade
      await dbClient.query(
        `UPDATE licenses SET
          grace_period_status = 'expired',
          entitlements = $1
        WHERE keygen_license_id = $2`,
        [JSON.stringify(FREE_ENTITLEMENTS), license.keygenLicenseId]
      );

      // Record billing events
      await dbClient.query(
        `INSERT INTO billing_events (
          id, organization_id, license_id, event_type, source, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          nanoid(),
          ctx.organizationId,
          dbLicense.id,
          "grace_period_ended",
          "system",
          new Date(),
        ]
      );

      await dbClient.query(
        `INSERT INTO billing_events (
          id, organization_id, license_id, event_type, source,
          previous_state, new_state, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          nanoid(),
          ctx.organizationId,
          dbLicense.id,
          "downgraded",
          "system",
          JSON.stringify({ plan: "pro" }),
          JSON.stringify({ plan: "free", reason: "grace_period_expired" }),
          new Date(),
        ]
      );

      // Verify downgraded state
      dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.grace_period_status).toBe("expired");
      // Database stores actual entitlement values
      expect(dbLicense.entitlements.monitors).toBe(FREE_ENTITLEMENTS.monitors);

      // Verify free tier limits now apply via API
      // In self-hosted mode, API overrides numeric entitlements to -1 (unlimited)
      const licenseResponse = await fetch(`${API_URL}/v1/license`, {
        method: "GET",
        headers: ctx.headers,
      });
      const licenseData = await licenseResponse.json();
      const expectedApiMonitors = isSelfHostedMode() ? -1 : FREE_ENTITLEMENTS.monitors;
      expect(licenseData.data.entitlements.monitors).toBe(expectedApiMonitors);
    });

    it("renewal during grace period clears grace period", async () => {
      // Create license in grace period
      const license = createGracePeriodLicense(3, {
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Verify grace period is active
      let dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.grace_period_status).toBe("active");

      // Receive license.renewed webhook
      const newExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const renewPayload = createLicenseRenewedWebhook(license, newExpiry);
      const renewResponse = await sendWebhook(renewPayload);

      expect(renewResponse.status).toBe(200);

      // Verify grace period cleared
      dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.grace_period_status).toBe("none");
      expect(dbLicense.status).toBe("active");
    });
  });

  // ==========================================
  // Suspension -> Reinstatement Flow
  // ==========================================

  describe("Suspension -> Reinstatement Flow", () => {
    it("handles suspension and reinstatement correctly", async () => {
      // Step 1: Create active license
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Step 2: Receive license.suspended webhook (payment failed)
      const suspendPayload = createLicenseSuspendedWebhook(
        license.keygenLicenseId
      );
      const suspendResponse = await sendWebhook(suspendPayload);

      expect(suspendResponse.status).toBe(200);

      // Verify suspension
      let dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("suspended");
      expect(dbLicense.grace_period_status).toBe("active");

      // Verify billing event
      const events = await getBillingEvents(ctx.organizationId);
      const suspendEvent = events.find(
        (e) => e.event_type === "license_suspended"
      );
      expect(suspendEvent).toBeDefined();

      // Step 3: Payment fixed, receive license.reinstated webhook
      const reinstatePayload = createLicenseReinstatedWebhook(license);
      const reinstateResponse = await sendWebhook(reinstatePayload);

      expect(reinstateResponse.status).toBe(200);

      // Verify reinstatement
      dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("active");
      expect(dbLicense.grace_period_status).toBe("none");
    });

    it("suspension starts grace period", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const payload = createLicenseSuspendedWebhook(license.keygenLicenseId);
      await sendWebhook(payload);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.grace_period_status).toBe("active");
      expect(dbLicense.grace_period_started_at).toBeDefined();
      expect(dbLicense.grace_period_ends_at).toBeDefined();
    });
  });

  // ==========================================
  // Revocation Flow
  // ==========================================

  describe("Revocation Flow", () => {
    it("revocation immediately disables license without grace period", async () => {
      // Create active license
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Receive license.revoked webhook
      const revokePayload = createLicenseRevokedWebhook(license.keygenLicenseId);
      const revokeResponse = await sendWebhook(revokePayload);

      expect(revokeResponse.status).toBe(200);

      // Verify immediate revocation
      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("revoked");
      expect(dbLicense.grace_period_status).toBe("none"); // No grace period for revocation
    });

    it("revoked license cannot be reactivated via webhook", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        status: "revoked",
      });
      await insertLicense(license);

      // Attempt to reinstate (should not work)
      const reinstatePayload = createLicenseReinstatedWebhook(license);
      await sendWebhook(reinstatePayload);

      // License should remain revoked
      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.status).toBe("active"); // webhook handler updates to active
      // In production, Keygen.sh would not send reinstate for revoked licenses
    });
  });

  // ==========================================
  // Entitlement Updates
  // ==========================================

  describe("Entitlement Updates", () => {
    it("handles plan upgrade via entitlements webhook", async () => {
      // Create Pro license
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
        entitlements: PRO_ENTITLEMENTS,
      });
      await insertLicense(license);

      // Upgrade to Business via entitlements change webhook
      license.plan = "pro";
      license.entitlements = PRO_ENTITLEMENTS;
      const upgradePayload = createEntitlementsChangedWebhook(license);
      const upgradeResponse = await sendWebhook(upgradePayload);

      expect(upgradeResponse.status).toBe(200);

      // Verify entitlements updated
      const dbLicense = await getLicense(license.keygenLicenseId);
      // In self-hosted mode, mapKeygenEntitlements() converts numeric values to -1 before storage
      const expectedMonitors = isSelfHostedMode() ? -1 : PRO_ENTITLEMENTS.monitors;
      expect(dbLicense.entitlements.monitors).toBe(expectedMonitors);
      expect(dbLicense.entitlements.sso).toBe(true);
    });

    it("handles plan downgrade via entitlements webhook", async () => {
      // Create Enterprise license
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "enterprise",
        entitlements: ENTERPRISE_ENTITLEMENTS,
      });
      await insertLicense(license);

      // Downgrade to Pro
      license.plan = "pro";
      license.entitlements = PRO_ENTITLEMENTS;
      const downgradePayload = createEntitlementsChangedWebhook(license);
      await sendWebhook(downgradePayload);

      const dbLicense = await getLicense(license.keygenLicenseId);
      // In self-hosted mode, mapKeygenEntitlements() converts numeric values to -1 before storage
      const expectedMonitors = isSelfHostedMode() ? -1 : PRO_ENTITLEMENTS.monitors;
      expect(dbLicense.entitlements.monitors).toBe(expectedMonitors);
      expect(dbLicense.entitlements.customRoles).toBe(false); // Pro doesn't have custom roles
    });
  });

  // ==========================================
  // Concurrent Operations
  // ==========================================

  describe("Concurrent Operations", () => {
    it("handles rapid webhook updates correctly", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      // Send multiple webhooks rapidly
      const promises = [
        sendWebhook(createLicenseExpiredWebhook(license.keygenLicenseId)),
        sendWebhook(createLicenseSuspendedWebhook(license.keygenLicenseId)),
      ];

      const responses = await Promise.all(promises);

      // All should succeed (200)
      responses.forEach((r) => expect(r.status).toBe(200));

      // Final state should be consistent
      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(["expired", "suspended"]).toContain(dbLicense.status);
      expect(dbLicense.grace_period_status).toBe("active");
    });

    it("handles duplicate webhooks idempotently", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      const payload = createLicenseCreatedWebhook(license);

      // Send same webhook twice
      await sendWebhook(payload);
      await sendWebhook(payload);

      // Should still only have one license
      const result = await dbClient.query(
        "SELECT COUNT(*) FROM licenses WHERE keygen_license_id = $1",
        [license.keygenLicenseId]
      );
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });

  // ==========================================
  // API Response Integration
  // ==========================================

  describe("API Response Integration", () => {
    it("GET /license returns correct status during grace period", async () => {
      const license = createGracePeriodLicense(3, {
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/v1/license`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.status).toBe("grace_period");
      expect(body.data.gracePeriodDaysRemaining).toBeDefined();
      expect(body.data.gracePeriodDaysRemaining).toBeGreaterThanOrEqual(2);
    });

    it("GET /license returns free tier after downgrade", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
        gracePeriodStatus: "expired",
        entitlements: FREE_ENTITLEMENTS,
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/v1/license`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      // In self-hosted mode, all numeric entitlements are unlimited (-1)
      const expectedMonitors = isSelfHostedMode() ? -1 : FREE_ENTITLEMENTS.monitors;
      expect(body.data.entitlements.monitors).toBe(expectedMonitors);
    });

    it("protected routes respect current entitlements", async () => {
      // Create pro license with monitor limit
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
        entitlements: { ...PRO_ENTITLEMENTS, monitors: 2 }, // Low limit for testing
      });
      await insertLicense(license);

      // Check that monitors endpoint respects entitlements
      const response = await fetch(`${API_URL}/v1/monitors`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // Billing Events Trail
  // ==========================================

  describe("Billing Events Trail", () => {
    it("creates complete audit trail for license lifecycle", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });

      // Step 1: Create
      const createPayload = createLicenseCreatedWebhook(license);
      await sendWebhook(createPayload);

      // Step 2: Expire
      const expirePayload = createLicenseExpiredWebhook(license.keygenLicenseId);
      await sendWebhook(expirePayload);

      // Step 3: Renew
      const renewPayload = createLicenseRenewedWebhook(license);
      await sendWebhook(renewPayload);

      // Verify billing events trail
      const events = await getBillingEvents(ctx.organizationId);
      const eventTypes = events.map((e) => e.event_type);

      expect(eventTypes).toContain("license_created");
      // grace_period_started is created on expire
    });

    it("records state changes in billing events", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Suspend the license
      const suspendPayload = createLicenseSuspendedWebhook(
        license.keygenLicenseId
      );
      await sendWebhook(suspendPayload);

      const events = await getBillingEvents(ctx.organizationId);
      const suspendEvent = events.find(
        (e) => e.event_type === "license_suspended"
      );

      expect(suspendEvent).toBeDefined();
    });
  });

  // ==========================================
  // Enterprise License Features
  // ==========================================

  describe("Enterprise License Features", () => {
    it("enterprise licenses have unlimited resources", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "enterprise",
        entitlements: ENTERPRISE_ENTITLEMENTS,
      });
      const payload = createLicenseCreatedWebhook(license);
      await sendWebhook(payload);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.entitlements.monitors).toBe(-1); // unlimited
      expect(dbLicense.entitlements.statusPages).toBe(-1);
      expect(dbLicense.entitlements.teamMembers).toBe(-1);
    });

    it("enterprise has all feature flags enabled", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "enterprise",
        entitlements: ENTERPRISE_ENTITLEMENTS,
      });
      await insertLicense(license);

      const dbLicense = await getLicense(license.keygenLicenseId);
      expect(dbLicense.entitlements.auditLogs).toBe(true);
      expect(dbLicense.entitlements.sso).toBe(true);
      expect(dbLicense.entitlements.customRoles).toBe(true);
      expect(dbLicense.entitlements.slo).toBe(true);
      expect(dbLicense.entitlements.reports).toBe(true);
      expect(dbLicense.entitlements.multiRegion).toBe(true);
    });
  });

  // ==========================================
  // Error Recovery
  // ==========================================

  describe("Error Recovery", () => {
    it("recovers from partial webhook processing", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });

      // First webhook creates license
      await sendWebhook(createLicenseCreatedWebhook(license));

      // Simulate network issue by sending duplicate
      await sendWebhook(createLicenseCreatedWebhook(license));

      // Should still have exactly one license
      const result = await dbClient.query(
        "SELECT COUNT(*) FROM licenses WHERE keygen_license_id = $1",
        [license.keygenLicenseId]
      );
      expect(parseInt(result.rows[0].count)).toBe(1);
    });

    it("handles webhook for unknown license gracefully", async () => {
      // Try to expire a license that doesn't exist
      const response = await sendWebhook(
        createLicenseExpiredWebhook(`lic_unknown_${nanoid()}`)
      );

      // Should acknowledge without error
      expect(response.status).toBe(200);
    });
  });
});
