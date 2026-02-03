import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults, incidents, heartbeatPings, monitorDependencies } from "@uni-status/database/schema";
import { createMonitorSchema, updateMonitorSchema } from "@uni-status/shared/validators";
import { encryptConfigSecrets } from "@uni-status/shared/crypto";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { queueMonitorCheck } from "../lib/queues";
import { createAuditLog, createAuditLogWithChanges, getAuditUserId } from "../lib/audit";
import {
  getLicenseContext,
  requireResourceLimit,
  requireMinCheckInterval,
} from "@uni-status/enterprise/api/middleware/license";
import { eq, and, desc, sql, isNotNull, inArray, gte } from "drizzle-orm";

/**
 * Sanitize user input by escaping HTML special characters to prevent XSS attacks.
 */
function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export const monitorsRoutes = new OpenAPIHono();

async function getMonitorDependenciesIds(organizationId: string, monitorId: string) {
  const upstream = await db
    .select({ upstreamMonitorId: monitorDependencies.upstreamMonitorId })
    .from(monitorDependencies)
    .innerJoin(monitors, eq(monitorDependencies.upstreamMonitorId, monitors.id))
    .where(
      and(
        eq(monitorDependencies.downstreamMonitorId, monitorId),
        eq(monitors.organizationId, organizationId)
      )
    );

  return upstream.map((dep) => dep.upstreamMonitorId);
}

async function replaceDependencies(
  organizationId: string,
  monitorId: string,
  dependsOn?: string[]
): Promise<{ ok: boolean; ids: string[]; error?: string; status?: 400 | 404 }> {
  if (dependsOn === undefined) {
    return { ok: true, ids: await getMonitorDependenciesIds(organizationId, monitorId) };
  }

  const uniqueDependsOn = Array.from(new Set(dependsOn));

  if (uniqueDependsOn.length === 0) {
    await db
      .delete(monitorDependencies)
      .where(eq(monitorDependencies.downstreamMonitorId, monitorId));
    return { ok: true, ids: [] };
  }

  // Validate upstream monitors belong to the same organization
  const upstreamMonitors = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(eq(monitors.organizationId, organizationId), inArray(monitors.id, uniqueDependsOn)));

  if (upstreamMonitors.length !== uniqueDependsOn.length) {
    return {
      ok: false,
      ids: [],
      error: "One or more upstream monitors were not found in this organization",
      status: 404,
    };
  }

  // Clear existing dependencies now that validation passed
  await db
    .delete(monitorDependencies)
    .where(eq(monitorDependencies.downstreamMonitorId, monitorId));

  const now = new Date();
  await db.insert(monitorDependencies).values(
    upstreamMonitors.map((upstream) => ({
      id: nanoid(),
      downstreamMonitorId: monitorId,
      upstreamMonitorId: upstream.id,
      createdAt: now,
    }))
  );

  return { ok: true, ids: upstreamMonitors.map((m) => m.id) };
}

// List monitors
monitorsRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(monitors)
    .where(eq(monitors.organizationId, organizationId));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.monitors.findMany({
    where: eq(monitors.organizationId, organizationId),
    orderBy: [desc(monitors.createdAt)],
    limit,
    offset,
  });

  // If no monitors, return early with meta
  if (result.length === 0) {
    return c.json({
      success: true,
      data: [],
      meta: {
        total,
        limit,
        offset,
        hasMore: false,
      },
    });
  }

  const monitorIds = result.map((m) => m.id);

  // Get uptime stats for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const uptimeStats = await db
    .select({
      monitorId: checkResults.monitorId,
      successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
      degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
      totalCount: sql<number>`COUNT(*)`.as("total_count"),
    })
    .from(checkResults)
    .where(
      and(
        inArray(checkResults.monitorId, monitorIds),
        gte(checkResults.createdAt, thirtyDaysAgo),
        sql`COALESCE(${checkResults.metadata} ->> 'checkType', '') <> 'certificate_transparency'`
      )
    )
    .groupBy(checkResults.monitorId);

  // Get average response time for last 24 hours
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const responseStats = await db
    .select({
      monitorId: checkResults.monitorId,
      avgResponseTime: sql<number>`AVG(${checkResults.responseTimeMs})`.as("avg_response_time"),
    })
    .from(checkResults)
    .where(
      and(
        inArray(checkResults.monitorId, monitorIds),
        gte(checkResults.createdAt, twentyFourHoursAgo),
        isNotNull(checkResults.responseTimeMs),
        inArray(checkResults.status, ['success', 'degraded']),
        sql`COALESCE(${checkResults.metadata} ->> 'checkType', '') <> 'certificate_transparency'`
      )
    )
    .groupBy(checkResults.monitorId);

  // Build lookup maps
  // Ensure counts are numbers (PostgreSQL bigint may come as strings)
  const uptimeMap = new Map(
    uptimeStats.map((s) => {
      const successCount = Number(s.successCount);
      const degradedCount = Number(s.degradedCount);
      const totalCount = Number(s.totalCount);
      return [
        s.monitorId,
        totalCount > 0 ? ((successCount + degradedCount) / totalCount) * 100 : null,
      ];
    })
  );

  const responseMap = new Map(
    responseStats.map((s) => [s.monitorId, s.avgResponseTime])
  );

  // Enrich monitors with stats
  const enrichedResult = result.map((monitor) => ({
    ...monitor,
    uptimePercentage: uptimeMap.get(monitor.id) ?? null,
    avgResponseTime: responseMap.get(monitor.id) ?? null,
  }));

  return c.json({
    success: true,
    data: enrichedResult,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + result.length < total,
    },
  });
});

