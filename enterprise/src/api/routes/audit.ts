import { OpenAPIHono } from "@hono/zod-openapi";
import { users } from "@uni-status/database";
import { enterpriseDb as db } from "../../database";
import { auditLogs } from "../../database/schema/audit";
import { requireOrganization, requireRole } from "../middleware/auth";
import { getLicenseContext, checkFeature, loadLicenseContext } from "../middleware/license";
import { isSelfHosted } from "@uni-status/shared/config";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export const auditRoutes = new OpenAPIHono();

function shouldEnforceFeatureLimits() {
  // Use indirect access to prevent Bun bundler from inlining env vars at build time
  const env = process.env;
  const nodeEnv = env["NODE_ENV"];
  const vitestWorker = env["VITEST_WORKER_ID"];

  if (nodeEnv === "test" || vitestWorker !== undefined) {
    return true; // Enforce feature flags during tests to exercise gating
  }

  const deploymentType = env["DEPLOYMENT_TYPE"];
  return deploymentType === "HOSTED"
    ? true
    : deploymentType === "SELF-HOSTED"
      ? false
      : !isSelfHosted();
}

// List audit logs (admin/owner only)
auditRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);
  let license = getLicenseContext(c);
  if (shouldEnforceFeatureLimits() && !checkFeature(license, "auditLogs")) {
    // Refresh license context to avoid stale/missing state in tests
    license = await loadLicenseContext(organizationId);
    c.set("license", license);
    if (!checkFeature(license, "auditLogs")) {
      return c.json(
        {
          success: false,
          error: "Audit logs require an Enterprise plan.",
        },
        403
      );
    }
  }
  const isLegacyRoute = c.req.path?.includes("/audit") && !c.req.path?.includes("/audit-logs");

  // Parse query params
  const action = c.req.query("action");
  const userId = c.req.query("userId");
  const resourceType = c.req.query("resourceType");
  const resourceId = c.req.query("resourceId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  // Build where conditions
  const conditions = [eq(auditLogs.organizationId, organizationId)];

  if (action) {
    conditions.push(eq(auditLogs.action, action as any));
  }
  if (userId) {
    conditions.push(eq(auditLogs.userId, userId));
  }
  if (resourceType) {
    conditions.push(eq(auditLogs.resourceType, resourceType as any));
  }
  if (resourceId) {
    conditions.push(eq(auditLogs.resourceId, resourceId));
  }
  if (from) {
    conditions.push(gte(auditLogs.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(auditLogs.createdAt, new Date(to)));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);

  // Get audit logs with user info using leftJoin to handle nullable userId
  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      resourceName: auditLogs.resourceName,
      userId: auditLogs.userId,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      organizationId: auditLogs.organizationId,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const meta = {
    total,
    limit,
    offset,
    hasMore: offset + logs.length < total,
  };

  if (isLegacyRoute) {
    // Legacy shape expected by older clients/tests: data is the array, meta is top-level
    return c.json({
      success: true,
      data: logs,
      meta,
    });
  }

  return c.json({
    success: true,
    data: {
      data: logs,
      meta,
    },
  });
});

// Export audit logs (admin/owner only)
auditRoutes.get("/export", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);
  let license = getLicenseContext(c);
  if (shouldEnforceFeatureLimits() && !checkFeature(license, "auditLogs")) {
    // Refresh license context to avoid stale/missing state in tests
    license = await loadLicenseContext(organizationId);
    c.set("license", license);
    if (!checkFeature(license, "auditLogs")) {
      return c.json(
        {
          success: false,
          error: "Audit logs require an Enterprise plan.",
        },
        403
      );
    }
  }

  const format = c.req.query("format") || "json";
  const from = c.req.query("from");
  const to = c.req.query("to");

  // Build where conditions
  const conditions = [eq(auditLogs.organizationId, organizationId)];

  if (from) {
    conditions.push(gte(auditLogs.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(auditLogs.createdAt, new Date(to)));
  }

  // Get all audit logs (limited to 10000 for export) using leftJoin
  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      resourceName: auditLogs.resourceName,
      userId: auditLogs.userId,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      organizationId: auditLogs.organizationId,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10000);

  if (format === "csv") {
    const headers = [
      "id",
      "timestamp",
      "action",
      "resource_type",
      "resource_id",
      "resource_name",
      "user_id",
      "user_name",
      "user_email",
      "ip_address",
      "user_agent",
    ];

    const rows = logs.map((log) => [
      log.id,
      log.createdAt.toISOString(),
      log.action,
      log.resourceType,
      log.resourceId || "",
      log.resourceName || "",
      log.userId || "",
      log.user?.name || "",
      log.user?.email || "",
      log.ipAddress || "",
      (log.userAgent || "").replace(/,/g, " "),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  // Default to JSON
  return new Response(JSON.stringify(logs, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
});

// Get audit log actions summary (for filters)
auditRoutes.get("/actions", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  const result = await db
    .select({
      action: auditLogs.action,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, organizationId))
    .groupBy(auditLogs.action)
    .orderBy(desc(sql`count(*)`));

  return c.json({
    success: true,
    data: result.map((r) => ({ action: r.action, count: Number(r.count) })),
  });
});

// Get audit log users summary (for filters)
auditRoutes.get("/users", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  const result = await db
    .select({
      userId: auditLogs.userId,
      userName: users.name,
      userEmail: users.email,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.organizationId, organizationId))
    .groupBy(auditLogs.userId, users.name, users.email)
    .orderBy(desc(sql`count(*)`));

  return c.json({
    success: true,
    data: result.map((r) => ({
      userId: r.userId,
      name: r.userName,
      email: r.userEmail,
      count: Number(r.count),
    })),
  });
});
