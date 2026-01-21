import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { statusPages, statusPageMonitors, subscribers, crowdsourcedSettings } from "@uni-status/database/schema";
import { createStatusPageSchema, updateStatusPageSchema } from "@uni-status/shared/validators";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import {
  getLicenseContext,
  requireResourceLimit,
} from "@uni-status/enterprise/api/middleware/license";
import { eq, and, desc, sql } from "drizzle-orm";
import { deleteFileByUrl } from "../lib/uploads";

export const statusPagesRoutes = new OpenAPIHono();

// Helper to map database fields to API response fields
function mapStatusPageResponse<T extends { logo?: string | null; favicon?: string | null }>(page: T) {
  return {
    ...page,
    logoUrl: page.logo,
    faviconUrl: page.favicon,
  };
}

// List status pages
statusPagesRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(statusPages)
    .where(eq(statusPages.organizationId, organizationId));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.statusPages.findMany({
    where: eq(statusPages.organizationId, organizationId),
    orderBy: [desc(statusPages.createdAt)],
    limit,
    offset,
    with: {
      monitors: {
        orderBy: [statusPageMonitors.order],
      },
    },
  });

  return c.json({
    success: true,
    data: result.map(mapStatusPageResponse),
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + result.length < total,
    },
  });
});

// Create status page
statusPagesRoutes.post("/", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  // Check license entitlements for status page limit
  const licenseContext = getLicenseContext(c);
  const currentStatusPageCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(statusPages)
    .where(eq(statusPages.organizationId, organizationId));
  requireResourceLimit(
    licenseContext,
    "statusPages",
    Number(currentStatusPageCount[0]?.count ?? 0),
    "Status page"
  );

  const body = await c.req.json();
  const validated = createStatusPageSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  // Hash password if provided
  let passwordHash: string | null = null;
  if (validated.password) {
    passwordHash = await Bun.password.hash(validated.password, {
      algorithm: "bcrypt",
      cost: 10,
    });
  }

  const { password, passwordProtected, ...rest } = validated;

  // Set authConfig for password protection if passwordProtected is true or password is provided
  let authConfig = validated.authConfig;
  if ((passwordProtected || validated.password) && !authConfig?.protectionMode) {
    authConfig = {
      ...authConfig,
      protectionMode: "password",
    };
  }

  const [page] = await db
    .insert(statusPages)
    .values({
      id,
      organizationId,
      ...rest,
      authConfig,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!page) {
    return c.json({ success: false, error: "Failed to create status page" }, 500);
  }

  return c.json(
    {
      success: true,
      data: mapStatusPageResponse(page),
    },
    201
  );
});

// Get status page by ID
statusPagesRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
    with: {
      monitors: {
        orderBy: [statusPageMonitors.order],
      },
    },
  });

  if (!page) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: mapStatusPageResponse(page),
  });
});

