import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  systemSettings,
  users,
  organizations,
  organizationMembers,
} from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { authMiddleware, requireSuperAdmin, getSystemSettings } from "../middleware/auth";
import { isSelfHosted, getDeploymentType } from "@uni-status/shared/config/env";
import { auth } from "@uni-status/auth/server";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "system-routes" });

export const systemRoutes = new OpenAPIHono();

// Apply auth middleware only to /settings routes
systemRoutes.use("/settings", authMiddleware);

// GET /api/v1/system/status - Public endpoint to check system status
systemRoutes.get("/status", async (c) => {
  const deploymentType = getDeploymentType();
  const selfHosted = isSelfHosted();

  if (!selfHosted) {
    return c.json({
      success: true,
      data: {
        deploymentType,
        isSelfHosted: false,
        setupCompleted: true,
        signupMode: null,
      },
    });
  }

  const settings = await getSystemSettings();

  return c.json({
    success: true,
    data: {
      deploymentType,
      isSelfHosted: true,
      setupCompleted: settings?.setupCompleted ?? false,
      signupMode: settings?.signupMode ?? "invite_only",
    },
  });
});

// POST /api/v1/system/setup - One-time setup endpoint for self-hosted deployments
systemRoutes.post("/setup", async (c) => {
  if (!isSelfHosted()) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_SELF_HOSTED",
          message: "Setup is only available for self-hosted deployments",
        },
      },
      400
    );
  }

  // Check if setup is already completed
  const existingSettings = await getSystemSettings();
  if (existingSettings?.setupCompleted) {
    return c.json(
      {
        success: false,
        error: {
          code: "SETUP_ALREADY_COMPLETE",
          message: "Initial setup has already been completed",
        },
      },
      400
    );
  }

  const body = await c.req.json();
  const { adminName, adminEmail, adminPassword, organizationName, organizationSlug, signupMode } = body;

  // Validate required fields
  if (!adminName || !adminEmail || !adminPassword) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Admin name, email, and password are required",
        },
      },
      400
    );
  }

  if (!organizationName || !organizationSlug) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Organization name and slug are required",
        },
      },
      400
    );
  }

  // Validate slug format
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(organizationSlug) || organizationSlug.length < 3 || organizationSlug.length > 50) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Slug must be 3-50 characters, lowercase letters, numbers, and hyphens only",
        },
      },
      400
    );
  }

  // Validate password length
  if (adminPassword.length < 8) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters",
        },
      },
      400
    );
  }

  // Check if email is already registered
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, adminEmail.toLowerCase()),
  });

  if (existingUser) {
    return c.json(
      {
        success: false,
        error: {
          code: "EMAIL_EXISTS",
          message: "A user with this email already exists",
        },
      },
      400
    );
  }

  // Check if organization slug is taken
  const existingOrg = await db.query.organizations.findFirst({
    where: eq(organizations.slug, organizationSlug.toLowerCase()),
  });

  if (existingOrg) {
    return c.json(
      {
        success: false,
        error: {
          code: "SLUG_EXISTS",
          message: "An organization with this slug already exists",
        },
      },
      400
    );
  }

  try {
    // Create admin user via Better Auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: adminName,
        email: adminEmail.toLowerCase(),
        password: adminPassword,
      },
    });

    if (!signUpResult || !signUpResult.user) {
      return c.json(
        {
          success: false,
          error: {
            code: "USER_CREATION_FAILED",
            message: "Failed to create admin user",
          },
        },
        500
      );
    }

    const userId = signUpResult.user.id;

    // Mark user as super_admin
    await db
      .update(users)
      .set({ systemRole: "super_admin" })
      .where(eq(users.id, userId));

    // Create the organization
    const orgId = nanoid();
    await db.insert(organizations).values({
      id: orgId,
      name: organizationName,
      slug: organizationSlug.toLowerCase(),
      plan: "enterprise", // Self-hosted gets enterprise features
    });

    // Add admin as owner of the organization
    await db.insert(organizationMembers).values({
      id: nanoid(),
      organizationId: orgId,
      userId: userId,
      role: "owner",
    });

    // Create or update system settings
    const validSignupMode = ["invite_only", "domain_auto_join", "open_with_approval"].includes(signupMode)
      ? signupMode
      : "invite_only";

    if (existingSettings) {
      await db
        .update(systemSettings)
        .set({
          setupCompleted: true,
          setupCompletedAt: new Date(),
          primaryOrganizationId: orgId,
          signupMode: validSignupMode,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, "singleton"));
    } else {
      await db.insert(systemSettings).values({
        id: "singleton",
        setupCompleted: true,
        setupCompletedAt: new Date(),
        primaryOrganizationId: orgId,
        signupMode: validSignupMode,
      });
    }

    return c.json({
      success: true,
      data: {
        userId,
        organizationId: orgId,
        message: "Setup completed successfully",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Setup error");
    return c.json(
      {
        success: false,
        error: {
          code: "SETUP_FAILED",
          message: error instanceof Error ? error.message : "Setup failed",
        },
      },
      500
    );
  }
});

// GET /api/v1/system/settings - Get full system settings (super admin only)
systemRoutes.get("/settings", async (c) => {
  try {
    await requireSuperAdmin(c);
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: error instanceof Error ? error.message : "Unauthorized",
        },
      },
      403
    );
  }

  const settings = await getSystemSettings();

  if (!settings) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "System settings not found",
        },
      },
      404
    );
  }

  // Get primary organization details
  let primaryOrganization = null;
  if (settings.primaryOrganizationId) {
    primaryOrganization = await db.query.organizations.findFirst({
      where: eq(organizations.id, settings.primaryOrganizationId),
      columns: {
        id: true,
        name: true,
        slug: true,
        plan: true,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      id: settings.id,
      setupCompleted: settings.setupCompleted,
      setupCompletedAt: settings.setupCompletedAt,
      signupMode: settings.signupMode,
      primaryOrganization,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    },
  });
});

// PATCH /api/v1/system/settings - Update system settings (super admin only)
systemRoutes.patch("/settings", async (c) => {
  try {
    await requireSuperAdmin(c);
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: error instanceof Error ? error.message : "Unauthorized",
        },
      },
      403
    );
  }

  const body = await c.req.json();
  const { signupMode } = body;

  // Validate signup mode
  const validModes = ["invite_only", "domain_auto_join", "open_with_approval"];
  if (signupMode && !validModes.includes(signupMode)) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid signup mode. Must be one of: ${validModes.join(", ")}`,
        },
      },
      400
    );
  }

  const settings = await getSystemSettings();

  if (!settings) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "System settings not found",
        },
      },
      404
    );
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (signupMode) {
    updates.signupMode = signupMode;
  }

  await db
    .update(systemSettings)
    .set(updates)
    .where(eq(systemSettings.id, "singleton"));

  // Fetch updated settings
  const updatedSettings = await getSystemSettings();

  return c.json({
    success: true,
    data: {
      id: updatedSettings?.id,
      setupCompleted: updatedSettings?.setupCompleted,
      signupMode: updatedSettings?.signupMode,
      updatedAt: updatedSettings?.updatedAt,
    },
  });
});
