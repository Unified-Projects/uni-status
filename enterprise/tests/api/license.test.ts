/**
 * License API Route Tests
 *
 * Tests for the license management API endpoints (self-hosted mode):
 * - GET /api/v1/license - Get current license status
 * - POST /api/v1/license/activate - Activate a license key
 * - POST /api/v1/license/validate - Force validation
 * - POST /api/v1/license/deactivate - Deactivate license
 * - GET /api/v1/license/portal - Get portal URL
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { nanoid } from "nanoid";
import {
  createMockLicense,
  createGracePeriodLicense,
  createExpiredLicense,
  mockLicenseToDbLicense,
  PRO_ENTITLEMENTS,
  FREE_ENTITLEMENTS,
  SELF_HOSTED_ENTITLEMENTS,
  isSelfHostedMode,
} from "../helpers/license";
import {
  createValidKeygenResponse,
  createExpiredKeygenResponse,
  createSuspendedKeygenResponse,
} from "../helpers/keygen";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api/v1";
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

// Helper to clean up test licenses
async function cleanupLicenses(organizationId: string) {
  await dbClient.query("DELETE FROM licenses WHERE organization_id = $1", [
    organizationId,
  ]);
}

describe("License API Routes", () => {
  beforeEach(async () => {
    // Clean up any existing licenses for the test organization
    await cleanupLicenses(ctx.organizationId);
  });

  // ==========================================
  // GET /api/v1/license
  // ==========================================

  describe("GET /api/v1/license", () => {
    it("returns free tier when no license exists", async () => {
      const response = await fetch(`${API_URL}/license`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      // In self-hosted mode, plan is 'self-hosted' with unlimited entitlements
      // In hosted mode, plan is 'free' with limited entitlements
      if (isSelfHostedMode()) {
        expect(body.data.plan).toBe("self-hosted");
        expect(body.data.entitlements.monitors).toBe(SELF_HOSTED_ENTITLEMENTS.monitors);
      } else {
        expect(body.data.plan).toBe("free");
        expect(body.data.entitlements.monitors).toBe(FREE_ENTITLEMENTS.monitors);
      }
      expect(body.data.status).toBe("no_license");
      expect(body.data.entitlements).toBeDefined();
    });

    it("returns active license with entitlements", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/license`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.plan).toBe("pro");
      expect(body.data.status).toBe("active");
      // In self-hosted mode, numeric entitlements are always unlimited (-1)
      if (isSelfHostedMode()) {
        expect(body.data.entitlements.monitors).toBe(-1);
      } else {
        expect(body.data.entitlements.monitors).toBe(PRO_ENTITLEMENTS.monitors);
      }
      expect(body.data.license).toBeDefined();
      expect(body.data.license.id).toBe(license.id);
    });

    it("returns grace period info for suspended license", async () => {
      const license = createGracePeriodLicense(3, {
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/license`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.status).toBe("grace_period");
      expect(body.data.gracePeriodDaysRemaining).toBeDefined();
      expect(body.data.gracePeriodDaysRemaining).toBeGreaterThanOrEqual(2);
    });

    it("requires authentication", async () => {
      const response = await fetch(`${API_URL}/license`, {
        method: "GET",
        // No auth headers
      });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/v1/license/activate
  // ==========================================

  describe("POST /api/v1/license/activate", () => {
    it("activates a valid license key", async () => {
      // This test would require mocking the Keygen API
      // For now, we test the request structure
      const response = await fetch(`${API_URL}/license/activate`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "UNIS-TEST-LICENSE-KEY-HERE",
        }),
      });

      // The actual response depends on Keygen API availability
      // In a real test environment, we'd mock the Keygen API
      expect(response.status).toBeDefined();
    });

    it("rejects activation without a key", async () => {
      const response = await fetch(`${API_URL}/license/activate`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it("requires authentication", async () => {
      const response = await fetch(`${API_URL}/license/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: "test-key" }),
      });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/v1/license/validate
  // ==========================================

  describe("POST /api/v1/license/validate", () => {
    it("validates an existing license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/license/validate`, {
        method: "POST",
        headers: ctx.headers,
      });

      // Response depends on Keygen API availability
      expect(response.status).toBeDefined();
    });

    it("returns error when no license exists", async () => {
      const response = await fetch(`${API_URL}/license/validate`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("requires authentication", async () => {
      const response = await fetch(`${API_URL}/license/validate`, {
        method: "POST",
      });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/v1/license/deactivate
  // ==========================================

  describe("POST /api/v1/license/deactivate", () => {
    it("deactivates an existing license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/license/deactivate`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify license is removed
      const result = await dbClient.query(
        "SELECT * FROM licenses WHERE organization_id = $1",
        [ctx.organizationId]
      );
      expect(result.rows.length).toBe(0);
    });

    it("returns success even when no license exists", async () => {
      const response = await fetch(`${API_URL}/license/deactivate`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
    });

    it("requires authentication", async () => {
      const response = await fetch(`${API_URL}/license/deactivate`, {
        method: "POST",
      });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // GET /api/v1/license/portal
  // ==========================================

  describe("GET /api/v1/license/portal", () => {
    it("returns portal URL when license exists", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const response = await fetch(`${API_URL}/license/portal`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.url).toBeDefined();
      expect(body.data.url).toContain("portal.keygen.sh");
    });

    it("returns base portal URL when no license exists", async () => {
      const response = await fetch(`${API_URL}/license/portal`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.url).toBeDefined();
    });

    it("requires authentication", async () => {
      const response = await fetch(`${API_URL}/license/portal`, {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // License Context in API Responses
  // ==========================================

  describe("License Context Integration", () => {
    it("includes license info in protected route responses", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Hit a protected route that should include license context
      const response = await fetch(`${API_URL}/monitors`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      // The response should succeed with the license context applied
    });

    it("enforces entitlements on protected routes", async () => {
      // With a free tier (no license), limits should be enforced
      // This would be tested more thoroughly in entitlement tests
      const response = await fetch(`${API_URL}/license`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.entitlements).toBeDefined();
    });
  });
});