// Update status page
statusPagesRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateStatusPageSchema.parse(body);

  // Fetch current page to get old logo/favicon URLs for cleanup
  const currentPage = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!currentPage) {
    throw new Error("Not found");
  }

  // Handle password: hash new password, or clear if protection is disabled
  let passwordHash: string | null | undefined;
  if (validated.passwordProtected === false) {
    // Explicitly clearing password protection
    passwordHash = null;
  } else if (validated.password) {
    // Setting a new password
    passwordHash = await Bun.password.hash(validated.password, {
      algorithm: "bcrypt",
      cost: 10,
    });
  }

  // Handle customDomain: clear if empty string is sent
  let customDomainValue: string | null | undefined;
  if (validated.customDomain === "") {
    // Explicitly clearing custom domain
    customDomainValue = null;
  } else if (validated.customDomain !== undefined) {
    customDomainValue = validated.customDomain;
  }

  // Handle logo: clear if empty string is sent
  let logoValue: string | null | undefined;
  if (validated.logo === "") {
    logoValue = null;
  } else if (validated.logo !== undefined) {
    logoValue = validated.logo;
  }

  // Handle favicon: clear if empty string is sent
  let faviconValue: string | null | undefined;
  if (validated.favicon === "") {
    faviconValue = null;
  } else if (validated.favicon !== undefined) {
    faviconValue = validated.favicon;
  }

  // Delete old logo file if logo is being changed (including cleared)
  if (logoValue !== undefined && currentPage.logo && currentPage.logo !== logoValue) {
    // Fire and forget - don't block update on file deletion
    deleteFileByUrl(currentPage.logo).catch((err) => {
      console.error("[StatusPages] Failed to delete old logo:", err);
    });
  }

  // Delete old favicon file if favicon is being changed (including cleared)
  if (faviconValue !== undefined && currentPage.favicon && currentPage.favicon !== faviconValue) {
    // Fire and forget - don't block update on file deletion
    deleteFileByUrl(currentPage.favicon).catch((err) => {
      console.error("[StatusPages] Failed to delete old favicon:", err);
    });
  }

  const { password, passwordProtected, customDomain, logo, favicon, ...rest } = validated;

  const [page] = await db
    .update(statusPages)
    .set({
      ...rest,
      ...(passwordHash !== undefined ? { passwordHash } : {}),
      ...(customDomainValue !== undefined ? { customDomain: customDomainValue } : {}),
      ...(logoValue !== undefined ? { logo: logoValue } : {}),
      ...(faviconValue !== undefined ? { favicon: faviconValue } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(statusPages.id, id),
        eq(statusPages.organizationId, organizationId)
      )
    )
    .returning();

  if (!page) {
    throw new Error("Not found");
  }

  // Re-fetch with monitors to return complete data
  const pageWithMonitors = await db.query.statusPages.findFirst({
    where: eq(statusPages.id, id),
    with: {
      monitors: {
        orderBy: [statusPageMonitors.order],
      },
    },
  });

  return c.json({
    success: true,
    data: pageWithMonitors ? mapStatusPageResponse(pageWithMonitors) : null,
  });
});

// Delete status page
statusPagesRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Fetch page to get logo/favicon URLs for cleanup
  const pageToDelete = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!pageToDelete) {
    throw new Error("Not found");
  }

  // Delete from database first
  const result = await db
    .delete(statusPages)
    .where(
      and(
        eq(statusPages.id, id),
        eq(statusPages.organizationId, organizationId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error("Not found");
  }

  // Clean up uploaded files (fire and forget - don't block response)
  if (pageToDelete.logo) {
    deleteFileByUrl(pageToDelete.logo).catch((err) => {
      console.error("[StatusPages] Failed to delete logo on page deletion:", err);
    });
  }
  if (pageToDelete.favicon) {
    deleteFileByUrl(pageToDelete.favicon).catch((err) => {
      console.error("[StatusPages] Failed to delete favicon on page deletion:", err);
    });
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Add monitor to status page
statusPagesRoutes.post("/:id/monitors", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Verify status page belongs to org
  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!page) {
    throw new Error("Not found");
  }

  const body = await c.req.json();
  const { monitorId, displayName, description, order, group } = body;

  const linkId = nanoid();

  const [link] = await db
    .insert(statusPageMonitors)
    .values({
      id: linkId,
      statusPageId: id,
      monitorId,
      displayName,
      description,
      order: order || 0,
      group: group || null,
      createdAt: new Date(),
    })
    .returning();

  return c.json(
    {
      success: true,
      data: link,
    },
    201
  );
});

// Update monitor on status page
statusPagesRoutes.patch("/:id/monitors/:monitorId", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id, monitorId } = c.req.param();

  // Verify status page belongs to org
  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!page) {
    throw new Error("Not found");
  }

  const body = await c.req.json();
  const { displayName, description, order, group } = body;

  const updateData: Record<string, unknown> = {};
  if (displayName !== undefined) updateData.displayName = displayName;
  if (description !== undefined) updateData.description = description;
  if (order !== undefined) updateData.order = order;
  if (group !== undefined) updateData.group = group;

  const [updated] = await db
    .update(statusPageMonitors)
    .set(updateData)
    .where(
      and(
        eq(statusPageMonitors.statusPageId, id),
        eq(statusPageMonitors.monitorId, monitorId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Monitor not found on status page");
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// Remove monitor from status page
statusPagesRoutes.delete("/:id/monitors/:monitorId", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id, monitorId } = c.req.param();

  // Verify status page belongs to org
  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!page) {
    throw new Error("Not found");
  }

  await db
    .delete(statusPageMonitors)
    .where(
      and(
        eq(statusPageMonitors.statusPageId, id),
        eq(statusPageMonitors.monitorId, monitorId)
      )
    );

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Get subscribers
statusPagesRoutes.get("/:id/subscribers", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify status page belongs to org
  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!page) {
    throw new Error("Not found");
  }

  const result = await db.query.subscribers.findMany({
    where: eq(subscribers.statusPageId, id),
    orderBy: [desc(subscribers.createdAt)],
  });

  return c.json({
    success: true,
    data: result,
  });
});