// Create monitor
monitorsRoutes.post("/", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  // Check license entitlements for monitor limit
  const licenseContext = getLicenseContext(c);
  try {
    const currentMonitorCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(monitors)
      .where(eq(monitors.organizationId, organizationId));
    requireResourceLimit(
      licenseContext,
      "monitors",
      Number(currentMonitorCount[0]?.count ?? 0),
      "Monitor"
    );
  } catch (error) {
    // If it's an HTTPException (403 from requireResourceLimit), re-throw it
    if (error instanceof HTTPException) {
      throw error;
    }
    // Any other error during entitlement check should be treated as limit reached
    throw new HTTPException(403, { message: "Monitor limit check failed" });
  }

  const body = await c.req.json();
  const validated = createMonitorSchema.parse(body);

  // Check minimum check interval based on org type limits
  if (validated.intervalSeconds !== undefined) {
    requireMinCheckInterval(licenseContext, validated.intervalSeconds);
  }
  const { dependsOn, ...monitorInput } = validated;
  const monitorInputDb = monitorInput as Partial<typeof monitors.$inferInsert>;

  const id = nanoid();
  const now = new Date();

  // Generate heartbeat token for heartbeat monitors
  const heartbeatToken = validated.type === "heartbeat" ? nanoid(32) : null;

  // Encrypt secrets in config if present
  let config = validated.config;
  if (config) {
    config = await encryptConfigSecrets(config as Record<string, unknown>) as typeof config;
  }

  // Sanitize user-provided strings to prevent XSS
  const sanitizedName = sanitizeHtml(validated.name);
  const sanitizedDescription = validated.description ? sanitizeHtml(validated.description) : null;

  const [monitor] = await db
    .insert(monitors)
    .values({
      id,
      organizationId,
      ...monitorInputDb,
      name: sanitizedName,
      description: sanitizedDescription,
      config,
      heartbeatToken,
      status: "pending",
      createdBy: auth.user?.id || auth.apiKey!.id,
      createdAt: now,
      updatedAt: now,
      nextCheckAt: now,
    } as typeof monitors.$inferInsert)
    .returning();

  if (!monitor) {
    return c.json({ success: false, error: "Failed to create monitor" }, 500);
  }

  // Publish monitor created event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "monitor:created",
    data: { id: monitor.id, name: monitor.name, type: monitor.type, status: monitor.status },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.create",
    resourceType: "monitor",
    resourceId: monitor.id,
    resourceName: monitor.name,
    metadata: { after: { name: monitor.name, url: monitor.url, type: monitor.type } },
  });

  const depsResult = await replaceDependencies(organizationId, monitor.id, dependsOn);
  if (!depsResult.ok) {
    await db.delete(monitors).where(eq(monitors.id, monitor.id));
    return c.json(
      { success: false, error: depsResult.error ?? "Invalid monitor dependencies" },
      (depsResult.status ?? 400) as 400 | 404
    );
  }

  return c.json(
    {
      success: true,
      data: { ...monitor, dependsOn: depsResult.ids },
    },
    201
  );
});

// Get monitor by ID
monitorsRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, id),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: { ...monitor, dependsOn: await getMonitorDependenciesIds(organizationId, monitor.id) },
  });
});

