import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  organizations,
  organizationMembers,
  organizationInvitations,
  apiKeys,
} from "@uni-status/database/schema";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateOrganizationIntegrationsSchema,
  updateOrganizationCredentialsSchema,
  credentialTypeSchema,
  testCredentialsSchema,
  createRoleSchema,
  updateRoleSchema,
} from "@uni-status/shared/validators";
import type { CredentialType } from "@uni-status/shared/validators";
import { PREDEFINED_ROLES, isPredefinedRole, isBaseRole } from "@uni-status/shared/constants/roles";
import { expandWildcards } from "@uni-status/shared/types/permissions";
import { encryptConfigSecrets, decryptConfigSecrets } from "@uni-status/shared/lib/crypto";
import { isSelfHosted } from "@uni-status/shared/config";
import type {
  OrganizationCredentials,
  MaskedOrganizationCredentials,
} from "@uni-status/shared/types/credentials";
import { requireAuth, requireScope } from "../middleware/auth";
import {
  getLicenseContext,
  requireResourceLimit,
  checkFeature,
} from "@uni-status/enterprise/api/middleware/license";
import { eq, and, desc, sql } from "drizzle-orm";
import { sendInvitationEmail } from "../lib/email";
import { createAuditLog, createAuditLogWithChanges, getAuditUserId } from "../lib/audit";
import { canUserCreateFreeOrg } from "../lib/org-membership";
import { deleteFileByUrl } from "../lib/uploads";

export const organizationsRoutes = new OpenAPIHono();

// List user's organizations
organizationsRoutes.get("/", async (c) => {
  const auth = requireAuth(c);

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, auth.user.id),
    with: {
      organization: true,
    },
  });

  return c.json({
    success: true,
    data: memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      logoUrl: m.organization.logo,
      plan: m.organization.plan,
      createdAt: m.organization.createdAt,
      updatedAt: m.organization.updatedAt,
      role: m.role,
    })),
  });
});

// Create organization
organizationsRoutes.post("/", async (c) => {
  const auth = requireAuth(c);

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  const body = await c.req.json();
  const validated = createOrganizationSchema.parse(body);

  // Check free org membership rule (hosted mode only)
  // In hosted mode, users can only be a member of ONE free org
  const freeOrgCheck = await canUserCreateFreeOrg(auth.user.id);
  if (!freeOrgCheck.canProceed) {
    return c.json(
      {
        success: false,
        error: {
          code: "FREE_ORG_LIMIT",
          message: `You are already a member of a free organization (${freeOrgCheck.existingFreeOrgName}). Upgrade to Professional to create additional organizations.`,
        },
      },
      403
    );
  }

  const id = nanoid();
  const now = new Date();

  // Map logoUrl to logo for database storage
  const { logoUrl, ...rest } = validated;

  // Create organization
  // Set subscriptionTier to 'free' for hosted mode, null for self-hosted
  const [org] = await db
    .insert(organizations)
    .values({
      id,
      ...rest,
      logo: logoUrl ?? null,
      subscriptionTier: isSelfHosted() ? null : "free",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!org) {
    return c.json({ success: false, error: "Failed to create organization" }, 500);
  }

  // Add creator as owner
  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: id,
    userId: auth.user.id,
    role: "owner",
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Audit log: organization created
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.create",
    resourceType: "organization",
    resourceId: id,
    resourceName: org.name,
    metadata: {
      after: { name: org.name, slug: org.slug, plan: org.plan },
    },
  });

  return c.json(
    {
      success: true,
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logo,
        plan: org.plan,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
    },
    201
  );
});

// Get current organization (from auth context)
organizationsRoutes.get("/current", async (c) => {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    return c.json(
      { success: false, error: { code: "NO_ORGANIZATION", message: "No organization context" } },
      400
    );
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId),
  });

  if (!org) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Organization not found" } },
      404
    );
  }

  return c.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logo,
      plan: org.plan,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    },
  });
});

// Update current organization (from auth context)
organizationsRoutes.patch("/current", async (c) => {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    return c.json(
      { success: false, error: { code: "NO_ORGANIZATION", message: "No organization context" } },
      400
    );
  }

  const id = auth.organizationId;

  // Verify user is admin or owner
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  }

  // Get current state for audit logging
  const orgBefore = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!orgBefore) {
    throw new Error("Not found");
  }

  const body = await c.req.json();

  // Map logoUrl to logo for database storage
  const { logoUrl, ...rest } = body;
  const updateData: Record<string, unknown> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (logoUrl !== undefined) {
    updateData.logo = logoUrl || null;
  }

  // Delete old logo file if logo is being changed (including cleared)
  const newLogoValue = logoUrl !== undefined ? (logoUrl || null) : undefined;
  if (newLogoValue !== undefined && orgBefore.logo && orgBefore.logo !== newLogoValue) {
    // Fire and forget - don't block update on file deletion
    deleteFileByUrl(orgBefore.logo).catch((err) => {
      console.error("[Organizations] Failed to delete old logo:", err);
    });
  }

  const [org] = await db
    .update(organizations)
    .set(updateData)
    .where(eq(organizations.id, id))
    .returning();

  if (!org) {
    throw new Error("Not found");
  }

  // Audit log: organization updated
  await createAuditLogWithChanges(c, {
    organizationId: id,
    userId: getAuditUserId(c),
    action: "organization.update",
    resourceType: "organization",
    resourceId: id,
    resourceName: org.name,
    before: { name: orgBefore.name, slug: orgBefore.slug, logo: orgBefore.logo },
    after: { name: org.name, slug: org.slug, logo: org.logo },
  });

  return c.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logo,
      plan: org.plan,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    },
  });
});

// Get organization
organizationsRoutes.get("/:id", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Verify user is member
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership) {
      throw new Error("Not found");
    }
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logo,
      plan: org.plan,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    },
  });
});

