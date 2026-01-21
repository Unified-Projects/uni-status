import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  pendingApprovals,
  users,
  organizations,
  organizationMembers,
  systemSettings,
} from "@uni-status/database/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole, getSystemSettings } from "../middleware/auth";
import { isSelfHosted } from "@uni-status/shared/config/env";

export const pendingApprovalsRoutes = new OpenAPIHono();

// GET /api/v1/pending-approvals - List pending approvals (admin/owner only)
pendingApprovalsRoutes.get("/", async (c) => {
  if (!isSelfHosted()) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_SELF_HOSTED",
          message: "Pending approvals are only available for self-hosted deployments",
        },
      },
      400
    );
  }

  const settings = await getSystemSettings();
  if (!settings?.primaryOrganizationId) {
    return c.json(
      {
        success: false,
        error: {
          code: "SETUP_REQUIRED",
          message: "System setup not completed",
        },
      },
      503
    );
  }

  // Temporarily set organization context for role check
  const auth = requireAuth(c);
  const orgId = settings.primaryOrganizationId;

  // Check if user is admin or owner
  if (!auth.user) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    );
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin or owner role required",
        },
      },
      403
    );
  }

  const status = c.req.query("status") || "pending";

  const approvals = await db.query.pendingApprovals.findMany({
    where: and(
      eq(pendingApprovals.organizationId, orgId),
      eq(pendingApprovals.status, status as "pending" | "approved" | "rejected")
    ),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      },
      reviewer: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [desc(pendingApprovals.requestedAt)],
  });

  return c.json({
    success: true,
    data: approvals.map((a) => ({
      id: a.id,
      user: a.user,
      status: a.status,
      requestedAt: a.requestedAt,
      reviewer: a.reviewer,
      reviewedAt: a.reviewedAt,
      notes: a.notes,
    })),
  });
});

// GET /api/v1/pending-approvals/me - Check own approval status
pendingApprovalsRoutes.get("/me", async (c) => {
  if (!isSelfHosted()) {
    return c.json({
      success: true,
      data: {
        hasPendingApproval: false,
        status: null,
      },
    });
  }

  const auth = requireAuth(c);

  if (!auth.user) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    );
  }

  const settings = await getSystemSettings();
  if (!settings?.primaryOrganizationId) {
    return c.json({
      success: true,
      data: {
        hasPendingApproval: false,
        status: null,
      },
    });
  }

  const approval = await db.query.pendingApprovals.findFirst({
    where: and(
      eq(pendingApprovals.userId, auth.user.id),
      eq(pendingApprovals.organizationId, settings.primaryOrganizationId)
    ),
    orderBy: [desc(pendingApprovals.requestedAt)],
  });

  if (!approval) {
    // Check if user is already a member of the organization
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, auth.user.id),
        eq(organizationMembers.organizationId, settings.primaryOrganizationId)
      ),
    });

    return c.json({
      success: true,
      data: {
        hasPendingApproval: false,
        status: null,
        isOrganizationMember: !!membership,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      hasPendingApproval: approval.status === "pending",
      status: approval.status,
      requestedAt: approval.requestedAt,
      reviewedAt: approval.reviewedAt,
      notes: approval.notes,
    },
  });
});

// POST /api/v1/pending-approvals/:id/approve - Approve a pending user
pendingApprovalsRoutes.post("/:id/approve", async (c) => {
  if (!isSelfHosted()) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_SELF_HOSTED",
          message: "Pending approvals are only available for self-hosted deployments",
        },
      },
      400
    );
  }

  const { id } = c.req.param();
  const auth = requireAuth(c);

  if (!auth.user) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    );
  }

  const settings = await getSystemSettings();
  if (!settings?.primaryOrganizationId) {
    return c.json(
      {
        success: false,
        error: {
          code: "SETUP_REQUIRED",
          message: "System setup not completed",
        },
      },
      503
    );
  }

  // Check if user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, settings.primaryOrganizationId),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin or owner role required",
        },
      },
      403
    );
  }

  // Get the pending approval
  const approval = await db.query.pendingApprovals.findFirst({
    where: and(
      eq(pendingApprovals.id, id),
      eq(pendingApprovals.organizationId, settings.primaryOrganizationId)
    ),
    with: {
      user: true,
    },
  });

  if (!approval) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Pending approval not found",
        },
      },
      404
    );
  }

  if (approval.status !== "pending") {
    return c.json(
      {
        success: false,
        error: {
          code: "ALREADY_PROCESSED",
          message: `This request has already been ${approval.status}`,
        },
      },
      400
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const { role = "member", notes } = body;

  // Validate role
  const validRoles = ["admin", "member", "viewer"];
  if (!validRoles.includes(role)) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        },
      },
      400
    );
  }

  // Add user to organization
  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: settings.primaryOrganizationId,
    userId: approval.userId,
    role: role as "admin" | "member" | "viewer",
    invitedBy: auth.user.id,
  });

  // Update approval status
  await db
    .update(pendingApprovals)
    .set({
      status: "approved",
      reviewedBy: auth.user.id,
      reviewedAt: new Date(),
      notes: notes || null,
      updatedAt: new Date(),
    })
    .where(eq(pendingApprovals.id, id));

  return c.json({
    success: true,
    data: {
      message: "User approved successfully",
      userId: approval.userId,
      role,
    },
  });
});

// POST /api/v1/pending-approvals/:id/reject - Reject a pending user
pendingApprovalsRoutes.post("/:id/reject", async (c) => {
  if (!isSelfHosted()) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_SELF_HOSTED",
          message: "Pending approvals are only available for self-hosted deployments",
        },
      },
      400
    );
  }

  const { id } = c.req.param();
  const auth = requireAuth(c);

  if (!auth.user) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    );
  }

  const settings = await getSystemSettings();
  if (!settings?.primaryOrganizationId) {
    return c.json(
      {
        success: false,
        error: {
          code: "SETUP_REQUIRED",
          message: "System setup not completed",
        },
      },
      503
    );
  }

  // Check if user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, settings.primaryOrganizationId),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin or owner role required",
        },
      },
      403
    );
  }

  // Get the pending approval
  const approval = await db.query.pendingApprovals.findFirst({
    where: and(
      eq(pendingApprovals.id, id),
      eq(pendingApprovals.organizationId, settings.primaryOrganizationId)
    ),
  });

  if (!approval) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Pending approval not found",
        },
      },
      404
    );
  }

  if (approval.status !== "pending") {
    return c.json(
      {
        success: false,
        error: {
          code: "ALREADY_PROCESSED",
          message: `This request has already been ${approval.status}`,
        },
      },
      400
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const { notes } = body;

  // Update approval status
  await db
    .update(pendingApprovals)
    .set({
      status: "rejected",
      reviewedBy: auth.user.id,
      reviewedAt: new Date(),
      notes: notes || null,
      updatedAt: new Date(),
    })
    .where(eq(pendingApprovals.id, id));

  return c.json({
    success: true,
    data: {
      message: "User rejected",
      userId: approval.userId,
    },
  });
});
