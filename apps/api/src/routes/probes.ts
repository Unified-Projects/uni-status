import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "@uni-status/database";
import {
  probes,
  probeAssignments,
  probePendingJobs,
  probeHeartbeats,
  monitors,
  checkResults,
} from "@uni-status/database/schema";
import {
  createProbeSchema,
  updateProbeSchema,
  assignProbeToMonitorSchema,
  probeHeartbeatSchema,
  probeJobResultSchema,
} from "@uni-status/shared/validators";
import { SSE_CHANNELS, QUEUE_NAMES } from "@uni-status/shared/constants";
import {
  authMiddleware,
  requireAuth,
  requireOrganization,
  requireScope,
} from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { createAuditLog, getAuditUserId } from "../lib/audit";
import { getQueue } from "../lib/queues";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { eq, and, desc, gte, lte, sql, inArray, lt } from "drizzle-orm";

export const probesRoutes = new OpenAPIHono();

// Apply auth for management endpoints; allow agent token endpoints to skip standard auth
probesRoutes.use("*", async (c, next) => {
  const path = c.req.path;
  if (path.includes("/agent/")) {
    return next();
  }
  return authMiddleware(c, next);
});

// Helper to hash the auth token
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Helper to get token prefix (first 8 chars for lookup)
function getTokenPrefix(token: string): string {
  return token.substring(0, 8);
}

// Helper to build the installation command for a probe agent
function buildProbeInstallCommand(authToken: string, probeId: string): string {
  const envApiUrl = process.env.UNI_STATUS_API_URL
    ? process.env.UNI_STATUS_API_URL
    : process.env.UNI_STATUS_URL
      ? `${process.env.UNI_STATUS_URL.replace(/\/$/, "")}/api`
      : "https://your-uni-status-host/api";

  const apiUrl = envApiUrl.replace(/\/$/, "");
  const image = process.env.UNI_STATUS_PROBE_IMAGE || "unifiedprojects/uni-status-probe:latest";

  return [
    "docker run -d --restart unless-stopped",
    `-e UNI_STATUS_API_URL=\"${apiUrl}\"`,
    `-e UNI_STATUS_PROBE_TOKEN=\"${authToken}\"`,
    `-e UNI_STATUS_PROBE_ID=\"${probeId}\"`,
    image,
  ].join(" ");
}

// Middleware to authenticate probes via bearer token
async function authenticateProbe(c: any): Promise<{
  probe: typeof probes.$inferSelect;
  organizationId: string;
} | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const tokenPrefix = getTokenPrefix(token);
  const tokenHash = hashToken(token);

  // Find probe by token prefix first (index lookup)
  const probe = await db.query.probes.findFirst({
    where: and(
      eq(probes.authTokenPrefix, tokenPrefix),
      eq(probes.authToken, tokenHash)
    ),
  });

  if (!probe || probe.status === "disabled") {
    return null;
  }

  return {
    probe,
    organizationId: probe.organizationId,
  };
}

probesRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(probes)
    .where(eq(probes.organizationId, organizationId));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.probes.findMany({
    where: eq(probes.organizationId, organizationId),
    orderBy: [desc(probes.createdAt)],
    limit,
    offset,
    with: {
      assignments: {
        with: {
          monitor: {
            columns: {
              id: true,
              name: true,
              type: true,
              status: true,
            },
          },
        },
      },
    },
  });

  // Don't expose auth tokens
  const safeResult = result.map((p) => ({
    ...p,
    authToken: undefined,
    authTokenPrefix: `${p.authTokenPrefix}...`,
    assignedMonitorCount: p.assignments.length,
  }));

  return c.json({
    success: true,
    data: safeResult,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + result.length < total,
    },
  });
});

probesRoutes.post("/", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createProbeSchema.parse(body);

  const id = nanoid();
  const authToken = nanoid(48); // Generate a secure auth token
  const tokenHash = hashToken(authToken);
  const tokenPrefix = getTokenPrefix(authToken);
  const now = new Date();

  const [probe] = await db
    .insert(probes)
    .values({
      id,
      organizationId,
      name: validated.name,
      description: validated.description,
      region: validated.region,
      authToken: tokenHash,
      authTokenPrefix: tokenPrefix,
      status: "pending",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!probe) {
    return c.json({ success: false, error: "Failed to create probe" }, 500);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "probe.create",
    resourceType: "probe",
    resourceId: probe.id,
    resourceName: probe.name,
  });

  // Return the auth token only on creation - it won't be shown again
  return c.json(
    {
      success: true,
      data: {
        ...probe,
        authToken, // Only shown once on creation
        authTokenPrefix: undefined,
        installCommand: buildProbeInstallCommand(authToken, id),
      },
    },
    201
  );
});

probesRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const probe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
    with: {
      assignments: {
        with: {
          monitor: {
            columns: {
              id: true,
              name: true,
              type: true,
              status: true,
              url: true,
            },
          },
        },
      },
    },
  });

  if (!probe) {
    return c.json(
      {
        success: false,
        error: "Probe not found",
      },
      404
    );
  }

  // Get recent heartbeats
  const recentHeartbeats = await db.query.probeHeartbeats.findMany({
    where: eq(probeHeartbeats.probeId, id),
    orderBy: [desc(probeHeartbeats.createdAt)],
    limit: 10,
  });

  return c.json({
    success: true,
    data: {
      ...probe,
      authToken: undefined,
      authTokenPrefix: `${probe.authTokenPrefix}...`,
      recentHeartbeats,
    },
  });
});

probesRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateProbeSchema.parse(body);
  const now = new Date();

  const existingProbe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
  });

  if (!existingProbe) {
    return c.json(
      {
        success: false,
        error: "Probe not found",
      },
      404
    );
  }

  const updateData: Record<string, unknown> = { updatedAt: now };
  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.description !== undefined) updateData.description = validated.description;
  if (validated.region !== undefined) updateData.region = validated.region;
  if (validated.status !== undefined) updateData.status = validated.status;

  const [probe] = await db
    .update(probes)
    .set(updateData)
    .where(and(eq(probes.id, id), eq(probes.organizationId, organizationId)))
    .returning();

  if (!probe) {
    return c.json({ success: false, error: "Probe not found" }, 404);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "probe.update",
    resourceType: "probe",
    resourceId: probe.id,
    resourceName: probe.name,
  });

  return c.json({
    success: true,
    data: {
      ...probe,
      authToken: undefined,
      authTokenPrefix: `${probe.authTokenPrefix}...`,
    },
  });
});

probesRoutes.post("/:id/regenerate-token", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existingProbe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
  });

  if (!existingProbe) {
    return c.json(
      {
        success: false,
        error: "Probe not found",
      },
      404
    );
  }

  const authToken = nanoid(48);
  const tokenHash = hashToken(authToken);
  const tokenPrefix = getTokenPrefix(authToken);
  const now = new Date();

  const [probe] = await db
    .update(probes)
    .set({
      authToken: tokenHash,
      authTokenPrefix: tokenPrefix,
      status: "pending", // Require re-authentication
      updatedAt: now,
    })
    .where(and(eq(probes.id, id), eq(probes.organizationId, organizationId)))
    .returning();

  if (!probe) {
    return c.json({ success: false, error: "Probe not found" }, 404);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "probe.regenerate_token",
    resourceType: "probe",
    resourceId: probe.id,
    resourceName: probe.name,
  });

  return c.json({
    success: true,
    data: {
      ...probe,
      authToken, // Shown once on regeneration
      authTokenPrefix: undefined,
      installCommand: buildProbeInstallCommand(authToken, id),
    },
  });
});

probesRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existingProbe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
  });

  if (!existingProbe) {
    return c.json(
      {
        success: false,
        error: "Probe not found",
      },
      404
    );
  }

  await db
    .delete(probes)
    .where(and(eq(probes.id, id), eq(probes.organizationId, organizationId)));

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "probe.delete",
    resourceType: "probe",
    resourceId: id,
    resourceName: existingProbe.name,
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