// Update organization
organizationsRoutes.patch("/:id", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Verify user is admin or owner
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  }

  // Get current state for audit logging
  const orgBefore = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!orgBefore) {
    throw new Error("Not found");
  }

  const body = await c.req.json();

  // Map logoUrl to logo for database storage
  const { logoUrl, ...rest } = body;
  const updateData: Record<string, unknown> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (logoUrl !== undefined) {
    updateData.logo = logoUrl || null;
  }

  // Delete old logo file if logo is being changed (including cleared)
  const newLogoValue = logoUrl !== undefined ? (logoUrl || null) : undefined;
  if (newLogoValue !== undefined && orgBefore.logo && orgBefore.logo !== newLogoValue) {
    // Fire and forget - don't block update on file deletion
    deleteFileByUrl(orgBefore.logo).catch((err) => {
      console.error("[Organizations] Failed to delete old logo:", err);
    });
  }

  const [org] = await db
    .update(organizations)
    .set(updateData)
    .where(eq(organizations.id, id))
    .returning();

  if (!org) {
    throw new Error("Not found");
  }

  // Audit log: organization updated
  await createAuditLogWithChanges(c, {
    organizationId: id,
    userId: getAuditUserId(c),
    action: "organization.update",
    resourceType: "organization",
    resourceId: id,
    resourceName: org.name,
    before: { name: orgBefore.name, slug: orgBefore.slug, logo: orgBefore.logo },
    after: { name: org.name, slug: org.slug, logo: org.logo },
  });

  return c.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logo,
      plan: org.plan,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    },
  });
});

// Delete organization
organizationsRoutes.delete("/:id", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is owner (only owners can delete)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || membership.role !== "owner") {
    throw new Error("Insufficient permissions: only owners can delete organizations");
  }

  // Check if this is the user's only organization
  const membershipCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, auth.user.id));

  if (Number(membershipCount[0]?.count ?? 0) <= 1) {
    return c.json(
      {
        success: false,
        error: "Cannot delete your only organization. Create another organization first.",
      },
      400
    );
  }

  // Get org info before deletion for audit log
  const orgToDelete = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!orgToDelete) {
    throw new Error("Organization not found");
  }

  // Audit log: organization deleted (must be before deletion due to cascade)
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.delete",
    resourceType: "organization",
    resourceId: id,
    resourceName: orgToDelete.name,
    metadata: {
      before: { name: orgToDelete.name, slug: orgToDelete.slug },
    },
  });

  // Delete organization (cascades to all related tables including audit logs)
  const result = await db
    .delete(organizations)
    .where(eq(organizations.id, id))
    .returning();

  if (result.length === 0) {
    throw new Error("Organization not found");
  }

  // Clean up uploaded logo file (fire and forget - don't block response)
  if (orgToDelete.logo) {
    deleteFileByUrl(orgToDelete.logo).catch((err) => {
      console.error("[Organizations] Failed to delete logo on org deletion:", err);
    });
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// === Members ===

// List members of current organization
organizationsRoutes.get("/current/members", async (c) => {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    return c.json(
      { success: false, error: { code: "NO_ORGANIZATION", message: "No organization context" } },
      400
    );
  }

  const members = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, auth.organizationId),
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
        },
      },
    },
    orderBy: [desc(organizationMembers.createdAt)],
  });

  return c.json({
    success: true,
    data: members.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      role: m.role,
      createdAt: m.createdAt,
      user: m.user,
    })),
  });
});

// List members
organizationsRoutes.get("/:id/members", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Verify user is member
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership) {
      throw new Error("Not found");
    }
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, id));

  const total = Number(countResult[0]?.count ?? 0);

  const members = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, id),
    with: {
      user: true,
    },
    limit,
    offset,
  });

  return c.json({
    success: true,
    data: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
      },
    })),
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + members.length < total,
    },
  });
});

// List organization invitations
organizationsRoutes.get("/:id/invitations", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner (only they can see invitations)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, id),
        eq(organizationInvitations.status, "pending")
      )
    );

  const total = Number(countResult[0]?.count ?? 0);

  const invitations = await db.query.organizationInvitations.findMany({
    where: and(
      eq(organizationInvitations.organizationId, id),
      eq(organizationInvitations.status, "pending")
    ),
    orderBy: [desc(organizationInvitations.createdAt)],
    limit,
    offset,
  });

  return c.json({
    success: true,
    data: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      token: inv.token,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    })),
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + invitations.length < total,
    },
  });
});

// Invite member to current organization (from auth context)
organizationsRoutes.post("/current/invitations", async (c) => {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    return c.json(
      { success: false, error: { code: "NO_ORGANIZATION", message: "No organization context" } },
      400
    );
  }

  const id = auth.organizationId;

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can invite
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Check license entitlements for team member limit
  const licenseContext = getLicenseContext(c);
  const currentMemberCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, id));
  const pendingInvitationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, id),
        eq(organizationInvitations.status, "pending")
      )
    );
  const totalMemberCount =
    Number(currentMemberCount[0]?.count ?? 0) + Number(pendingInvitationCount[0]?.count ?? 0);
  requireResourceLimit(
    licenseContext,
    "teamMembers",
    totalMemberCount,
    "Team member"
  );

  const body = await c.req.json();
  const validated = inviteMemberSchema.parse(body);

  const invitationId = nanoid();
  const token = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Get organization name for the email
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const [invitation] = await db
    .insert(organizationInvitations)
    .values({
      id: invitationId,
      organizationId: id,
      email: validated.email,
      role: validated.role,
      token,
      invitedBy: auth.user.id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!invitation) {
    return c.json({ success: false, error: "Failed to create invitation" }, 500);
  }

  // Send invitation email
  await sendInvitationEmail({
    email: validated.email,
    inviterName: auth.user.name || auth.user.email,
    organizationName: org.name,
    role: validated.role,
    inviteToken: token,
    expiresAt,
  });

  // Audit log: member invited
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.member_invite",
    resourceType: "organization",
    resourceId: invitation.id,
    resourceName: validated.email,
    metadata: {
      after: { email: validated.email, role: validated.role },
    },
  });

  return c.json(
    {
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
    },
    201
  );
});

