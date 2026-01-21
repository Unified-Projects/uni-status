import { Client } from "pg";
import { bootstrapTestContext, type TestContext } from "../helpers/context";
import {
  initializeSystemSettings,
  insertPendingApproval,
  getPendingApproval,
  insertUser,
  setUserSystemRole,
  clearSystemSettings,
} from "../helpers/data";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Pending approvals API", () => {
  let ctx: TestContext;
  let pendingUser: { id: string };
  let approvalId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  beforeEach(async () => {
    // Setup: Initialize system as self-hosted with approval mode
    await clearSystemSettings();
    await initializeSystemSettings({
      setupCompleted: true,
      signupMode: "open_with_approval",
      primaryOrganizationId: ctx.organizationId,
    });

    // Create a pending user
    pendingUser = await insertUser({
      email: `pending-${Date.now()}@example.com`,
      name: "Pending User",
    });

    // Create a pending approval
    const approval = await insertPendingApproval({
      userId: pendingUser.id,
      organizationId: ctx.organizationId,
      status: "pending",
    });
    approvalId = approval.id;

    // Make test user a super admin for most tests
    await setUserSystemRole(ctx.userId, "super_admin");
  });

  describe("GET /api/v1/pending-approvals", () => {
    it("requires authentication", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals`);
      expect(response.status).toBe(401);
    });

    it("requires admin or owner role", async () => {
      // Reset to non-super-admin to test org-level permissions
      await setUserSystemRole(ctx.userId, null);

      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals`, {
        headers: ctx.headers,
      });

      // Should work because ctx user is an owner of the organization
      expect(response.status).toBe(200);
    });

    it("returns pending approvals list", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      const approval = body.data.find((a: any) => a.id === approvalId);
      expect(approval).toBeDefined();
      expect(approval.status).toBe("pending");
      expect(approval.user).toHaveProperty("email");
    });

    it("includes user details in response", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      const approval = body.data.find((a: any) => a.id === approvalId);
      expect(approval.user).toHaveProperty("id");
      expect(approval.user).toHaveProperty("email");
      expect(approval.user).toHaveProperty("name");
    });
  });

  describe("GET /api/v1/pending-approvals/me", () => {
    it("returns own approval status for pending user", async () => {
      // Create API key for pending user
      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      const { randomBytes, randomUUID } = await import("crypto");
      const token = `us_${randomBytes(16).toString("hex")}`;
      const keyPrefix = token.slice(0, 8);
      const now = new Date();

      await client.query(
        `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          ctx.organizationId,
          "pending-user-key",
          token,
          keyPrefix,
          JSON.stringify(["read"]),
          pendingUser.id,
          now,
          now,
        ]
      );
      await client.end();

      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("pending");
      expect(body.data).toHaveProperty("requestedAt");
    });

    it("returns approved status after approval", async () => {
      // Approve the user first
      await fetch(`${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/approve`, {
        method: "POST",
        headers: ctx.headers,
      });

      // Check status
      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      const { randomBytes, randomUUID } = await import("crypto");
      const token = `us_${randomBytes(16).toString("hex")}`;
      const keyPrefix = token.slice(0, 8);
      const now = new Date();

      await client.query(
        `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          ctx.organizationId,
          "approved-user-key",
          token,
          keyPrefix,
          JSON.stringify(["read"]),
          pendingUser.id,
          now,
          now,
        ]
      );
      await client.end();

      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.status).toBe("approved");
    });
  });

  describe("POST /api/v1/pending-approvals/:id/approve", () => {
    it("requires authentication", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/approve`,
        { method: "POST" }
      );
      expect(response.status).toBe(401);
    });

    it("requires admin or owner role", async () => {
      // Create a viewer member
      const { randomBytes, randomUUID } = await import("crypto");
      const viewerId = randomUUID();
      const viewerToken = `us_${randomBytes(16).toString("hex")}`;
      const now = new Date();

      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      await client.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, $5)`,
        [viewerId, `viewer-${viewerId.slice(0, 8)}@example.com`, "Viewer User", now, now]
      );

      await client.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), ctx.organizationId, viewerId, "viewer", now, now, now]
      );

      await client.query(
        `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          ctx.organizationId,
          "viewer-key",
          viewerToken,
          viewerToken.slice(0, 8),
          JSON.stringify(["read"]),
          viewerId,
          now,
          now,
        ]
      );
      await client.end();

      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/approve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${viewerToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(403);
    });

    it("approves user and adds to organization", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/approve`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify approval status
      const approval = await getPendingApproval(approvalId);
      expect(approval?.status).toBe("approved");
      expect(approval?.reviewedBy).toBe(ctx.userId);
      expect(approval?.reviewedAt).not.toBeNull();

      // Verify user was added to organization
      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      const memberResult = await client.query(
        `SELECT * FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
        [pendingUser.id, ctx.organizationId]
      );
      await client.end();

      expect(memberResult.rows.length).toBe(1);
      expect(memberResult.rows[0].role).toBe("member"); // Default role
    });

    it("returns 404 for non-existent approval", async () => {
      const { randomUUID } = await import("crypto");
      const fakeId = randomUUID();

      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${fakeId}/approve`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });

    it("returns error for already processed approval", async () => {
      // Approve first
      await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/approve`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      // Try to approve again
      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/approve`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("ALREADY_PROCESSED");
    });
  });

  describe("POST /api/v1/pending-approvals/:id/reject", () => {
    it("rejects user approval", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/reject`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ notes: "Account not authorized" }),
        }
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify rejection
      const approval = await getPendingApproval(approvalId);
      expect(approval?.status).toBe("rejected");
      expect(approval?.notes).toBe("Account not authorized");
    });

    it("does not add rejected user to organization", async () => {
      await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/reject`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      const memberResult = await client.query(
        `SELECT * FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
        [pendingUser.id, ctx.organizationId]
      );
      await client.end();

      expect(memberResult.rows.length).toBe(0);
    });

    it("requires admin or owner role", async () => {
      await setUserSystemRole(ctx.userId, null);

      // Create viewer and try to reject
      const { randomBytes, randomUUID } = await import("crypto");
      const viewerId = randomUUID();
      const viewerToken = `us_${randomBytes(16).toString("hex")}`;
      const now = new Date();

      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      await client.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, $5)`,
        [viewerId, `viewer2-${viewerId.slice(0, 8)}@example.com`, "Viewer 2", now, now]
      );

      await client.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), ctx.organizationId, viewerId, "viewer", now, now, now]
      );

      await client.query(
        `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          ctx.organizationId,
          "viewer2-key",
          viewerToken,
          viewerToken.slice(0, 8),
          JSON.stringify(["read"]),
          viewerId,
          now,
          now,
        ]
      );
      await client.end();

      const response = await fetch(
        `${API_BASE_URL}/api/v1/pending-approvals/${approvalId}/reject`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${viewerToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(403);
    });
  });
});