probesRoutes.post("/:id/assign", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = assignProbeToMonitorSchema.parse({ ...body, probeId: id });

  // Verify probe exists
  const probe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
  });

  if (!probe) {
    return c.json({ success: false, error: "Probe not found" }, 404);
  }

  // Verify monitor exists
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, validated.monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    return c.json({ success: false, error: "Monitor not found" }, 404);
  }

  // Check if assignment already exists
  const existing = await db.query.probeAssignments.findFirst({
    where: and(
      eq(probeAssignments.probeId, id),
      eq(probeAssignments.monitorId, validated.monitorId)
    ),
  });

  if (existing) {
    return c.json({ success: false, error: "Assignment already exists" }, 409);
  }

  const assignmentId = nanoid();
  const now = new Date();

  const [assignment] = await db
    .insert(probeAssignments)
    .values({
      id: assignmentId,
      probeId: id,
      monitorId: validated.monitorId,
      priority: validated.priority ?? 1,
      exclusive: validated.exclusive ?? false,
      createdAt: now,
    })
    .returning();

  if (!assignment) {
    return c.json({ success: false, error: "Failed to assign probe" }, 500);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "probe.assign_monitor",
    resourceType: "probe_assignment",
    resourceId: assignmentId,
    resourceName: `${probe.name} -> ${monitor.name}`,
    metadata: {
      probeId: id,
      monitorId: validated.monitorId,
      priority: validated.priority,
      exclusive: validated.exclusive,
    },
  });

  return c.json(
    {
      success: true,
      data: assignment,
    },
    201
  );
});