// Invite member
organizationsRoutes.post("/:id/invitations", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can invite
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Check license entitlements for team member limit
  const licenseContext = getLicenseContext(c);
  const currentMemberCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, id));
  const pendingInvitationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, id),
        eq(organizationInvitations.status, "pending")
      )
    );
  const totalMemberCount =
    Number(currentMemberCount[0]?.count ?? 0) + Number(pendingInvitationCount[0]?.count ?? 0);
  requireResourceLimit(
    licenseContext,
    "teamMembers",
    totalMemberCount,
    "Team member"
  );

  const body = await c.req.json();
  const validated = inviteMemberSchema.parse(body);

  const invitationId = nanoid();
  const token = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Get organization name for the email
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const [invitation] = await db
    .insert(organizationInvitations)
    .values({
      id: invitationId,
      organizationId: id,
      email: validated.email,
      role: validated.role,
      token,
      invitedBy: auth.user.id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!invitation) {
    return c.json({ success: false, error: "Failed to create invitation" }, 500);
  }

  // Send invitation email
  await sendInvitationEmail({
    email: validated.email,
    inviterName: auth.user.name || auth.user.email,
    organizationName: org.name,
    role: validated.role,
    inviteToken: token,
    expiresAt,
  });

  // Audit log: member invited
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.member_invite",
    resourceType: "organization",
    resourceId: invitation.id,
    resourceName: validated.email,
    metadata: {
      after: { email: validated.email, role: validated.role },
    },
  });

  return c.json(
    {
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    },
    201
  );
});

// Cancel/delete invitation
organizationsRoutes.delete("/:id/invitations/:invitationId", async (c) => {
  const auth = requireAuth(c);
  const { id, invitationId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can manage invitations
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Find the invitation
  const invitation = await db.query.organizationInvitations.findFirst({
    where: and(
      eq(organizationInvitations.id, invitationId),
      eq(organizationInvitations.organizationId, id)
    ),
  });

  if (!invitation) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Invitation not found" },
      },
      404
    );
  }

  // Delete the invitation
  await db
    .delete(organizationInvitations)
    .where(eq(organizationInvitations.id, invitationId));

  // Audit log: invitation cancelled
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.member_invite_cancel",
    resourceType: "organization",
    resourceId: invitationId,
    resourceName: invitation.email,
    metadata: {
      before: { email: invitation.email, role: invitation.role },
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// === API Keys ===

// List API keys
organizationsRoutes.get("/:id/api-keys", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Verify user can view
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  }

  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.organizationId, id),
    orderBy: [desc(apiKeys.createdAt)],
  });

  return c.json({
    success: true,
    data: keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    })),
  });
});

// Create API key
organizationsRoutes.post("/:id/api-keys", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can create
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const { name, scopes = ["read"], expiresIn } = body;

  // Validate name is provided
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ success: false, error: "Name is required" }, 400);
  }

  // Validate scopes
  const validScopes = ["read", "write", "admin"];
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return c.json({ success: false, error: "Scopes must be a non-empty array" }, 400);
  }
  for (const scope of scopes) {
    if (!validScopes.includes(scope)) {
      return c.json({ success: false, error: `Invalid scope: ${scope}. Valid scopes are: ${validScopes.join(", ")}` }, 400);
    }
  }

  const keyId = nanoid();
  const rawKey = `us_${nanoid(32)}`;
  const keyPrefix = rawKey.slice(0, 11); // us_ + 8 chars
  const keyHash = await Bun.password.hash(rawKey, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const now = new Date();
  const expiresAt = expiresIn
    ? new Date(now.getTime() + expiresIn)
    : null;

  const [key] = await db
    .insert(apiKeys)
    .values({
      id: keyId,
      organizationId: id,
      name,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!key) {
    return c.json({ success: false, error: "Failed to create API key" }, 500);
  }

  // Audit log: API key created
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "api_key.create",
    resourceType: "api_key",
    resourceId: key.id,
    resourceName: name,
    metadata: {
      after: { name, scopes, keyPrefix, expiresAt },
    },
  });

  // Return the raw key only once
  return c.json(
    {
      success: true,
      data: {
        id: key.id,
        name: key.name,
        key: rawKey, // Only returned on creation
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      },
    },
    201
  );
});