// Update monitor
monitorsRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateMonitorSchema.parse(body);
  const { dependsOn, ...monitorUpdates } = validated;
  const now = new Date();

  // Check minimum check interval based on org type limits
  if (validated.intervalSeconds !== undefined) {
    const licenseContext = getLicenseContext(c);
    requireMinCheckInterval(licenseContext, validated.intervalSeconds);
  }

  // Get existing monitor for audit log
  const existingMonitor = await db.query.monitors.findFirst({
    where: and(eq(monitors.id, id), eq(monitors.organizationId, organizationId)),
  });

  if (!existingMonitor) {
    throw new Error("Not found");
  }

  const updateData = { ...monitorUpdates, updatedAt: now } as Partial<typeof monitors.$inferInsert>;
  const [monitor] = await db
    .update(monitors)
    .set(updateData)
    .where(
      and(eq(monitors.id, id), eq(monitors.organizationId, organizationId))
    )
    .returning();

  if (!monitor) {
    return c.json({ success: false, error: "Monitor not found" }, 404);
  }

  // Publish monitor updated event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "monitor:updated",
    data: { id: monitor.id, name: monitor.name, type: monitor.type, status: monitor.status },
    timestamp: now.toISOString(),
  });

  // Audit log with changes
  await createAuditLogWithChanges(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.update",
    resourceType: "monitor",
    resourceId: monitor.id,
    resourceName: monitor.name,
    before: { name: existingMonitor.name, url: existingMonitor.url, type: existingMonitor.type, intervalSeconds: existingMonitor.intervalSeconds },
    after: { name: monitor.name, url: monitor.url, type: monitor.type, intervalSeconds: monitor.intervalSeconds },
  });

  const depsResult = await replaceDependencies(organizationId, id, dependsOn);
  if (!depsResult.ok) {
    return c.json(
      { success: false, error: depsResult.error ?? "Invalid monitor dependencies" },
      depsResult.status ?? 400
    );
  }

  return c.json({
    success: true,
    data: { ...monitor, dependsOn: depsResult.ids },
  });
});

// Delete monitor
monitorsRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Get monitor info for audit before delete
  const existingMonitor = await db.query.monitors.findFirst({
    where: and(eq(monitors.id, id), eq(monitors.organizationId, organizationId)),
  });

  if (!existingMonitor) {
    throw new Error("Not found");
  }

  const result = await db
    .delete(monitors)
    .where(
      and(eq(monitors.id, id), eq(monitors.organizationId, organizationId))
    )
    .returning();

  // Publish monitor deleted event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "monitor:deleted",
    data: { id },
    timestamp: new Date().toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.delete",
    resourceType: "monitor",
    resourceId: id,
    resourceName: existingMonitor.name,
    metadata: { before: { name: existingMonitor.name, url: existingMonitor.url, type: existingMonitor.type } },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Pause monitor
monitorsRoutes.post("/:id/pause", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const now = new Date();

  const [monitor] = await db
    .update(monitors)
    .set({
      paused: true,
      status: "paused",
      updatedAt: now,
    })
    .where(
      and(eq(monitors.id, id), eq(monitors.organizationId, organizationId))
    )
    .returning();

  if (!monitor) {
    throw new Error("Not found");
  }

  // Publish monitor paused event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "monitor:status_changed",
    data: { id: monitor.id, name: monitor.name, status: "paused", previousStatus: "up" },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.pause",
    resourceType: "monitor",
    resourceId: monitor.id,
    resourceName: monitor.name,
  });

  return c.json({
    success: true,
    data: monitor,
  });
});

// Resume monitor
monitorsRoutes.post("/:id/resume", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const now = new Date();

  const [monitor] = await db
    .update(monitors)
    .set({
      paused: false,
      status: "pending",
      nextCheckAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(monitors.id, id), eq(monitors.organizationId, organizationId))
    )
    .returning();

  if (!monitor) {
    throw new Error("Not found");
  }

  // Publish monitor resumed event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "monitor:status_changed",
    data: { id: monitor.id, name: monitor.name, status: "pending", previousStatus: "paused" },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.resume",
    resourceType: "monitor",
    resourceId: monitor.id,
    resourceName: monitor.name,
  });

  return c.json({
    success: true,
    data: monitor,
  });
});

// Get check results
monitorsRoutes.get("/:id/results", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify monitor belongs to org
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, id),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  const limit = parseInt(c.req.query("limit") || "100");
  const offset = parseInt(c.req.query("offset") || "0");
  const includeIncident = c.req.query("includeIncident") !== "false";

  // Use a left join to include incident data when available
  const results = await db
    .select({
      id: checkResults.id,
      monitorId: checkResults.monitorId,
      region: checkResults.region,
      status: checkResults.status,
      responseTimeMs: checkResults.responseTimeMs,
      statusCode: checkResults.statusCode,
      dnsMs: checkResults.dnsMs,
      tcpMs: checkResults.tcpMs,
      tlsMs: checkResults.tlsMs,
      ttfbMs: checkResults.ttfbMs,
      transferMs: checkResults.transferMs,
      responseSize: checkResults.responseSize,
      errorMessage: checkResults.errorMessage,
      errorCode: checkResults.errorCode,
      headers: checkResults.headers,
      certificateInfo: checkResults.certificateInfo,
      metadata: checkResults.metadata,
      incidentId: checkResults.incidentId,
      createdAt: checkResults.createdAt,
      // Extended result fields for specialized monitors
      pagespeedScores: checkResults.pagespeedScores,
      webVitals: checkResults.webVitals,
      emailAuthDetails: checkResults.emailAuthDetails,
      securityHeaders: checkResults.securityHeaders,
      // Include incident info if linked
      incident: includeIncident ? {
        id: incidents.id,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
      } : sql`NULL`,
    })
    .from(checkResults)
    .leftJoin(incidents, eq(checkResults.incidentId, incidents.id))
    .where(
      and(
        eq(checkResults.monitorId, id),
        sql`COALESCE(${checkResults.metadata} ->> 'checkType', '') <> 'certificate_transparency'`
      )
    )
    .orderBy(desc(checkResults.createdAt))
    .limit(limit)
    .offset(offset);

  // Transform results to flatten incident data when not null
  const transformedResults = results.map((r) => ({
    ...r,
    incident: r.incident && typeof r.incident === "object" && "id" in r.incident && r.incident.id
      ? r.incident
      : null,
  }));

  return c.json({
    success: true,
    data: transformedResults,
    meta: {
      limit,
      offset,
    },
  });
});