probesRoutes.delete("/:id/assign/:monitorId", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id, monitorId } = c.req.param();

  // Verify probe exists
  const probe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
  });

  if (!probe) {
    return c.json({ success: false, error: "Probe not found" }, 404);
  }

  const existing = await db.query.probeAssignments.findFirst({
    where: and(
      eq(probeAssignments.probeId, id),
      eq(probeAssignments.monitorId, monitorId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: "Assignment not found" }, 404);
  }

  await db
    .delete(probeAssignments)
    .where(
      and(
        eq(probeAssignments.probeId, id),
        eq(probeAssignments.monitorId, monitorId)
      )
    );

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "probe.unassign_monitor",
    resourceType: "probe_assignment",
    resourceId: existing.id,
    metadata: {
      probeId: id,
      monitorId,
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

probesRoutes.post("/agent/heartbeat", async (c) => {
  const authResult = await authenticateProbe(c);
  if (!authResult) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { probe, organizationId } = authResult;
  const body = await c.req.json();
  const validated = probeHeartbeatSchema.parse(body);

  const now = new Date();
  const ipAddress = c.req.header("X-Forwarded-For")?.split(",")[0] || c.req.header("X-Real-IP") || "unknown";

  // Record heartbeat
  const heartbeatId = nanoid();
  await db.insert(probeHeartbeats).values({
    id: heartbeatId,
    probeId: probe.id,
    metrics: validated.metrics || {},
    ipAddress,
    createdAt: now,
  });

  // Update probe status
  await db
    .update(probes)
    .set({
      status: "active",
      version: validated.version,
      lastHeartbeatAt: now,
      lastIp: ipAddress,
      metadata: validated.metadata || probe.metadata,
      updatedAt: now,
    })
    .where(eq(probes.id, probe.id));

  return c.json({
    success: true,
    data: {
      heartbeatId,
      timestamp: now.toISOString(),
    },
  });
});

probesRoutes.get("/agent/jobs", async (c) => {
  const authResult = await authenticateProbe(c);
  if (!authResult) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { probe } = authResult;
  const limit = parseInt(c.req.query("limit") || "10");
  const now = new Date();

  // Get pending jobs for this probe that haven't expired
  const jobs = await db.query.probePendingJobs.findMany({
    where: and(
      eq(probePendingJobs.probeId, probe.id),
      eq(probePendingJobs.status, "pending"),
      gte(probePendingJobs.expiresAt, now)
    ),
    orderBy: [desc(probePendingJobs.createdAt)],
    limit,
  });

  // Claim the jobs
  if (jobs.length > 0) {
    await db
      .update(probePendingJobs)
      .set({
        status: "claimed",
        claimedAt: now,
      })
      .where(inArray(probePendingJobs.id, jobs.map((j) => j.id)));
  }

  return c.json({
    success: true,
    data: jobs.map((j) => ({
      id: j.id,
      monitorId: j.monitorId,
      jobData: j.jobData,
      expiresAt: j.expiresAt,
    })),
  });
});

probesRoutes.post("/agent/jobs/:jobId/result", async (c) => {
  const authResult = await authenticateProbe(c);
  if (!authResult) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { probe, organizationId } = authResult;
  const { jobId } = c.req.param();
  const body = await c.req.json();
  const validated = probeJobResultSchema.parse({ ...body, jobId });

  // Verify job exists and belongs to this probe
  const job = await db.query.probePendingJobs.findFirst({
    where: and(
      eq(probePendingJobs.id, jobId),
      eq(probePendingJobs.probeId, probe.id)
    ),
  });

  if (!job) {
    return c.json({ success: false, error: "Job not found" }, 404);
  }

  const now = new Date();

  // Mark job as completed
  await db
    .update(probePendingJobs)
    .set({
      status: "completed",
    })
    .where(eq(probePendingJobs.id, jobId));

  // Create check result
  const resultId = nanoid();
  const [checkResult] = await db
    .insert(checkResults)
    .values({
      id: resultId,
      monitorId: validated.monitorId,
      region: probe.region || "private",
      status: validated.success ? "success" : "error",
      responseTimeMs: Math.round(validated.responseTimeMs),
      statusCode: validated.statusCode,
      errorMessage: validated.errorMessage,
      metadata: {
        ...((validated.metadata as Record<string, unknown>) || {}),
        probeId: probe.id,
        probeName: probe.name,
      },
      createdAt: now,
    })
    .returning();

  if (!checkResult) {
    return c.json({ success: false, error: "Failed to record check result" }, 500);
  }

  // Update monitor status
  const newStatus = validated.success ? "active" : "down";
  await db
    .update(monitors)
    .set({
      status: newStatus,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(monitors.id, validated.monitorId));

  // Get monitor for SSE event
  const monitor = await db.query.monitors.findFirst({
    where: eq(monitors.id, validated.monitorId),
  });

  if (monitor) {
    // Publish status update
    await publishEvent(`${SSE_CHANNELS.MONITOR}${validated.monitorId}`, {
      type: "monitor:check_result",
      data: {
        id: resultId,
        monitorId: validated.monitorId,
        status: checkResult.status,
        responseTimeMs: checkResult.responseTimeMs,
        probeId: probe.id,
        probeName: probe.name,
      },
      timestamp: now.toISOString(),
    });

    // Evaluate alerts
    await evaluateAlerts({
      monitor,
      checkResult,
      organizationId,
    });
  }

  return c.json({
    success: true,
    data: {
      resultId,
      processed: true,
    },
  });
});

probesRoutes.get("/:id/stats", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const probe = await db.query.probes.findFirst({
    where: and(eq(probes.id, id), eq(probes.organizationId, organizationId)),
  });

  if (!probe) {
    return c.json({ success: false, error: "Probe not found" }, 404);
  }

  const hours = parseInt(c.req.query("hours") || "24");
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get job stats
  const jobStats = await db
    .select({
      status: probePendingJobs.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(probePendingJobs)
    .where(
      and(
        eq(probePendingJobs.probeId, id),
        gte(probePendingJobs.createdAt, since)
      )
    )
    .groupBy(probePendingJobs.status);

  // Get heartbeat count
  const heartbeatCount = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(probeHeartbeats)
    .where(
      and(
        eq(probeHeartbeats.probeId, id),
        gte(probeHeartbeats.createdAt, since)
      )
    );

  // Get average metrics from recent heartbeats
  const avgMetrics = await db.query.probeHeartbeats.findMany({
    where: and(
      eq(probeHeartbeats.probeId, id),
      gte(probeHeartbeats.createdAt, since)
    ),
    orderBy: [desc(probeHeartbeats.createdAt)],
    limit: 100,
  });

  // Calculate averages
  let avgCpu = 0;
  let avgMemory = 0;
  let metricsCount = 0;

  for (const hb of avgMetrics) {
    const metrics = hb.metrics as { cpuUsage?: number; memoryUsage?: number } | null;
    if (metrics) {
      if (typeof metrics.cpuUsage === "number") {
        avgCpu += metrics.cpuUsage;
        metricsCount++;
      }
      if (typeof metrics.memoryUsage === "number") {
        avgMemory += metrics.memoryUsage;
      }
    }
  }

  return c.json({
    success: true,
    data: {
      jobs: Object.fromEntries(jobStats.map((j) => [j.status, j.count])),
      heartbeats: heartbeatCount[0]?.count || 0,
      avgCpuUsage: metricsCount > 0 ? avgCpu / metricsCount : null,
      avgMemoryUsage: metricsCount > 0 ? avgMemory / metricsCount : null,
      period: {
        hours,
        since: since.toISOString(),
      },
    },
  });
});