// Delete API key
organizationsRoutes.delete("/:id/api-keys/:keyId", async (c) => {
  const auth = requireAuth(c);
  const { id, keyId } = c.req.param();

  // Verify user can delete
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  }

  // Get key info before deletion for audit
  const keyToDelete = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, id)),
  });

  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, id)))
    .returning();

  if (result.length === 0) {
    throw new Error("Not found");
  }

  // Audit log: API key deleted
  await createAuditLog(c, {
    organizationId: id,
    userId: getAuditUserId(c),
    action: "api_key.delete",
    resourceType: "api_key",
    resourceId: keyId,
    resourceName: keyToDelete?.name || "Unknown",
    metadata: {
      before: keyToDelete ? { name: keyToDelete.name, keyPrefix: keyToDelete.keyPrefix } : {},
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// === Integrations ===

// Get organization integrations
organizationsRoutes.get("/:id/integrations", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Verify user can view (admin or owner)
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  // Return integrations settings (mask API key for security)
  const integrations = org.settings?.integrations || {};
  const maskedIntegrations = {
    pagespeed: integrations.pagespeed
      ? {
          enabled: integrations.pagespeed.enabled ?? false,
          hasApiKey: !!integrations.pagespeed.apiKey,
          // Only show last 4 characters of API key for display
          apiKeyPreview: integrations.pagespeed.apiKey
            ? `****${integrations.pagespeed.apiKey.slice(-4)}`
            : null,
        }
      : { enabled: false, hasApiKey: false, apiKeyPreview: null },
    prometheus: integrations.prometheus
      ? {
          defaultUrl: integrations.prometheus.defaultUrl,
          blackboxUrl: integrations.prometheus.blackboxUrl,
          alloyEmbedUrl: integrations.prometheus.alloyEmbedUrl,
          defaultModule: integrations.prometheus.defaultModule,
          hasBearerToken: !!integrations.prometheus.bearerToken,
          bearerTokenPreview: integrations.prometheus.bearerToken
            ? `****${integrations.prometheus.bearerToken.slice(-4)}`
            : null,
          hasRemoteWriteToken: !!integrations.prometheus.remoteWriteToken,
          remoteWriteTokenPreview: integrations.prometheus.remoteWriteToken
            ? `****${integrations.prometheus.remoteWriteToken.slice(-4)}`
            : null,
        }
      : {
          defaultUrl: undefined,
          blackboxUrl: undefined,
          alloyEmbedUrl: undefined,
          defaultModule: undefined,
          hasBearerToken: false,
          bearerTokenPreview: null,
          hasRemoteWriteToken: false,
          remoteWriteTokenPreview: null,
        },
  };

  return c.json({
    success: true,
    data: maskedIntegrations,
  });
});

// Update organization integrations
organizationsRoutes.patch("/:id/integrations", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can update (admin or owner)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const validated = updateOrganizationIntegrationsSchema.parse(body);

  // Get current org settings
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  // Merge integrations settings
  const currentSettings = org.settings || {};
  const currentIntegrations = currentSettings.integrations || {};

  const updatedIntegrations = {
    ...currentIntegrations,
  };

  // Update PageSpeed integration
  if (validated.pagespeed !== undefined) {
    updatedIntegrations.pagespeed = {
      ...currentIntegrations.pagespeed,
      ...validated.pagespeed,
    };
    // If apiKey is explicitly set to empty string, remove it
    if (validated.pagespeed.apiKey === "") {
      delete updatedIntegrations.pagespeed.apiKey;
    }
  }

  // Update Prometheus integration
  if (validated.prometheus !== undefined) {
    updatedIntegrations.prometheus = {
      ...currentIntegrations.prometheus,
      ...validated.prometheus,
    };

    // Allow clearing sensitive tokens when empty string provided
    if (validated.prometheus.bearerToken === "") {
      delete updatedIntegrations.prometheus.bearerToken;
    }
    if (validated.prometheus.remoteWriteToken === "") {
      delete updatedIntegrations.prometheus.remoteWriteToken;
    }
  }

  const updatedSettings = {
    ...currentSettings,
    integrations: updatedIntegrations,
  };

  const [updatedOrg] = await db
    .update(organizations)
    .set({
      settings: updatedSettings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id))
    .returning();

  // Audit log: integrations updated
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "settings.update",
    resourceType: "organization",
    resourceId: id,
    resourceName: "Integrations",
    metadata: {
      after: {
        pagespeed: validated.pagespeed ? { enabled: validated.pagespeed.enabled } : undefined,
        prometheus: validated.prometheus ? { defaultUrl: validated.prometheus.defaultUrl } : undefined,
      },
    },
  });

  // Return masked response
  const maskedIntegrations = {
    pagespeed: updatedIntegrations.pagespeed
      ? {
          enabled: updatedIntegrations.pagespeed.enabled ?? false,
          hasApiKey: !!updatedIntegrations.pagespeed.apiKey,
          apiKeyPreview: updatedIntegrations.pagespeed.apiKey
            ? `****${updatedIntegrations.pagespeed.apiKey.slice(-4)}`
            : null,
        }
      : { enabled: false, hasApiKey: false, apiKeyPreview: null },
    prometheus: updatedIntegrations.prometheus
      ? {
          defaultUrl: updatedIntegrations.prometheus.defaultUrl,
          blackboxUrl: updatedIntegrations.prometheus.blackboxUrl,
          alloyEmbedUrl: updatedIntegrations.prometheus.alloyEmbedUrl,
          defaultModule: updatedIntegrations.prometheus.defaultModule,
          hasBearerToken: !!updatedIntegrations.prometheus.bearerToken,
          bearerTokenPreview: updatedIntegrations.prometheus.bearerToken
            ? `****${updatedIntegrations.prometheus.bearerToken.slice(-4)}`
            : null,
          hasRemoteWriteToken: !!updatedIntegrations.prometheus.remoteWriteToken,
          remoteWriteTokenPreview: updatedIntegrations.prometheus.remoteWriteToken
            ? `****${updatedIntegrations.prometheus.remoteWriteToken.slice(-4)}`
            : null,
        }
      : {
          defaultUrl: undefined,
          blackboxUrl: undefined,
          alloyEmbedUrl: undefined,
          defaultModule: undefined,
          hasBearerToken: false,
          bearerTokenPreview: null,
          hasRemoteWriteToken: false,
          remoteWriteTokenPreview: null,
        },
  };

  return c.json({
    success: true,
    data: maskedIntegrations,
  });
});

// === Credentials (BYO Integration Credentials) ===

// Helper function to mask credentials for API responses
function maskCredentials(credentials: OrganizationCredentials | undefined): MaskedOrganizationCredentials {
  if (!credentials) {
    return {};
  }

  const masked: MaskedOrganizationCredentials = {};

  if (credentials.smtp) {
    masked.smtp = {
      host: credentials.smtp.host,
      port: credentials.smtp.port,
      username: credentials.smtp.username,
      hasPassword: !!credentials.smtp.password,
      fromAddress: credentials.smtp.fromAddress,
      fromName: credentials.smtp.fromName,
      secure: credentials.smtp.secure,
      enabled: credentials.smtp.enabled,
    };
  }

  if (credentials.resend) {
    masked.resend = {
      apiKeyPreview: credentials.resend.apiKey
        ? `****${credentials.resend.apiKey.slice(-4)}`
        : "",
      fromAddress: credentials.resend.fromAddress,
      enabled: credentials.resend.enabled,
    };
  }

  if (credentials.twilio) {
    masked.twilio = {
      accountSid: credentials.twilio.accountSid,
      hasAuthToken: !!credentials.twilio.authToken,
      fromNumber: credentials.twilio.fromNumber,
      enabled: credentials.twilio.enabled,
    };
  }

  if (credentials.ntfy) {
    masked.ntfy = {
      serverUrl: credentials.ntfy.serverUrl,
      username: credentials.ntfy.username,
      hasPassword: !!credentials.ntfy.password,
      enabled: credentials.ntfy.enabled,
    };
  }

  if (credentials.irc) {
    masked.irc = {
      defaultServer: credentials.irc.defaultServer,
      defaultPort: credentials.irc.defaultPort,
      defaultNickname: credentials.irc.defaultNickname,
      hasPassword: !!credentials.irc.defaultPassword,
      useSsl: credentials.irc.useSsl,
      enabled: credentials.irc.enabled,
    };
  }

  if (credentials.twitter) {
    masked.twitter = {
      hasApiKey: !!credentials.twitter.apiKey,
      hasApiSecret: !!credentials.twitter.apiSecret,
      hasAccessToken: !!credentials.twitter.accessToken,
      hasAccessSecret: !!credentials.twitter.accessSecret,
      enabled: credentials.twitter.enabled,
    };
  }

  if (credentials.webhook) {
    masked.webhook = {
      hasSigningKey: !!credentials.webhook.defaultSigningKey,
      enabled: credentials.webhook.enabled,
    };
  }

  return masked;
}

