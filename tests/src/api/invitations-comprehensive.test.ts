import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertInvitation, insertOrganizationMember } from "../helpers/data";
import { Client } from "pg";
import { randomUUID } from "crypto";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

/**
 * Helper to create a user with a specific email and get an API token
 */
async function createUserWithEmail(
  email: string
): Promise<{ userId: string; token: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const userId = randomUUID();
  const orgId = randomUUID();
  const uniquePrefix = randomUUID().slice(0, 8).replace(/-/g, '');
  const token = `us_${uniquePrefix}_${randomUUID().replace(/-/g, "")}`;
  const now = new Date();

  // Create user
  await client.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, $4, $5)`,
    [userId, email.toLowerCase(), `Test User ${email}`, now, now]
  );

  // Create temporary organization for this user
  await client.query(
    `INSERT INTO organizations (id, name, slug, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [orgId, `Temp Org ${userId.slice(0, 8)}`, `temp-${userId.slice(0, 8)}`, now, now]
  );

  // Create organization membership
  await client.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), orgId, userId, "owner", now, now, now]
  );

  // Create API key for this user
  await client.query(
    `INSERT INTO api_keys
      (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      orgId,
      "User API Key",
      token,
      token.slice(0, 8),
      JSON.stringify(["read", "write"]),
      userId,
      now,
      now,
    ]
  );

  await client.end();
  return { userId, token };
}

/**
 * Helper to create an invitation directly in the database
 */
async function createInvitation(
  organizationId: string,
  params: {
    email: string;
    role: "admin" | "member" | "viewer";
    invitedBy: string;
    status?: "pending" | "accepted" | "expired";
    expiresAt?: Date;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const token = `inv_${randomUUID().replace(/-/g, "")}`;
  const now = new Date();
  const expiresAt =
    params.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO organization_invitations
      (id, organization_id, email, role, token, status, invited_by, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      params.email.toLowerCase(),
      params.role,
      token,
      params.status ?? "pending",
      params.invitedBy,
      expiresAt,
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}

describe("Invitations API - Comprehensive", () => {
  let ctx: TestContext;
  let apiUrl: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    apiUrl = `${API_BASE_URL}/api/v1`;
    headers = {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
      "X-Organization-Id": ctx.organizationId,
    };
  });

  // ==========================================
  // Get Pending Invitations for User
  // ==========================================

  describe("Get Pending Invitations", () => {
    it("returns pending invitations for the authenticated user", async () => {
      // Create a user with a specific email
      const testEmail = `invite-test-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      // Create an invitation for this user's email
      await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);

      // Should contain invitation to this email
      const invitation = body.data.find(
        (inv: { email: string }) => inv.email === testEmail.toLowerCase()
      );
      expect(invitation).toBeDefined();
      expect(invitation.role).toBe("member");
      expect(invitation.organization).toBeDefined();
      expect(invitation.organization.id).toBe(ctx.organizationId);
    });

    it("includes organization details in pending invitations", async () => {
      const testEmail = `org-details-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "admin",
        invitedBy: ctx.userId,
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      const invitation = body.data[0];

      expect(invitation.organization).toHaveProperty("id");
      expect(invitation.organization).toHaveProperty("name");
      expect(invitation.organization).toHaveProperty("slug");
    });

    it("includes inviter details when available", async () => {
      const testEmail = `inviter-test-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      const invitation = body.data[0];

      if (invitation.inviter) {
        expect(invitation.inviter).toHaveProperty("id");
        expect(invitation.inviter).toHaveProperty("name");
        expect(invitation.inviter).toHaveProperty("email");
      }
    });

    it("does not include expired invitations", async () => {
      const testEmail = `expired-test-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      // Create an already-expired invitation
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
        expiresAt: expiredDate,
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should not contain the expired invitation
      const expiredInvitation = body.data.find(
        (inv: { email: string }) => inv.email === testEmail.toLowerCase()
      );
      expect(expiredInvitation).toBeUndefined();
    });

    it("does not include already accepted invitations", async () => {
      const testEmail = `accepted-test-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
        status: "accepted",
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      const acceptedInvitation = body.data.find(
        (inv: { email: string }) => inv.email === testEmail.toLowerCase()
      );
      expect(acceptedInvitation).toBeUndefined();
    });

    it("returns empty array when user has no pending invitations", async () => {
      const testEmail = `no-invite-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ==========================================
  // Accept Invitation
  // ==========================================

  describe("Accept Invitation", () => {
    it("accepts an invitation and creates membership", async () => {
      const testEmail = `accept-${randomUUID().slice(0, 8)}@example.com`;
      const { userId, token: userToken } = await createUserWithEmail(testEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.organizationId).toBe(ctx.organizationId);
      expect(body.data.role).toBe("member");
      expect(body.data.membershipId).toBeDefined();
      expect(body.data.organization).toBeDefined();
    });

    it("accepts admin role invitation", async () => {
      const testEmail = `admin-invite-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "admin",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.role).toBe("admin");
    });

    it("accepts viewer role invitation", async () => {
      const testEmail = `viewer-invite-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "viewer",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.role).toBe("viewer");
    });

    it("returns alreadyMember flag if user is already a member", async () => {
      const testEmail = `existing-member-${randomUUID().slice(0, 8)}@example.com`;
      const { userId, token: userToken } = await createUserWithEmail(testEmail);

      // Add user as a member first
      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();
      const now = new Date();
      await client.query(
        `INSERT INTO organization_members
          (id, organization_id, user_id, role, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), ctx.organizationId, userId, "member", now, now, now]
      );
      await client.end();

      // Create an invitation for the same user
      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.alreadyMember).toBe(true);
    });

    it("returns 404 for non-existent invitation", async () => {
      const testEmail = `not-found-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const response = await fetch(
        `${apiUrl}/invitations/non-existent-id/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for expired invitation", async () => {
      const testEmail = `expired-accept-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      // Create an already-expired invitation
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
        expiresAt: expiredDate,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("EXPIRED");
    });

    it("cannot accept invitation meant for different email", async () => {
      const inviteEmail = `other-email-${randomUUID().slice(0, 8)}@example.com`;
      const userEmail = `my-email-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(userEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: inviteEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(404);
    });

    it("cannot accept already-accepted invitation", async () => {
      const testEmail = `already-accepted-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
        status: "accepted",
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Decline Invitation
  // ==========================================

  describe("Decline Invitation", () => {
    it("declines a pending invitation", async () => {
      const testEmail = `decline-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/decline`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.declined).toBe(true);
    });

    it("cannot decline invitation after it is declined", async () => {
      const testEmail = `double-decline-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      // Decline first time
      await fetch(`${apiUrl}/invitations/${invitationId}/decline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      // Try to decline again
      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/decline`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent invitation when declining", async () => {
      const testEmail = `decline-not-found-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      const response = await fetch(
        `${apiUrl}/invitations/non-existent-id/decline`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(404);
    });

    it("cannot decline invitation meant for different email", async () => {
      const inviteEmail = `other-decline-${randomUUID().slice(0, 8)}@example.com`;
      const userEmail = `my-decline-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(userEmail);

      const { id: invitationId } = await createInvitation(ctx.organizationId, {
        email: inviteEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(
        `${apiUrl}/invitations/${invitationId}/decline`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Authorization
  // ==========================================

  describe("Authorization", () => {
    it("requires authentication for getting pending invitations", async () => {
      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`);
      expect(response.status).toBe(401);
    });

    it("requires authentication for accepting invitation", async () => {
      const response = await fetch(`${apiUrl}/invitations/some-id/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(response.status).toBe(401);
    });

    it("requires authentication for declining invitation", async () => {
      const response = await fetch(`${apiUrl}/invitations/some-id/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // Multiple Invitations
  // ==========================================

  describe("Multiple Invitations", () => {
    it("returns all pending invitations from multiple organizations", async () => {
      const testEmail = `multi-org-${randomUUID().slice(0, 8)}@example.com`;
      const { token: userToken } = await createUserWithEmail(testEmail);

      // Create another organization context
      const otherCtx = await bootstrapTestContext();

      // Create invitations from both organizations
      await createInvitation(ctx.organizationId, {
        email: testEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      await createInvitation(otherCtx.organizationId, {
        email: testEmail,
        role: "admin",
        invitedBy: otherCtx.userId,
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Should have invitations from different organizations
      const orgIds = body.data.map(
        (inv: { organizationId: string }) => inv.organizationId
      );
      expect(orgIds).toContain(ctx.organizationId);
      expect(orgIds).toContain(otherCtx.organizationId);
    });
  });

  // ==========================================
  // Email Case Insensitivity
  // ==========================================

  describe("Email Case Insensitivity", () => {
    it("matches invitations regardless of email case", async () => {
      const baseEmail = `case-test-${randomUUID().slice(0, 8)}`;
      const lowerEmail = `${baseEmail}@example.com`;
      const upperEmail = `${baseEmail.toUpperCase()}@EXAMPLE.COM`;

      // Create user with lowercase email
      const { token: userToken } = await createUserWithEmail(lowerEmail);

      // Create invitation with mixed case email
      await createInvitation(ctx.organizationId, {
        email: upperEmail,
        role: "member",
        invitedBy: ctx.userId,
      });

      const response = await fetch(`${apiUrl}/invitations/users/me/invitations`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should find the invitation despite case difference
      const invitation = body.data.find(
        (inv: { email: string }) =>
          inv.email.toLowerCase() === lowerEmail.toLowerCase()
      );
      expect(invitation).toBeDefined();
    });
  });
});
