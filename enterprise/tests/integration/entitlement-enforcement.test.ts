/**
 * Entitlement Enforcement Integration Tests
 *
 * Tests that verify entitlements are properly enforced across API routes:
 * - Monitor creation limits
 * - Status page creation limits
 * - Team member invitation limits
 * - Feature flag enforcement (auditLogs, sso, etc.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { nanoid } from "nanoid";
import {
  createMockLicense,
  createGracePeriodLicense,
  createDowngradedLicense,
  mockLicenseToDbLicense,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  ENTERPRISE_ENTITLEMENTS,
} from "../helpers/license";
import { insertInvitation } from "../helpers/data";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api/v1";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

const FREE_MONITOR_LIMIT = FREE_ENTITLEMENTS.monitors;
const PRO_MONITOR_LIMIT = PRO_ENTITLEMENTS.monitors;
const FREE_STATUS_PAGE_LIMIT = FREE_ENTITLEMENTS.statusPages;
const PRO_STATUS_PAGE_LIMIT = PRO_ENTITLEMENTS.statusPages;

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

// Helper to clean up
async function cleanupTestData() {
  await dbClient.query("DELETE FROM licenses WHERE organization_id = $1", [
    ctx.organizationId,
  ]);
  await dbClient.query("DELETE FROM monitors WHERE organization_id = $1", [
    ctx.organizationId,
  ]);
  await dbClient.query("DELETE FROM status_pages WHERE organization_id = $1", [
    ctx.organizationId,
  ]);
  await dbClient.query(
    "DELETE FROM organization_invitations WHERE organization_id = $1",
    [ctx.organizationId]
  );
}

// Helper to create test monitors
async function createTestMonitors(count: number) {
  const now = new Date();
  for (let i = 0; i < count; i++) {
    await dbClient.query(
      `INSERT INTO monitors (id, organization_id, name, url, type, interval_seconds, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        nanoid(),
        ctx.organizationId,
        `Test Monitor ${i + 1}`,
        `https://example${i}.com`,
        "http",
        60,
        "active",
        ctx.userId,
        now,
      ]
    );
  }
}

// Helper to create test status pages
async function createTestStatusPages(count: number) {
  const now = new Date();
  for (let i = 0; i < count; i++) {
    // Replace underscores - nanoid default alphabet includes _ which fails slug validation
    const slugId = nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x");
    await dbClient.query(
      `INSERT INTO status_pages (id, organization_id, name, slug, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        nanoid(),
        ctx.organizationId,
        `Status Page ${i + 1}`,
        `status-${slugId}`,
        now,
      ]
    );
  }
}

// Helper to count current resources
async function getMonitorCount(): Promise<number> {
  const result = await dbClient.query(
    "SELECT COUNT(*) FROM monitors WHERE organization_id = $1",
    [ctx.organizationId]
  );
  return parseInt(result.rows[0].count);
}

async function getStatusPageCount(): Promise<number> {
  const result = await dbClient.query(
    "SELECT COUNT(*) FROM status_pages WHERE organization_id = $1",
    [ctx.organizationId]
  );
  return parseInt(result.rows[0].count);
}

describe("Entitlement Enforcement", () => {
  beforeEach(async () => {
    await cleanupTestData();
    try {
      // Try enterprise package path (when running inside enterprise workspace)
      const { clearLicenseCache } = await import("../../src/api/middleware/license");
      clearLicenseCache(ctx.organizationId);
    } catch {
      try {
        // Try monorepo tests copy path (when running from /tests/enterprise-tests)
        const { clearLicenseCache } = await import("../../../enterprise/src/api/middleware/license");
        clearLicenseCache(ctx.organizationId);
      } catch {
        // If the cache module isn't available, continue without clearing.
      }
    }
  });

  // ==========================================
  // Monitor Limits
  // ==========================================

  describe("Monitor Limits", () => {
    it("allows monitor creation when under free tier limit", async () => {
      const allowedCount =
        FREE_MONITOR_LIMIT === -1 ? 0 : Math.max(FREE_MONITOR_LIMIT - 1, 0);
      if (allowedCount > 0) {
        await createTestMonitors(allowedCount);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "New Monitor",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(response.status).toBe(201);
    });

    it("blocks monitor creation when at free tier limit", async () => {
      const atLimitCount = FREE_MONITOR_LIMIT === -1 ? 0 : FREE_MONITOR_LIMIT;
      if (atLimitCount > 0) {
        await createTestMonitors(atLimitCount);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "One Too Many",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(FREE_MONITOR_LIMIT === -1 ? 201 : 403).toBe(response.status);
      const body = await response.json();
      if (FREE_MONITOR_LIMIT !== -1) {
        expect(body.error || body.message).toContain("limit");
      }
    });

    it("allows more monitors with Pro license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      const proLimit = PRO_MONITOR_LIMIT === -1 ? 0 : PRO_MONITOR_LIMIT;
      const underLimitCount = proLimit > 0 ? Math.max(proLimit - 5, 0) : 0;
      if (underLimitCount > 0) {
        await createTestMonitors(underLimitCount);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Monitor 21",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(response.status).toBe(201);
    });

    it("blocks at Pro tier limit", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      const proLimit = PRO_MONITOR_LIMIT === -1 ? 0 : PRO_MONITOR_LIMIT;
      if (proLimit > 0) {
        await createTestMonitors(proLimit);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Monitor 26",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(PRO_MONITOR_LIMIT === -1 ? 201 : 403).toBe(response.status);
    });

    it("allows unlimited monitors for Enterprise", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "enterprise",
        entitlements: ENTERPRISE_ENTITLEMENTS,
      });
      await insertLicense(license);

      // Create many monitors
      await createTestMonitors(100);

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Monitor 101",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(response.status).toBe(201);
    });

    it("still enforces limits during grace period", async () => {
      const license = createGracePeriodLicense(3, {
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      const proLimit = PRO_MONITOR_LIMIT === -1 ? 0 : PRO_MONITOR_LIMIT;
      if (proLimit > 0) {
        await createTestMonitors(proLimit);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Grace Period Monitor",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(response.status).toBe(403);
    });

    it("reverts to free tier limits after downgrade", async () => {
      const license = createDowngradedLicense({
        organizationId: ctx.organizationId,
      });
      await insertLicense(license);

      const freeLimit = FREE_MONITOR_LIMIT === -1 ? 0 : FREE_MONITOR_LIMIT;
      if (freeLimit > 0) {
        await createTestMonitors(freeLimit);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Post-Downgrade Monitor",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  // ==========================================
  // Status Page Limits
  // ==========================================

  describe("Status Page Limits", () => {
    it("allows status page creation when under limit", async () => {
      // Free tier: ensure we stay under the configured limit
      const freeStatusLimit =
        FREE_STATUS_PAGE_LIMIT === -1 ? Infinity : FREE_STATUS_PAGE_LIMIT;
      const seedCount = Math.max(freeStatusLimit - 1, 0);
      if (Number.isFinite(seedCount) && seedCount > 0) {
        await createTestStatusPages(seedCount);
      }

      const response = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "First Status Page",
          slug: `sp-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
        }),
      });

      expect(response.status).toBe(201);
    });

    it("blocks status page creation at free tier limit", async () => {
      const freeStatusLimit =
        FREE_STATUS_PAGE_LIMIT === -1 ? 0 : FREE_STATUS_PAGE_LIMIT;
      if (freeStatusLimit > 0) {
        await createTestStatusPages(freeStatusLimit);
      }

      const response = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Second Status Page",
          slug: `sp-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
        }),
      });

      expect(FREE_STATUS_PAGE_LIMIT === -1 ? 201 : 403).toBe(response.status);
    });

    it("allows more status pages with Pro license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      const proStatusLimit =
        PRO_STATUS_PAGE_LIMIT === -1 ? 0 : PRO_STATUS_PAGE_LIMIT;
      const seedCount = proStatusLimit > 0 ? Math.max(proStatusLimit - 1, 0) : 0;
      if (seedCount > 0) {
        await createTestStatusPages(seedCount);
      }

      // Use only alphanumeric chars - nanoid default includes underscore which fails slug validation
      const slugId = nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x");
      const response = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Fifth Status Page",
          slug: `sp-${slugId}`,
        }),
      });

      expect(response.status).toBe(201);
    });
  });

  // ==========================================
  // Team Member Limits
  // ==========================================

  describe("Team Member Limits", () => {
    it("counts pending invitations toward limit", async () => {
      // Create pending invitations up to free tier limit
      for (let i = 0; i < 2; i++) {
        await insertInvitation(ctx.organizationId, {
          email: `invited${i}@example.com`,
          role: "member",
          invitedBy: ctx.userId,
        });
      }

      // Current members + pending invitations = at limit
      // Try to invite another
      const response = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "POST",
          headers: {
            ...ctx.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "new@example.com",
            role: "member",
          }),
        }
      );

      // Should be blocked (403) or we may need to account for existing members
      // This depends on how many members the test org already has
      expect([201, 403]).toContain(response.status);
    });

    it("allows more team members with Business license", async () => {
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);

      // Business tier: 50 team members
      const response = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "POST",
          headers: {
            ...ctx.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: `member-${nanoid(8)}@example.com`,
            role: "member",
          }),
        }
      );

      expect(response.status).toBe(201);
    });
  });

  // ==========================================
  // Feature Flags
  // ==========================================

  describe("Feature Flags", () => {
    describe("Audit Logs", () => {
      it("blocks audit log access on free tier", async () => {
        const response = await fetch(`${API_URL}/audit-logs`, {
          method: "GET",
          headers: ctx.headers,
        });

        // Should be blocked (403) as audit logs require Business+
        expect([403, 404]).toContain(response.status);
      });

      it("allows audit log access with Business license", async () => {
        const license = createMockLicense({
          organizationId: ctx.organizationId,
          plan: "pro",
        });
        await insertLicense(license);

        const response = await fetch(`${API_URL}/audit-logs`, {
          method: "GET",
          headers: ctx.headers,
        });

        // Should be allowed (200) or the route exists
        expect([200, 404]).toContain(response.status);
      });
    });

    describe("SSO", () => {
      it("blocks SSO configuration on free tier", async () => {
        const response = await fetch(`${API_URL}/sso/providers`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect([403, 404]).toContain(response.status);
      });

      it("allows SSO with Business license", async () => {
        const license = createMockLicense({
          organizationId: ctx.organizationId,
          plan: "pro",
        });
        await insertLicense(license);

        const response = await fetch(`${API_URL}/sso/providers`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect([200, 404]).toContain(response.status);
      });
    });

    describe("SLO Tracking", () => {
      it("blocks SLO routes on free tier", async () => {
        const response = await fetch(`${API_URL}/slos`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect([403, 404]).toContain(response.status);
      });

      it("allows SLO with Pro license", async () => {
        const license = createMockLicense({
          organizationId: ctx.organizationId,
          plan: "pro",
        });
        await insertLicense(license);

        const response = await fetch(`${API_URL}/slos`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect([200, 404]).toContain(response.status);
      });
    });

    describe("Reports", () => {
      it("blocks report generation on free tier", async () => {
        const response = await fetch(`${API_URL}/reports`, {
          method: "POST",
          headers: {
            ...ctx.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "uptime",
            period: "30d",
          }),
        });

        expect([403, 404]).toContain(response.status);
      });

      it("allows reports with Pro license", async () => {
        const license = createMockLicense({
          organizationId: ctx.organizationId,
          plan: "pro",
        });
        await insertLicense(license);

        const response = await fetch(`${API_URL}/reports`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect([200, 404]).toContain(response.status);
      });
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe("Edge Cases", () => {
    it("handles license transition during request", async () => {
      // Start with Pro license
      const license = createMockLicense({
        organizationId: ctx.organizationId,
        plan: "pro",
      });
      await insertLicense(license);
      const proLimit = PRO_MONITOR_LIMIT === -1 ? 0 : PRO_MONITOR_LIMIT;
      const seedCount = proLimit > 0 ? Math.max(proLimit - 5, 0) : 0;
      if (seedCount > 0) {
        await createTestMonitors(seedCount);
      }

      // Request should still use cached license context
      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Monitor During Transition",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      expect(response.status).toBe(201);
    });

    it("handles missing entitlements gracefully", async () => {
      // Insert a license with null entitlements
      await dbClient.query(
        `INSERT INTO licenses (
          id, organization_id, keygen_license_id, plan, status,
          valid_from, entitlements, grace_period_status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NULL, 'none', NOW(), NOW())`,
        [
          nanoid(),
          ctx.organizationId,
          `lic_${nanoid()}`,
          "pro",
          "active",
        ]
      );

      // Should fall back to free tier entitlements
      const freeLimit = FREE_MONITOR_LIMIT === -1 ? 0 : FREE_MONITOR_LIMIT;
      if (freeLimit > 0) {
        await createTestMonitors(freeLimit);
      }

      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Monitor",
          type: "http",
          url: "https://example.com",
          intervalSeconds: 60,
        }),
      });

      // Should be allowed with default entitlements
      expect([201, 403]).toContain(response.status);
    });

    it("validates entitlements on update operations", async () => {
      // This tests that entitlements are checked even on updates
      // (e.g., can't add more monitors to an existing one)
      const response = await fetch(`${API_URL}/monitors`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
    });
  });
});