// Get organization credentials (masked)
organizationsRoutes.get("/:id/credentials", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Verify user can view (admin or owner)
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const credentials = org.settings?.credentials;
  const maskedCredentials = maskCredentials(credentials);

  return c.json({
    success: true,
    data: maskedCredentials,
  });
});

// Update organization credentials
organizationsRoutes.patch("/:id/credentials", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can update (admin or owner)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const validated = updateOrganizationCredentialsSchema.parse(body);

  // Get current org settings
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  // Merge credentials with existing
  const currentSettings = org.settings || {};
  const currentCredentials = currentSettings.credentials || {};

  const updatedCredentials: OrganizationCredentials = { ...currentCredentials };

  // Update each credential type if provided
  if (validated.smtp !== undefined) {
    updatedCredentials.smtp = { ...currentCredentials.smtp, ...validated.smtp };
  }
  if (validated.resend !== undefined) {
    updatedCredentials.resend = { ...currentCredentials.resend, ...validated.resend };
  }
  if (validated.twilio !== undefined) {
    updatedCredentials.twilio = { ...currentCredentials.twilio, ...validated.twilio };
  }
  if (validated.ntfy !== undefined) {
    updatedCredentials.ntfy = { ...currentCredentials.ntfy, ...validated.ntfy };
  }
  if (validated.irc !== undefined) {
    updatedCredentials.irc = { ...currentCredentials.irc, ...validated.irc };
  }
  if (validated.twitter !== undefined) {
    updatedCredentials.twitter = { ...currentCredentials.twitter, ...validated.twitter };
  }
  if (validated.webhook !== undefined) {
    updatedCredentials.webhook = { ...currentCredentials.webhook, ...validated.webhook };
  }

  // Encrypt sensitive fields before storing
  const encryptedCredentials = await encryptConfigSecrets(updatedCredentials as Record<string, unknown>);

  const updatedSettings = {
    ...currentSettings,
    credentials: encryptedCredentials,
  };

  await db
    .update(organizations)
    .set({
      settings: updatedSettings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id));

  // Audit log: credentials updated
  const updatedTypes = Object.keys(validated).filter(k => validated[k as keyof typeof validated] !== undefined);
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "settings.update",
    resourceType: "organization",
    resourceId: id,
    resourceName: "Credentials",
    metadata: {
      after: { updatedCredentialTypes: updatedTypes },
    },
  });

  // Return masked response
  const maskedCredentials = maskCredentials(updatedCredentials);

  return c.json({
    success: true,
    data: maskedCredentials,
  });
});

// Delete specific credential type
organizationsRoutes.delete("/:id/credentials/:type", async (c) => {
  const auth = requireAuth(c);
  const { id, type } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Validate credential type
  const validatedType = credentialTypeSchema.parse(type) as CredentialType;

  // Verify user can delete (admin or owner)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Get current org settings
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const currentSettings = org.settings || {};
  const currentCredentials = currentSettings.credentials || {};

  // Remove the specific credential type
  const updatedCredentials = { ...currentCredentials };
  delete updatedCredentials[validatedType];

  const updatedSettings = {
    ...currentSettings,
    credentials: updatedCredentials,
  };

  await db
    .update(organizations)
    .set({
      settings: updatedSettings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id));

  // Audit log: credential deleted
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "settings.update",
    resourceType: "organization",
    resourceId: id,
    resourceName: `Credential: ${validatedType}`,
    metadata: {
      before: { credentialType: validatedType },
      after: { deleted: true },
    },
  });

  return c.json({
    success: true,
    data: { deleted: true, type: validatedType },
  });
});

// Test credentials
organizationsRoutes.post("/:id/credentials/test", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can test (admin or owner)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const validated = testCredentialsSchema.parse(body);

  // Get org credentials
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const credentials = org.settings?.credentials;
  if (!credentials) {
    throw new Error("No credentials configured");
  }

  // Decrypt credentials for testing
  const decryptedCredentials = await decryptConfigSecrets(credentials);

  const credentialType = validated.type as CredentialType;
  const credential = decryptedCredentials[credentialType as keyof typeof decryptedCredentials];

  if (!credential) {
    throw new Error(`No ${credentialType} credentials configured`);
  }

  if (!credential.enabled) {
    throw new Error(`${credentialType} credentials are disabled`);
  }

  // Test based on credential type
  let testResult: { success: boolean; message: string };

  try {
    switch (credentialType) {
      case "smtp": {
        // Import nodemailer and test SMTP connection
        const nodemailer = await import("nodemailer");
        const smtpCred = decryptedCredentials.smtp!;
        const transporter = nodemailer.default.createTransport({
          host: smtpCred.host,
          port: smtpCred.port,
          secure: smtpCred.secure ?? smtpCred.port === 465,
          auth: smtpCred.username
            ? {
                user: smtpCred.username,
                pass: smtpCred.password,
              }
            : undefined,
        });
        await transporter.verify();
        testResult = { success: true, message: "SMTP connection successful" };
        break;
      }

      case "resend": {
        // Test Resend API key by fetching domains
        const resendCred = decryptedCredentials.resend!;
        const response = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${resendCred.apiKey}` },
        });
        if (!response.ok) {
          throw new Error(`Resend API error: ${response.status}`);
        }
        testResult = { success: true, message: "Resend API key valid" };
        break;
      }

      case "twilio": {
        // Test Twilio credentials by fetching account info
        const twilioCred = decryptedCredentials.twilio!;
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioCred.accountSid}.json`,
          {
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(`${twilioCred.accountSid}:${twilioCred.authToken}`).toString("base64"),
            },
          }
        );
        if (!response.ok) {
          throw new Error(`Twilio API error: ${response.status}`);
        }
        testResult = { success: true, message: "Twilio credentials valid" };
        break;
      }

      case "ntfy": {
        // Test ntfy server connectivity
        const ntfyCred = decryptedCredentials.ntfy!;
        const serverUrl = ntfyCred.serverUrl || "https://ntfy.sh";
        const response = await fetch(`${serverUrl}/v1/health`);
        if (!response.ok) {
          throw new Error(`ntfy server error: ${response.status}`);
        }
        testResult = { success: true, message: "ntfy server reachable" };
        break;
      }

      case "twitter": {
        // Test Twitter API credentials
        const twitterCred = decryptedCredentials.twitter!;
        // OAuth 1.0a is complex, just verify credentials are present
        if (
          twitterCred.apiKey &&
          twitterCred.apiSecret &&
          twitterCred.accessToken &&
          twitterCred.accessSecret
        ) {
          testResult = { success: true, message: "Twitter credentials configured (not verified)" };
        } else {
          throw new Error("Missing Twitter credentials");
        }
        break;
      }

      case "irc": {
        // IRC requires actual connection which is complex for a test
        const ircCred = decryptedCredentials.irc!;
        if (ircCred.defaultServer) {
          testResult = { success: true, message: "IRC credentials configured (not verified)" };
        } else {
          throw new Error("No IRC server configured");
        }
        break;
      }

      case "webhook": {
        const webhookCred = decryptedCredentials.webhook!;
        if (webhookCred.defaultSigningKey) {
          testResult = { success: true, message: "Webhook signing key configured" };
        } else {
          testResult = { success: true, message: "Webhook credentials enabled (no signing key)" };
        }
        break;
      }

      default:
        throw new Error(`Unknown credential type: ${credentialType}`);
    }
  } catch (error) {
    testResult = {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return c.json({
    success: true,
    data: testResult,
  });
});

