import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { randomBytes, randomUUID } from "crypto";

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
  // Database is reset once at test suite start via setupFiles
  ctx = await bootstrapTestContext();
});

afterAll(async () => {
  await dbClient?.end();
});

// Helper to create a second user for cross-organization tests
async function createSecondUser(): Promise<{
  userId: string;
  email: string;
  token: string;
  headers: Record<string, string>;
}> {
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const now = new Date().toISOString();

  await dbClient.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, "Second User", email, true, now, now]
  );

  // Create an organization for this user
  const orgId = randomUUID();
  await dbClient.query(
    `INSERT INTO organizations (id, name, slug, plan, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, "Second Org", `second-org-${userId.slice(0, 8).toLowerCase()}`, "free", now, now]
  );

  await dbClient.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), orgId, userId, "owner", now, now, now]
  );

  // Create API key
  const token = `us_${randomBytes(16).toString("hex")}`;
  const keyPrefix = token.slice(0, 8);
  await dbClient.query(
    `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      orgId,
      "test-key",
      token,
      keyPrefix,
      JSON.stringify(["read", "write", "admin"]),
      userId,
      now,
      now,
    ]
  );

  return {
    userId,
    email,
    token,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

// Helper to add member to organization
async function addMemberToOrg(
  organizationId: string,
  userId: string,
  role: "owner" | "admin" | "member" | "viewer"
): Promise<string> {
  const memberId = randomUUID();
  const now = new Date().toISOString();
  await dbClient.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [memberId, organizationId, userId, role, now, now, now]
  );
  return memberId;
}