// ==========================================
// Crowdsourced "Is this down?" Settings
// ==========================================

// Get crowdsourced settings for a status page
statusPagesRoutes.get("/:id/crowdsourced", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify status page belongs to org
  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!page) {
    throw new Error("Not found");
  }

  const settings = await db.query.crowdsourcedSettings.findFirst({
    where: eq(crowdsourcedSettings.statusPageId, id),
  });

  // Return default values if no settings exist
  return c.json({
    success: true,
    data: settings || {
      enabled: false,
      reportThreshold: 30,
      timeWindowMinutes: 15,
      rateLimitPerIp: 5,
      autoDegradeEnabled: true,
    },
  });
});

// Update crowdsourced settings for a status page
statusPagesRoutes.patch("/:id/crowdsourced", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Verify status page belongs to org
  const page = await db.query.statusPages.findFirst({
    where: and(
      eq(statusPages.id, id),
      eq(statusPages.organizationId, organizationId)
    ),
  });

  if (!page) {
    throw new Error("Not found");
  }

  const body = await c.req.json();

  // Validate input
  const {
    enabled,
    reportThreshold,
    timeWindowMinutes,
    rateLimitPerIp,
    autoDegradeEnabled,
  } = body;

  const now = new Date();

  // Upsert settings
  const existingSettings = await db.query.crowdsourcedSettings.findFirst({
    where: eq(crowdsourcedSettings.statusPageId, id),
  });

  if (existingSettings) {
    // Update existing
    const [updated] = await db
      .update(crowdsourcedSettings)
      .set({
        enabled: enabled ?? existingSettings.enabled,
        reportThreshold: reportThreshold ?? existingSettings.reportThreshold,
        timeWindowMinutes: timeWindowMinutes ?? existingSettings.timeWindowMinutes,
        rateLimitPerIp: rateLimitPerIp ?? existingSettings.rateLimitPerIp,
        autoDegradeEnabled: autoDegradeEnabled ?? existingSettings.autoDegradeEnabled,
        updatedAt: now,
      })
      .where(eq(crowdsourcedSettings.id, existingSettings.id))
      .returning();

    return c.json({
      success: true,
      data: updated,
    });
  } else {
    // Create new
    const [created] = await db
      .insert(crowdsourcedSettings)
      .values({
        id: nanoid(),
        statusPageId: id,
        enabled: enabled ?? false,
        reportThreshold: reportThreshold ?? 30,
        timeWindowMinutes: timeWindowMinutes ?? 15,
        rateLimitPerIp: rateLimitPerIp ?? 5,
        autoDegradeEnabled: autoDegradeEnabled ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({
      success: true,
      data: created,
    });
  }
});