// === Custom Roles ===

type RoleResponse = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  resolvedPermissions: string[];
  isSystem: boolean;
  color?: string | null;
  icon?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

// List all roles (predefined + custom)
// List roles for current organization
organizationsRoutes.get("/current/roles", async (c) => {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    return c.json(
      { success: false, error: { code: "NO_ORGANIZATION", message: "No organization context" } },
      400
    );
  }

  // Convert predefined roles to API format
  const predefinedRolesArray: RoleResponse[] = Object.values(PREDEFINED_ROLES).map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description ?? null,
    permissions: role.permissions,
    resolvedPermissions: expandWildcards(role.permissions),
    isSystem: true,
    color: role.color,
    icon: role.icon,
    createdAt: null,
    updatedAt: null,
  }));

  // Get custom roles from database (enterprise feature)
  let customRolesArray: RoleResponse[] = [];
  try {
    const { roles } = await import("@uni-status/enterprise/database/schema");
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const customRoles = await enterpriseDb.query.roles.findMany({
      where: eq(roles.organizationId, auth.organizationId),
      orderBy: [desc(roles.createdAt)],
    });

    // Convert custom roles to API format
    customRolesArray = customRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      permissions: role.permissions,
      resolvedPermissions: expandWildcards(role.permissions),
      isSystem: role.isSystem,
      color: role.color,
      icon: null,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  } catch {
    // Enterprise package not available, only return predefined roles
  }

  return c.json({
    success: true,
    data: [...predefinedRolesArray, ...customRolesArray],
  });
});

organizationsRoutes.get("/:id/roles", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Verify user is member
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership) {
      throw new Error("Not found");
    }
  }

  // Convert predefined roles to API format
  const predefinedRolesArray: RoleResponse[] = Object.values(PREDEFINED_ROLES).map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description ?? null,
    permissions: role.permissions,
    resolvedPermissions: expandWildcards(role.permissions),
    isSystem: true,
    color: role.color,
    icon: role.icon,
    createdAt: null,
    updatedAt: null,
  }));

  // Get custom roles from database (enterprise feature)
  let customRolesArray: RoleResponse[] = [];
  try {
    const { roles } = await import("@uni-status/enterprise/database/schema");
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const customRoles = await enterpriseDb.query.roles.findMany({
      where: eq(roles.organizationId, id),
      orderBy: [desc(roles.createdAt)],
    });

    // Convert custom roles to API format
    customRolesArray = customRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      permissions: role.permissions,
      resolvedPermissions: expandWildcards(role.permissions),
      isSystem: role.isSystem,
      color: role.color,
      icon: null,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  } catch {
    // Enterprise package not available, only return predefined roles
  }

  return c.json({
    success: true,
    data: [...predefinedRolesArray, ...customRolesArray],
  });
});

// Create custom role
// Create role for current organization (from auth context)
organizationsRoutes.post("/current/roles", async (c) => {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    return c.json(
      { success: false, error: { code: "NO_ORGANIZATION", message: "No organization context" } },
      400
    );
  }

  const id = auth.organizationId;

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can manage roles (owner or admin)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Enterprise feature - check if roles schema and db are available
  let roles: typeof import("@uni-status/enterprise/database/schema")["roles"];
  let enterpriseDb: typeof import("@uni-status/enterprise/database")["enterpriseDb"];
  try {
    const enterpriseSchema = await import("@uni-status/enterprise/database/schema");
    const enterpriseDatabase = await import("@uni-status/enterprise/database");
    roles = enterpriseSchema.roles;
    enterpriseDb = enterpriseDatabase.enterpriseDb;
  } catch {
    return c.json(
      { success: false, error: "Custom roles require enterprise features" },
      403
    );
  }

  const body = await c.req.json();
  const validated = createRoleSchema.parse(body);

  // Check for duplicate name (including predefined roles)
  if (isPredefinedRole(validated.name.toLowerCase().replace(/\s+/g, "_"))) {
    return c.json(
      { success: false, error: "Cannot use a predefined role name" },
      400
    );
  }

  const existingRole = await enterpriseDb.query.roles.findFirst({
    where: and(
      eq(roles.organizationId, id),
      eq(roles.name, validated.name)
    ),
  });

  if (existingRole) {
    return c.json(
      { success: false, error: "A role with this name already exists" },
      400
    );
  }

  const roleId = nanoid();
  const now = new Date();

  const [role] = await enterpriseDb
    .insert(roles)
    .values({
      id: roleId,
      organizationId: id,
      name: validated.name,
      description: validated.description || null,
      permissions: validated.permissions,
      isSystem: false,
      color: validated.color || null,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!role) {
    return c.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Role creation failed" } },
      500
    );
  }

  // Audit log
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "role.create",
    resourceType: "role",
    resourceId: role.id,
    resourceName: role.name,
    metadata: {
      after: { name: role.name, permissions: role.permissions },
    },
  });

  return c.json(
    {
      success: true,
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        resolvedPermissions: expandWildcards(role.permissions),
        isSystem: role.isSystem,
        color: role.color,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    },
    201
  );
});