// Trigger immediate check
monitorsRoutes.post("/:id/check", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Verify monitor belongs to org and get full monitor data
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, id),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  if (monitor.paused) {
    return c.json(
      {
        success: false,
        error: "Cannot check paused monitor",
      },
      400
    );
  }

  // Queue immediate check job
  const jobId = await queueMonitorCheck({
    monitor: {
      id: monitor.id,
      type: monitor.type,
      url: monitor.url,
      method: monitor.method,
      headers: monitor.headers as Record<string, string> | null,
      body: monitor.body,
      timeoutMs: monitor.timeoutMs,
      assertions: monitor.assertions as Record<string, unknown> | null,
      regions: monitor.regions as string[],
      degradedThresholdMs: monitor.degradedThresholdMs,
      config: monitor.config as Record<string, unknown> | null,
    },
  });

  // Note: SSL certificate checks run on a separate schedule (not on every check)
  // to avoid duplicate check results and unnecessary overhead

  // Update last checked timestamp
  await db
    .update(monitors)
    .set({
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, id));

  return c.json({
    success: true,
    data: { queued: true, jobId },
  });
});

// Receive heartbeat ping (authenticated)
// POST /api/v1/monitors/:id/heartbeat
monitorsRoutes.post("/:id/heartbeat", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify monitor belongs to org and is a heartbeat type
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, id),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  if (monitor.type !== "heartbeat") {
    return c.json(
      {
        success: false,
        error: "Monitor is not a heartbeat type",
      },
      400
    );
  }

  // Parse query params for ping details
  const status = (c.req.query("status") as "start" | "complete" | "fail") || "complete";
  const duration = c.req.query("duration") ? parseInt(c.req.query("duration")!) : undefined;
  const exitCode = c.req.query("exit_code") ? parseInt(c.req.query("exit_code")!) : undefined;

  // Get optional metadata from body
  let metadata: Record<string, unknown> | undefined;
  try {
    const body = await c.req.json();
    if (body && typeof body === "object") {
      metadata = body;
    }
  } catch {
    // No body or invalid JSON - that's fine
  }

  const pingId = nanoid();
  const now = new Date();

  // Record the heartbeat ping
  await db.insert(heartbeatPings).values({
    id: pingId,
    monitorId: id,
    status,
    durationMs: duration,
    exitCode,
    metadata,
    createdAt: now,
  });

  // Update the monitor's lastCheckedAt to reflect activity
  await db
    .update(monitors)
    .set({
      lastCheckedAt: now,
      updatedAt: now,
      // If ping is successful, set status to active; if fail, set to down
      status: status === "fail" ? "down" : "active",
    })
    .where(eq(monitors.id, id));

  // Publish event for real-time updates
  await publishEvent(`monitor:${id}`, {
    type: "monitor:heartbeat",
    data: {
      monitorId: id,
      pingId,
      status,
      durationMs: duration,
      exitCode,
      timestamp: now.toISOString(),
    },
  });

  return c.json({
    success: true,
    data: {
      id: pingId,
      status,
      createdAt: now.toISOString(),
    },
  });
});

// Get heartbeat pings history
// GET /api/v1/monitors/:id/heartbeat
monitorsRoutes.get("/:id/heartbeat", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify monitor belongs to org
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, id),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  if (monitor.type !== "heartbeat") {
    return c.json(
      {
        success: false,
        error: "Monitor is not a heartbeat type",
      },
      400
    );
  }

  const limit = parseInt(c.req.query("limit") || "100");
  const offset = parseInt(c.req.query("offset") || "0");

  const pings = await db.query.heartbeatPings.findMany({
    where: eq(heartbeatPings.monitorId, id),
    orderBy: [desc(heartbeatPings.createdAt)],
    limit,
    offset,
  });

  return c.json({
    success: true,
    data: pings,
    meta: {
      limit,
      offset,
    },
  });
});