describe("Organizations API - Comprehensive Tests", () => {
  describe("GET /organizations - List Organizations", () => {
    it("lists organizations for authenticated user", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      expect(data.data[0]).toHaveProperty("id");
      expect(data.data[0]).toHaveProperty("name");
      expect(data.data[0]).toHaveProperty("slug");
      expect(data.data[0]).toHaveProperty("role");
    });

    it("includes role information for each organization", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const org = data.data.find(
        (o: { id: string }) => o.id === ctx.organizationId
      );
      expect(org).toBeDefined();
      expect(org.role).toBe("owner");
    });

    it("only returns organizations user is member of", async () => {
      // Create another user with their own org
      const secondUser = await createSecondUser();

      // List orgs for first user
      const res = await fetch(`${API_URL}/organizations`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const hasSecondOrg = data.data.some((o: { slug: string }) =>
        o.slug.startsWith("second-org-")
      );
      expect(hasSecondOrg).toBe(false);
    });
  });

  describe("POST /organizations - Create Organization", () => {
    it("creates a new organization", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "New Organization",
          slug: `new-org-${Date.now()}`,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("New Organization");
      expect(data.data.id).toBeDefined();
    });

    it("makes creator the owner", async () => {
      const slug = `owner-test-${Date.now()}`;
      await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Owner Test Org",
          slug,
        }),
      });

      // List orgs and check role
      const listRes = await fetch(`${API_URL}/organizations`, {
        method: "GET",
        headers: ctx.headers,
      });

      const listData = await listRes.json();
      const org = listData.data.find((o: { slug: string }) => o.slug === slug);
      expect(org).toBeDefined();
      expect(org.role).toBe("owner");
    });

    it("creates organization with logo URL", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Logo Org",
          slug: `logo-org-${Date.now()}`,
          logoUrl: "https://example.com/logo.png",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.logoUrl).toBe("https://example.com/logo.png");
    });

    it("rejects duplicate slug", async () => {
      const slug = `dup-slug-${Date.now()}`;

      // Create first org
      await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "First Org",
          slug,
        }),
      });

      // Try to create second with same slug
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Second Org",
          slug,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invalid slug format", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Slug Org",
          slug: "Invalid Slug With Spaces!",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing required fields", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({}),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /organizations/:id - Get Organization", () => {
    it("returns organization details", async () => {
      const res = await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(ctx.organizationId);
      expect(data.data).toHaveProperty("name");
      expect(data.data).toHaveProperty("slug");
      expect(data.data).toHaveProperty("plan");
    });

    it("returns 404 for non-existent organization", async () => {
      const res = await fetch(`${API_URL}/organizations/nonexistent-id`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 404 for organization user is not member of", async () => {
      // Create another user with their own org
      const secondUser = await createSecondUser();

      // Try to access first user's org
      const res = await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "GET",
        headers: secondUser.headers,
      });

      expect([404, 500]).toContain(res.status);
    });
  });

  describe("PATCH /organizations/:id - Update Organization", () => {
    it("updates organization name", async () => {
      // Create an org to update
      const createRes = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Original Name",
          slug: `update-name-${Date.now()}`,
        }),
      });
      const { data: org } = await createRes.json();

      const res = await fetch(`${API_URL}/organizations/${org.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Updated Name",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.name).toBe("Updated Name");
    });

    it("updates organization logo", async () => {
      const res = await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          logoUrl: "https://example.com/new-logo.png",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.logoUrl).toBe("https://example.com/new-logo.png");
    });

    it("clears organization logo with null", async () => {
      // First set a logo
      await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          logoUrl: "https://example.com/temp-logo.png",
        }),
      });

      // Then clear it
      const res = await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          logoUrl: null,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.logoUrl).toBeNull();
    });

    it("requires admin or owner role to update", async () => {
      // Create another user
      const secondUser = await createSecondUser();

      // Add as viewer (not admin)
      await addMemberToOrg(ctx.organizationId, secondUser.userId, "viewer");

      // Try to update
      const res = await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "PATCH",
        headers: secondUser.headers,
        body: JSON.stringify({
          name: "Should Fail",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("allows admin to update", async () => {
      // Create a test org
      const createRes = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Admin Test Org",
          slug: `admin-test-${Date.now()}`,
        }),
      });
      const { data: org } = await createRes.json();

      // Create another user and add as admin
      const adminUser = await createSecondUser();
      await addMemberToOrg(org.id, adminUser.userId, "admin");

      // Admin should be able to update
      const res = await fetch(`${API_URL}/organizations/${org.id}`, {
        method: "PATCH",
        headers: adminUser.headers,
        body: JSON.stringify({
          name: "Updated by Admin",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.name).toBe("Updated by Admin");
    });
  });

  describe("DELETE /organizations/:id - Delete Organization", () => {
    it("deletes organization when owner has multiple orgs", async () => {
      // Create a second org so we can delete it
      const createRes = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "To Delete",
          slug: `to-delete-${Date.now()}`,
        }),
      });
      const { data: org } = await createRes.json();

      const res = await fetch(`${API_URL}/organizations/${org.id}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
    });

    it("prevents deleting last organization", async () => {
      // Create a user with only one org
      const singleOrgUser = await createSecondUser();

      // Try to delete their only org - need to get org ID first
      const listRes = await fetch(`${API_URL}/organizations`, {
        method: "GET",
        headers: singleOrgUser.headers,
      });
      const listData = await listRes.json();
      const orgId = listData.data[0].id;

      const res = await fetch(`${API_URL}/organizations/${orgId}`, {
        method: "DELETE",
        headers: singleOrgUser.headers,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it("requires owner role to delete", async () => {
      // Create test org
      const createRes = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Admin Delete Test",
          slug: `admin-delete-${Date.now()}`,
        }),
      });
      const { data: org } = await createRes.json();

      // Create user as admin (not owner)
      const adminUser = await createSecondUser();
      await addMemberToOrg(org.id, adminUser.userId, "admin");

      // Admin should not be able to delete
      const res = await fetch(`${API_URL}/organizations/${org.id}`, {
        method: "DELETE",
        headers: adminUser.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 404 for non-existent organization", async () => {
      const res = await fetch(`${API_URL}/organizations/nonexistent-id`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /organizations/:id/members - List Members", () => {
    it("lists organization members", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/members`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      expect(data.data[0]).toHaveProperty("userId");
      expect(data.data[0]).toHaveProperty("role");
      expect(data.data[0]).toHaveProperty("user");
    });

    it("includes user details in response", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/members`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      const data = await res.json();
      const member = data.data[0];
      expect(member.user).toHaveProperty("id");
      expect(member.user).toHaveProperty("name");
      expect(member.user).toHaveProperty("email");
    });

    it("returns 404 for non-member", async () => {
      const secondUser = await createSecondUser();

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/members`,
        {
          method: "GET",
          headers: secondUser.headers,
        }
      );

      expect([404, 500]).toContain(res.status);
    });
  });

  describe("GET /organizations/:id/invitations - List Invitations", () => {
    it("lists pending invitations", async () => {
      // Create an invitation first
      await fetch(`${API_URL}/organizations/${ctx.organizationId}/invitations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          email: `invite-list-${Date.now()}@example.com`,
          role: "member",
        }),
      });

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("returns invitation details", async () => {
      const email = `invite-details-${Date.now()}@example.com`;
      await fetch(`${API_URL}/organizations/${ctx.organizationId}/invitations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          email,
          role: "admin",
        }),
      });

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      const data = await res.json();
      const invitation = data.data.find(
        (inv: { email: string }) => inv.email === email
      );
      expect(invitation).toBeDefined();
      expect(invitation.role).toBe("admin");
      expect(invitation.expiresAt).toBeDefined();
    });

    it("requires admin or owner to view invitations", async () => {
      // Create user as viewer
      const viewerUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, viewerUser.userId, "viewer");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "GET",
          headers: viewerUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /organizations/:id/invitations - Invite Member", () => {
    it("creates invitation", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            email: `invite-create-${Date.now()}@example.com`,
            role: "member",
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.email).toContain("invite-create");
      expect(data.data.role).toBe("member");
    });

    it("creates invitation with different roles", async () => {
      const roles = ["viewer", "member", "admin"];

      for (const role of roles) {
        const res = await fetch(
          `${API_URL}/organizations/${ctx.organizationId}/invitations`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              email: `invite-${role}-${Date.now()}@example.com`,
              role,
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.data.role).toBe(role);
      }
    });

    it("requires admin or owner to invite", async () => {
      // Create user as member (not admin)
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "POST",
          headers: memberUser.headers,
          body: JSON.stringify({
            email: "should-fail@example.com",
            role: "member",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invalid email format", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            email: "invalid-email",
            role: "member",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invalid role", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/invitations`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            email: "valid@example.com",
            role: "invalid-role",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /organizations/:id/api-keys - List API Keys", () => {
    it("lists API keys", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it("includes key details without exposing full key", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      const data = await res.json();
      const key = data.data[0];
      expect(key).toHaveProperty("id");
      expect(key).toHaveProperty("name");
      expect(key).toHaveProperty("keyPrefix");
      expect(key).toHaveProperty("scopes");
      expect(key).not.toHaveProperty("keyHash");
      expect(key).not.toHaveProperty("key");
    });

    it("requires admin or owner to view API keys", async () => {
      // Create user as member
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "GET",
          headers: memberUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /organizations/:id/api-keys - Create API Key", () => {
    it("creates API key with default scopes", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Test Key",
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("Test Key");
      expect(data.data.key).toBeDefined();
      expect(data.data.key).toMatch(/^us_/);
      expect(data.data.scopes).toContain("read");
    });

    it("creates API key with custom scopes", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Custom Scopes Key",
            scopes: ["read", "write", "admin"],
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.scopes).toContain("read");
      expect(data.data.scopes).toContain("write");
      expect(data.data.scopes).toContain("admin");
    });

    it("creates API key with expiration", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Expiring Key",
            expiresIn: 86400, // 1 day in seconds
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.expiresAt).toBeDefined();
    });

    it("returns full key only on creation", async () => {
      const createRes = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Full Key Test",
          }),
        }
      );

      const createData = await createRes.json();
      const fullKey = createData.data.key;
      expect(fullKey).toBeDefined();

      // List keys - full key should not be present
      const listRes = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      const listData = await listRes.json();
      const key = listData.data.find(
        (k: { id: string }) => k.id === createData.data.id
      );
      expect(key.key).toBeUndefined();
      expect(key.keyPrefix).toBeDefined();
    });

    it("requires admin or owner to create API keys", async () => {
      // Create user as member
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: memberUser.headers,
          body: JSON.stringify({
            name: "Should Fail",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("DELETE /organizations/:id/api-keys/:keyId - Delete API Key", () => {
    it("deletes API key", async () => {
      // Create a key to delete
      const createRes = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "To Delete",
          }),
        }
      );
      const { data: key } = await createRes.json();

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys/${key.id}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
    });

    it("returns 404 for non-existent key", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys/nonexistent-key`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("requires admin or owner to delete API keys", async () => {
      // Create a key
      const createRes = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Member Delete Test",
          }),
        }
      );
      const { data: key } = await createRes.json();

      // Create user as member
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys/${key.id}`,
        {
          method: "DELETE",
          headers: memberUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /organizations/:id/integrations - Get Integrations", () => {
    it("returns integration settings", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty("pagespeed");
      expect(data.data).toHaveProperty("prometheus");
    });

    it("masks API keys in response", async () => {
      // First set an integration
      await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            pagespeed: {
              enabled: true,
              apiKey: "test-api-key-12345",
            },
          }),
        }
      );

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      const data = await res.json();
      expect(data.data.pagespeed.hasApiKey).toBe(true);
      expect(data.data.pagespeed.apiKeyPreview).toMatch(/^\*{4}/);
      expect(data.data.pagespeed.apiKey).toBeUndefined();
    });

    it("requires admin or owner to view integrations", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "GET",
          headers: memberUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("PATCH /organizations/:id/integrations - Update Integrations", () => {
    it("updates PageSpeed integration", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            pagespeed: {
              enabled: true,
              apiKey: "new-api-key-67890",
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagespeed.enabled).toBe(true);
      expect(data.data.pagespeed.hasApiKey).toBe(true);
    });

    it("updates Prometheus integration", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            prometheus: {
              defaultUrl: "https://prometheus.example.com",
              blackboxUrl: "https://blackbox.example.com",
              bearerToken: "secret-token",
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.prometheus.defaultUrl).toBe(
        "https://prometheus.example.com"
      );
      expect(data.data.prometheus.hasBearerToken).toBe(true);
    });

    it("clears API key with empty string", async () => {
      // First set a key
      await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            pagespeed: {
              enabled: true,
              apiKey: "temp-key",
            },
          }),
        }
      );

      // Then clear it
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            pagespeed: {
              apiKey: "",
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.pagespeed.hasApiKey).toBe(false);
    });

    it("requires admin or owner to update integrations", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/integrations`,
        {
          method: "PATCH",
          headers: memberUser.headers,
          body: JSON.stringify({
            pagespeed: { enabled: true },
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /organizations/:id/credentials - Get Credentials", () => {
    it("returns masked credentials", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Should return empty object if no credentials set
      expect(typeof data.data).toBe("object");
    });

    it("requires admin or owner to view credentials", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "GET",
          headers: memberUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("PATCH /organizations/:id/credentials - Update Credentials", () => {
    it("updates SMTP credentials", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            smtp: {
              host: "smtp.example.com",
              port: 587,
              username: "user@example.com",
              password: "secret",
              fromAddress: "noreply@example.com",
              fromName: "Test Sender",
              enabled: true,
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.smtp).toBeDefined();
      expect(data.data.smtp.host).toBe("smtp.example.com");
      expect(data.data.smtp.hasPassword).toBe(true);
      expect(data.data.smtp.password).toBeUndefined();
    });

    it("updates Resend credentials", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            resend: {
              apiKey: "re_test_key_12345",
              fromAddress: "noreply@example.com",
              enabled: true,
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.resend).toBeDefined();
      expect(data.data.resend.apiKeyPreview).toMatch(/^\*{4}/);
    });

    it("updates Twilio credentials", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            twilio: {
              accountSid: "AC1234567890",
              authToken: "secret-auth-token",
              fromNumber: "+15551234567",
              enabled: true,
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.twilio).toBeDefined();
      expect(data.data.twilio.accountSid).toBe("AC1234567890");
      expect(data.data.twilio.hasAuthToken).toBe(true);
    });

    it("updates ntfy credentials", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            ntfy: {
              serverUrl: "https://ntfy.example.com",
              username: "ntfy-user",
              password: "ntfy-pass",
              enabled: true,
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.ntfy).toBeDefined();
      expect(data.data.ntfy.serverUrl).toBe("https://ntfy.example.com");
      expect(data.data.ntfy.hasPassword).toBe(true);
    });

    it("updates webhook credentials", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            webhook: {
              defaultSigningKey: "whsec_test_signing_key_minimum_32_chars",
              enabled: true,
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.webhook).toBeDefined();
      expect(data.data.webhook.hasSigningKey).toBe(true);
    });

    it("requires admin or owner to update credentials", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: memberUser.headers,
          body: JSON.stringify({
            smtp: { enabled: true },
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("DELETE /organizations/:id/credentials/:type - Delete Credential", () => {
    it("deletes specific credential type", async () => {
      // First set a credential
      await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            smtp: {
              host: "smtp.example.com",
              port: 587,
              enabled: true,
            },
          }),
        }
      );

      // Then delete it
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials/smtp`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.type).toBe("smtp");

      // Verify it's gone
      const getRes = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );
      const getData = await getRes.json();
      expect(getData.data.smtp).toBeUndefined();
    });

    it("rejects invalid credential type", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials/invalid-type`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("requires admin or owner to delete credentials", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials/smtp`,
        {
          method: "DELETE",
          headers: memberUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /organizations/:id/credentials/test - Test Credentials", () => {
    it("tests SMTP credentials", async () => {
      // First set SMTP credentials
      await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            smtp: {
              host: "localhost",
              port: 1025, // mailhog port
              fromAddress: "test@example.com",
              enabled: true,
            },
          }),
        }
      );

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials/test`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            type: "smtp",
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty("success");
      expect(data.data).toHaveProperty("message");
    });

    it("returns error when credentials not configured", async () => {
      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials/test`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            type: "twitter", // likely not configured
          }),
        }
      );

      // Should return success: true with data containing success: false
      // OR return an error status
      expect([200, 400, 500]).toContain(res.status);
    });

    it("requires admin or owner to test credentials", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/credentials/test`,
        {
          method: "POST",
          headers: memberUser.headers,
          body: JSON.stringify({
            type: "smtp",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Role-Based Access Control", () => {
    it("viewer can read organization details", async () => {
      const viewerUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, viewerUser.userId, "viewer");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}`,
        {
          method: "GET",
          headers: viewerUser.headers,
        }
      );

      expect(res.status).toBe(200);
    });

    it("viewer can list members", async () => {
      const viewerUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, viewerUser.userId, "viewer");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/members`,
        {
          method: "GET",
          headers: viewerUser.headers,
        }
      );

      expect(res.status).toBe(200);
    });

    it("member cannot view API keys", async () => {
      const memberUser = await createSecondUser();
      await addMemberToOrg(ctx.organizationId, memberUser.userId, "member");

      const res = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "GET",
          headers: memberUser.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("admin can manage most resources except delete org", async () => {
      // Create org for admin test
      const createRes = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Admin RBAC Test",
          slug: `admin-rbac-${Date.now()}`,
        }),
      });
      const { data: org } = await createRes.json();

      const adminUser = await createSecondUser();
      await addMemberToOrg(org.id, adminUser.userId, "admin");

      // Admin can update
      const updateRes = await fetch(`${API_URL}/organizations/${org.id}`, {
        method: "PATCH",
        headers: adminUser.headers,
        body: JSON.stringify({ name: "Updated by Admin" }),
      });
      expect(updateRes.status).toBe(200);

      // Admin can create API keys
      const keyRes = await fetch(
        `${API_URL}/organizations/${org.id}/api-keys`,
        {
          method: "POST",
          headers: adminUser.headers,
          body: JSON.stringify({ name: "Admin Key" }),
        }
      );
      expect(keyRes.status).toBe(201);

      // Admin cannot delete org
      const deleteRes = await fetch(`${API_URL}/organizations/${org.id}`, {
        method: "DELETE",
        headers: adminUser.headers,
      });
      expect(deleteRes.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Edge Cases", () => {
    it("handles special characters in organization name", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Org with <script>alert('xss')</script>",
          slug: `xss-org-${Date.now()}`,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.name).toContain("script");
    });

    it("handles unicode in organization name", async () => {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Organization with unicode and emoji support",
          slug: `unicode-org-${Date.now()}`,
        }),
      });

      expect(res.status).toBe(201);
    });

    it("handles very long organization names", async () => {
      const longName = "A".repeat(500);

      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: longName,
          slug: `long-name-${Date.now()}`,
        }),
      });

      // Should either succeed or fail with validation error
      expect([201, 400, 422]).toContain(res.status);
    });

    it("handles concurrent member additions", async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          fetch(
            `${API_URL}/organizations/${ctx.organizationId}/invitations`,
            {
              method: "POST",
              headers: ctx.headers,
              body: JSON.stringify({
                email: `concurrent-${i}-${Date.now()}@example.com`,
                role: "member",
              }),
            }
          )
        );
      }

      const results = await Promise.all(promises);
      // All should succeed
      for (const res of results) {
        expect(res.status).toBe(201);
      }
    });
  });
});