organizationsRoutes.post("/:id/roles", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can manage roles (owner or admin)
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Enterprise feature - check if roles schema and db are available
  let roles: typeof import("@uni-status/enterprise/database/schema")["roles"];
  let enterpriseDb: typeof import("@uni-status/enterprise/database")["enterpriseDb"];
  try {
    const enterpriseSchema = await import("@uni-status/enterprise/database/schema");
    const enterpriseDatabase = await import("@uni-status/enterprise/database");
    roles = enterpriseSchema.roles;
    enterpriseDb = enterpriseDatabase.enterpriseDb;
  } catch {
    return c.json(
      { success: false, error: "Custom roles require enterprise features" },
      403
    );
  }

  const body = await c.req.json();
  const validated = createRoleSchema.parse(body);

  // Check for duplicate name (including predefined roles)
  if (isPredefinedRole(validated.name.toLowerCase().replace(/\s+/g, "_"))) {
    return c.json(
      { success: false, error: "Cannot use a predefined role name" },
      400
    );
  }

  const existingRole = await enterpriseDb.query.roles.findFirst({
    where: and(
      eq(roles.organizationId, id),
      eq(roles.name, validated.name)
    ),
  });

  if (existingRole) {
    return c.json(
      { success: false, error: "A role with this name already exists" },
      400
    );
  }

  const roleId = nanoid();
  const now = new Date();

  const [role] = await enterpriseDb
    .insert(roles)
    .values({
      id: roleId,
      organizationId: id,
      name: validated.name,
      description: validated.description || null,
      permissions: validated.permissions,
      isSystem: false,
      color: validated.color || null,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!role) {
    return c.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Role creation failed" } },
      500
    );
  }

  // Audit log
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "role.create",
    resourceType: "role",
    resourceId: role.id,
    resourceName: role.name,
    metadata: {
      after: { name: role.name, permissions: role.permissions },
    },
  });

  return c.json(
    {
      success: true,
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        resolvedPermissions: expandWildcards(role.permissions),
        isSystem: role.isSystem,
        color: role.color,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    },
    201
  );
});

// Get single role
organizationsRoutes.get("/:id/roles/:roleId", async (c) => {
  const auth = requireAuth(c);
  const { id, roleId } = c.req.param();

  // Verify user is member
  if (auth.user) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership) {
      throw new Error("Not found");
    }
  }

  // Check if it's a predefined role
  if (isPredefinedRole(roleId)) {
    const predefined = PREDEFINED_ROLES[roleId];
    if (!predefined) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Role not found" } },
        404
      );
    }
    return c.json({
      success: true,
      data: {
        id: predefined.id,
        name: predefined.name,
        description: predefined.description,
        permissions: predefined.permissions,
        resolvedPermissions: expandWildcards(predefined.permissions),
        isSystem: true,
        color: predefined.color,
        icon: predefined.icon,
        createdAt: null,
        updatedAt: null,
      },
    });
  }

  // Get custom role (enterprise feature)
  try {
    const { roles } = await import("@uni-status/enterprise/database/schema");
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const role = await enterpriseDb.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.organizationId, id)),
    });

    if (!role) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Role not found" } },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        resolvedPermissions: expandWildcards(role.permissions),
        isSystem: role.isSystem,
        color: role.color,
        icon: null,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    });
  } catch {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Role not found" } },
      404
    );
  }
});

// Update custom role
organizationsRoutes.patch("/:id/roles/:roleId", async (c) => {
  const auth = requireAuth(c);
  const { id, roleId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Cannot update predefined roles
  if (isPredefinedRole(roleId)) {
    return c.json(
      { success: false, error: "Cannot modify predefined roles" },
      400
    );
  }

  // Verify user can manage roles
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Enterprise feature - check if roles schema and db are available
  let roles: typeof import("@uni-status/enterprise/database/schema")["roles"];
  let enterpriseDb: typeof import("@uni-status/enterprise/database")["enterpriseDb"];
  try {
    const enterpriseSchema = await import("@uni-status/enterprise/database/schema");
    const enterpriseDatabase = await import("@uni-status/enterprise/database");
    roles = enterpriseSchema.roles;
    enterpriseDb = enterpriseDatabase.enterpriseDb;
  } catch {
    return c.json(
      { success: false, error: "Custom roles require enterprise features" },
      403
    );
  }

  // Get existing role
  const existingRole = await enterpriseDb.query.roles.findFirst({
    where: and(eq(roles.id, roleId), eq(roles.organizationId, id)),
  });

  if (!existingRole) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Role not found" } },
      404
    );
  }

  if (existingRole.isSystem) {
    return c.json(
      { success: false, error: "Cannot modify system roles" },
      400
    );
  }

  const body = await c.req.json();
  const validated = updateRoleSchema.parse(body);

  // Check for duplicate name if updating name
  if (validated.name && validated.name !== existingRole.name) {
    if (isPredefinedRole(validated.name.toLowerCase().replace(/\s+/g, "_"))) {
      return c.json(
        { success: false, error: "Cannot use a predefined role name" },
        400
      );
    }

    const duplicateRole = await enterpriseDb.query.roles.findFirst({
      where: and(
        eq(roles.organizationId, id),
        eq(roles.name, validated.name)
      ),
    });

    if (duplicateRole) {
      return c.json(
        { success: false, error: "A role with this name already exists" },
        400
      );
    }
  }

  const [role] = await enterpriseDb
    .update(roles)
    .set({
      ...validated,
      updatedAt: new Date(),
    })
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, id)))
    .returning();

  if (!role) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Role not found" } },
      404
    );
  }

  // Audit log
  await createAuditLogWithChanges(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "role.update",
    resourceType: "role",
    resourceId: role.id,
    resourceName: role.name,
    before: { name: existingRole.name, permissions: existingRole.permissions },
    after: { name: role.name, permissions: role.permissions },
  });

  return c.json({
    success: true,
    data: {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      resolvedPermissions: expandWildcards(role.permissions),
      isSystem: role.isSystem,
      color: role.color,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    },
  });
});

