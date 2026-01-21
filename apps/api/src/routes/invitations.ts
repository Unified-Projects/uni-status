import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  organizationMembers,
  organizationInvitations,
} from "@uni-status/database/schema";
import { requireAuth } from "../middleware/auth";
import { eq, and, gt } from "drizzle-orm";
import { canUserJoinFreeOrg } from "../lib/org-membership";

export const invitationsRoutes = new OpenAPIHono();

// Get pending invitations for the current user
// This returns invitations sent to the user's email address that are still pending
invitationsRoutes.get("/users/me/invitations", async (c) => {
  const auth = requireAuth(c);

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  const now = new Date();

  // Find all pending invitations for this user's email
  const pendingInvitations = await db.query.organizationInvitations.findMany({
    where: and(
      eq(organizationInvitations.email, auth.user.email),
      eq(organizationInvitations.status, "pending"),
      gt(organizationInvitations.expiresAt, now)
    ),
    with: {
      organization: true,
      inviter: true,
    },
  });

  return c.json({
    success: true,
    data: pendingInvitations.map((invitation) => ({
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
        logoUrl: invitation.organization.logo,
      },
      inviter: invitation.inviter
        ? {
            id: invitation.inviter.id,
            name: invitation.inviter.name,
            email: invitation.inviter.email,
          }
        : null,
    })),
  });
});

// Accept an invitation
invitationsRoutes.post("/:id/accept", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  const now = new Date();

  // Find the invitation
  const invitation = await db.query.organizationInvitations.findFirst({
    where: and(
      eq(organizationInvitations.id, id),
      eq(organizationInvitations.email, auth.user.email),
      eq(organizationInvitations.status, "pending")
    ),
    with: {
      organization: true,
    },
  });

  if (!invitation) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Invitation not found or already processed" },
      },
      404
    );
  }

  // Check if invitation has expired
  if (invitation.expiresAt < now) {
    // Update status to expired
    await db
      .update(organizationInvitations)
      .set({ status: "expired", updatedAt: now })
      .where(eq(organizationInvitations.id, id));

    return c.json(
      {
        success: false,
        error: { code: "EXPIRED", message: "This invitation has expired" },
      },
      400
    );
  }

  // Check if user is already a member of this organization
  const existingMembership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, invitation.organizationId),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (existingMembership) {
    // Mark invitation as accepted since user is already a member
    await db
      .update(organizationInvitations)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(organizationInvitations.id, id));

    return c.json({
      success: true,
      data: {
        organizationId: invitation.organizationId,
        organization: {
          id: invitation.organization.id,
          name: invitation.organization.name,
          slug: invitation.organization.slug,
          logoUrl: invitation.organization.logo,
        },
        alreadyMember: true,
      },
    });
  }

  // Check free org membership rule before creating membership
  // In hosted mode, users can only be a member of ONE free org
  const freeOrgCheck = await canUserJoinFreeOrg(
    auth.user.id,
    invitation.organizationId
  );
  if (!freeOrgCheck.canProceed) {
    return c.json(
      {
        success: false,
        error: {
          code: "FREE_ORG_LIMIT",
          message: `You are already a member of a free organization (${freeOrgCheck.existingFreeOrgName}). You cannot join another free organization.`,
        },
      },
      403
    );
  }

  // Create membership and update invitation status in a transaction-like manner
  const membershipId = nanoid();

  // Create the membership
  await db.insert(organizationMembers).values({
    id: membershipId,
    organizationId: invitation.organizationId,
    userId: auth.user.id,
    role: invitation.role,
    invitedBy: invitation.invitedBy,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Update invitation status to accepted
  await db
    .update(organizationInvitations)
    .set({ status: "accepted", updatedAt: now })
    .where(eq(organizationInvitations.id, id));

  return c.json({
    success: true,
    data: {
      organizationId: invitation.organizationId,
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
        logoUrl: invitation.organization.logo,
      },
      role: invitation.role,
      membershipId,
    },
  });
});

// Decline an invitation
invitationsRoutes.post("/:id/decline", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  const now = new Date();

  // Find the invitation
  const invitation = await db.query.organizationInvitations.findFirst({
    where: and(
      eq(organizationInvitations.id, id),
      eq(organizationInvitations.email, auth.user.email),
      eq(organizationInvitations.status, "pending")
    ),
  });

  if (!invitation) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Invitation not found or already processed" },
      },
      404
    );
  }

  // Update invitation status to expired (we reuse expired status for declined)
  await db
    .update(organizationInvitations)
    .set({ status: "expired", updatedAt: now })
    .where(eq(organizationInvitations.id, id));

  return c.json({
    success: true,
    data: { declined: true },
  });
});