// Delete custom role
organizationsRoutes.delete("/:id/roles/:roleId", async (c) => {
  const auth = requireAuth(c);
  const { id, roleId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Cannot delete predefined roles
  if (isPredefinedRole(roleId)) {
    return c.json(
      { success: false, error: "Cannot delete predefined roles" },
      400
    );
  }

  // Verify user can manage roles
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Enterprise feature - check if roles schema and db are available
  let roles: typeof import("@uni-status/enterprise/database/schema")["roles"];
  let enterpriseDb: typeof import("@uni-status/enterprise/database")["enterpriseDb"];
  try {
    const enterpriseSchema = await import("@uni-status/enterprise/database/schema");
    const enterpriseDatabase = await import("@uni-status/enterprise/database");
    roles = enterpriseSchema.roles;
    enterpriseDb = enterpriseDatabase.enterpriseDb;
  } catch {
    return c.json(
      { success: false, error: "Custom roles require enterprise features" },
      403
    );
  }

  // Get existing role
  const existingRole = await enterpriseDb.query.roles.findFirst({
    where: and(eq(roles.id, roleId), eq(roles.organizationId, id)),
  });

  if (!existingRole) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Role not found" } },
      404
    );
  }

  if (existingRole.isSystem) {
    return c.json(
      { success: false, error: "Cannot delete system roles" },
      400
    );
  }

  // Update any members with this custom role to 'member' base role
  await db
    .update(organizationMembers)
    .set({
      role: "member",
      customRoleId: null,
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.customRoleId, roleId));

  // Delete the role
  await enterpriseDb.delete(roles).where(eq(roles.id, roleId));

  // Audit log
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "role.delete",
    resourceType: "role",
    resourceId: roleId,
    resourceName: existingRole.name,
    metadata: {
      before: { name: existingRole.name },
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Update member's role
organizationsRoutes.patch("/:id/members/:memberId/role", async (c) => {
  const auth = requireAuth(c);
  const { id, memberId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can manage members
  const currentMembership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Get target member
  const targetMember = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, id)
    ),
  });

  if (!targetMember) {
    throw new Error("Member not found");
  }

  // Cannot change owner role unless you're the owner
  if (targetMember.role === "owner" && currentMembership.role !== "owner") {
    return c.json(
      { success: false, error: "Only owners can change owner roles" },
      403
    );
  }

  const body = await c.req.json();
  const { roleId } = body;

  if (!roleId) {
    return c.json({ success: false, error: "roleId is required" }, 400);
  }

  let updateData: {
    role: "owner" | "admin" | "member" | "viewer";
    customRoleId: string | null;
    updatedAt: Date;
  };

  // Determine if it's a base role or custom/extended role
  if (isBaseRole(roleId)) {
    // Only owners can assign owner role
    if (roleId === "owner" && currentMembership.role !== "owner") {
      return c.json(
        { success: false, error: "Only owners can assign owner role" },
        403
      );
    }

    updateData = {
      role: roleId,
      customRoleId: null,
      updatedAt: new Date(),
    };
  } else {
    // Extended/custom roles require customRoles entitlement
    const licenseContext = getLicenseContext(c);
    if (!checkFeature(licenseContext, "customRoles")) {
      return c.json(
        { success: false, error: "Custom roles require an Enterprise license" },
        403
      );
    }

    // Check if it's an extended predefined role (enterprise feature)
    let isExtendedPredefinedRole = false;
    try {
      const { isExtendedRole } = await import("@uni-status/enterprise/shared/roles-extended");
      isExtendedPredefinedRole = isExtendedRole(roleId);
    } catch {
      // Enterprise package not available
    }

    if (isExtendedPredefinedRole) {
      // Extended predefined role - store as member with customRoleId referencing predefined
      updateData = {
        role: "member", // Base role for extended roles
        customRoleId: roleId, // Store the predefined role ID
        updatedAt: new Date(),
      };
    } else {
      // Custom role - verify it exists (enterprise feature)
      try {
        const { roles } = await import("@uni-status/enterprise/database/schema");
        const { enterpriseDb } = await import("@uni-status/enterprise/database");
        const customRole = await enterpriseDb.query.roles.findFirst({
          where: and(eq(roles.id, roleId), eq(roles.organizationId, id)),
        });

        if (!customRole) {
          return c.json({ success: false, error: "Role not found" }, 404);
        }
      } catch {
        return c.json({ success: false, error: "Role not found" }, 404);
      }

      updateData = {
        role: "member", // Base role for custom roles
        customRoleId: roleId,
        updatedAt: new Date(),
      };
    }
  }

  const [updatedMember] = await db
    .update(organizationMembers)
    .set(updateData)
    .where(eq(organizationMembers.id, memberId))
    .returning();

  if (!updatedMember) {
    return c.json({ success: false, error: "Member not found" }, 404);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.member_role_change",
    resourceType: "organization",
    resourceId: memberId,
    resourceName: targetMember.userId,
    metadata: {
      before: { role: targetMember.role, customRoleId: targetMember.customRoleId },
      after: { role: updateData.role, customRoleId: updateData.customRoleId },
    },
  });

  return c.json({
    success: true,
    data: {
      id: updatedMember.id,
      role: updatedMember.role,
      customRoleId: updatedMember.customRoleId,
    },
  });
});

// Remove member from organization
organizationsRoutes.delete("/:id/members/:memberId", async (c) => {
  const auth = requireAuth(c);
  const { id, memberId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user can manage members
  const currentMembership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Get target member
  const targetMember = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, id)
    ),
  });

  if (!targetMember) {
    return c.json({ success: false, error: "Member not found" }, 404);
  }

  // Cannot remove owner
  if (targetMember.role === "owner") {
    return c.json(
      { success: false, error: "Cannot remove organization owner" },
      403
    );
  }

  // Cannot remove yourself (use leave endpoint instead)
  if (targetMember.userId === auth.user.id) {
    return c.json(
      { success: false, error: "Cannot remove yourself - use leave endpoint instead" },
      400
    );
  }

  // Delete the member
  await db
    .delete(organizationMembers)
    .where(eq(organizationMembers.id, memberId));

  // Audit log
  await createAuditLog(c, {
    organizationId: id,
    userId: auth.user.id,
    action: "organization.member_remove",
    resourceType: "organization",
    resourceId: memberId,
    resourceName: targetMember.userId,
    metadata: {
      removedMember: {
        id: targetMember.id,
        userId: targetMember.userId,
        role: targetMember.role,
      },
    },
  });

  return c.json({
    success: true,
    data: { id: memberId },
  });
});
