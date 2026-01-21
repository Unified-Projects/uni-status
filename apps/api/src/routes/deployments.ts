import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "@uni-status/database";
import {
  deploymentWebhooks,
  deploymentEvents,
  deploymentIncidents,
  incidents,
  monitors,
} from "@uni-status/database/schema";
import {
  createDeploymentWebhookSchema,
  createDeploymentEventSchema,
  linkDeploymentIncidentSchema,
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
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";

export const deploymentsRoutes = new OpenAPIHono();

// Apply standard auth to all management endpoints; skip external webhook receiver
deploymentsRoutes.use("*", async (c, next) => {
  const path = c.req.path;
  if (path.includes("/webhook/")) {
    return next();
  }
  return authMiddleware(c, next);
});

// Helper to generate HMAC signature
function generateHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Helper to verify HMAC signature
function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateHmacSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

deploymentsRoutes.get("/webhooks", async (c) => {
  const organizationId = await requireOrganization(c);

  const webhooks = await db.query.deploymentWebhooks.findMany({
    where: eq(deploymentWebhooks.organizationId, organizationId),
    orderBy: [desc(deploymentWebhooks.createdAt)],
  });

  // Don't expose the actual secret, just indicate if it exists
  const safeWebhooks = webhooks.map((w) => ({
    ...w,
    secret: w.secret ? "********" : null,
    hasSecret: !!w.secret,
  }));

  return c.json({
    success: true,
    data: safeWebhooks,
  });
});

deploymentsRoutes.post("/webhooks", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createDeploymentWebhookSchema.parse(body);

  const id = nanoid();
  const secret = nanoid(32); // Generate a random secret for HMAC verification
  const now = new Date();

  const [webhook] = await db
    .insert(deploymentWebhooks)
    .values({
      id,
      organizationId,
      name: validated.name,
      description: validated.description,
      secret,
      active: validated.active ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!webhook) {
    throw new Error("Failed to create deployment webhook");
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "deployment_webhook.create",
    resourceType: "deployment_webhook",
    resourceId: webhook.id,
    resourceName: webhook.name,
  });

  // Return the secret only on creation - it won't be shown again
  return c.json(
    {
      success: true,
      data: {
        ...webhook,
        secret, // Only shown once on creation
        webhookUrl: `/api/v1/deployments/webhook/${id}/events`,
      },
    },
    201
  );
});

deploymentsRoutes.get("/webhooks/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const webhook = await db.query.deploymentWebhooks.findFirst({
    where: and(
      eq(deploymentWebhooks.id, id),
      eq(deploymentWebhooks.organizationId, organizationId)
    ),
  });

  if (!webhook) {
    return c.json(
      {
        success: false,
        error: "Webhook not found",
      },
      404
    );
  }

  return c.json({
    success: true,
    data: {
      ...webhook,
      secret: "********",
      hasSecret: true,
      webhookUrl: `/api/v1/deployments/webhook/${id}/events`,
    },
  });
});

deploymentsRoutes.post("/webhooks/:id/regenerate-secret", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existingWebhook = await db.query.deploymentWebhooks.findFirst({
    where: and(
      eq(deploymentWebhooks.id, id),
      eq(deploymentWebhooks.organizationId, organizationId)
    ),
  });

  if (!existingWebhook) {
    return c.json(
      {
        success: false,
        error: "Webhook not found",
      },
      404
    );
  }

  const newSecret = nanoid(32);
  const now = new Date();

  const [webhook] = await db
    .update(deploymentWebhooks)
    .set({
      secret: newSecret,
      updatedAt: now,
    })
    .where(
      and(
        eq(deploymentWebhooks.id, id),
        eq(deploymentWebhooks.organizationId, organizationId)
      )
    )
    .returning();

  if (!webhook) {
    throw new Error("Failed to regenerate deployment webhook secret");
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "deployment_webhook.regenerate_secret",
    resourceType: "deployment_webhook",
    resourceId: webhook.id,
    resourceName: webhook.name,
  });

  return c.json({
    success: true,
    data: {
      ...webhook,
      secret: newSecret, // Shown once on regeneration
    },
  });
});

deploymentsRoutes.delete("/webhooks/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existingWebhook = await db.query.deploymentWebhooks.findFirst({
    where: and(
      eq(deploymentWebhooks.id, id),
      eq(deploymentWebhooks.organizationId, organizationId)
    ),
  });

  if (!existingWebhook) {
    return c.json(
      {
        success: false,
        error: "Webhook not found",
      },
      404
    );
  }

  await db
    .delete(deploymentWebhooks)
    .where(
      and(
        eq(deploymentWebhooks.id, id),
        eq(deploymentWebhooks.organizationId, organizationId)
      )
    );

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "deployment_webhook.delete",
    resourceType: "deployment_webhook",
    resourceId: id,
    resourceName: existingWebhook.name,
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Receive deployment event via webhook (external, signature verified)
deploymentsRoutes.post("/webhook/:webhookId/events", async (c) => {
  const { webhookId } = c.req.param();

  // Get the webhook configuration
  const webhook = await db.query.deploymentWebhooks.findFirst({
    where: and(
      eq(deploymentWebhooks.id, webhookId),
      eq(deploymentWebhooks.active, true)
    ),
  });

  if (!webhook) {
    return c.json(
      {
        success: false,
        error: "Webhook not found or inactive",
      },
      404
    );
  }

  // Verify signature if provided
  const signature = c.req.header("X-Signature-256") || c.req.header("X-Hub-Signature-256");
  const rawBody = await c.req.text();

  if (signature) {
    try {
      // Remove "sha256=" prefix if present (GitHub style)
      const cleanSignature = signature.replace("sha256=", "");
      if (!verifyHmacSignature(rawBody, cleanSignature, webhook.secret)) {
        return c.json(
          {
            success: false,
            error: "Invalid signature",
          },
          401
        );
      }
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Invalid signature",
        },
        401
      );
    }
  }

  // Parse the body
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json(
      {
        success: false,
        error: "Invalid JSON body",
      },
      400
    );
  }

  const validated = createDeploymentEventSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  // Prevent deployments during active major/critical incidents unless explicitly allowed
  if (!validated.allowDuringIncident && validated.environment === "production") {
    const activeIncident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.organizationId, webhook.organizationId),
        inArray(incidents.status, ["investigating", "identified", "monitoring"] as any),
        inArray(incidents.severity, ["major", "critical"] as any)
      ),
      columns: { id: true, title: true, severity: true },
    });

    if (activeIncident) {
      return c.json(
        {
          success: false,
          error: `Change freeze active due to incident ${activeIncident.title} (${activeIncident.severity}). Set allowDuringIncident to true to override.`,
        },
        403
      );
    }
  }

  // Create the deployment event
  const [event] = await db
    .insert(deploymentEvents)
    .values({
      id,
      organizationId: webhook.organizationId,
      webhookId: webhook.id,
      externalId: validated.externalId,
      service: validated.service,
      version: validated.version,
      environment: validated.environment || "production",
      status: validated.status,
      deployedAt: new Date(validated.deployedAt),
      deployedBy: validated.deployedBy,
      commitSha: validated.commitSha,
      commitMessage: validated.commitMessage,
      branch: validated.branch,
      affectedMonitors: validated.affectedMonitors || [],
      metadata: validated.metadata || {},
      createdAt: now,
    })
    .returning();

  if (!event) {
    return c.json({ success: false, error: "Failed to create deployment event" }, 500);
  }

  // Publish deployment event for SSE
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${webhook.organizationId}`, {
    type: "deployment:received",
    data: {
      id: event.id,
      service: event.service,
      version: event.version,
      status: event.status,
      environment: event.environment,
    },
    timestamp: now.toISOString(),
  });

  // Queue auto-correlation job if deployment completed/failed
  if (event.status === "completed" || event.status === "failed") {
    const correlationQueue = getQueue(QUEUE_NAMES.DEPLOYMENT_CORRELATE);
    await correlationQueue.add(
      "correlate",
      {
        deploymentId: event.id,
        organizationId: webhook.organizationId,
        service: event.service,
        deployedAt: event.deployedAt,
        affectedMonitors: event.affectedMonitors,
      },
      {
        delay: 5 * 60 * 1000, // Wait 5 minutes for incidents to potentially occur
      }
    );
  }

  return c.json(
    {
      success: true,
      data: event,
    },
    201
  );
});

deploymentsRoutes.get("/events", async (c) => {
  const organizationId = await requireOrganization(c);

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);
  const service = c.req.query("service");
  const environment = c.req.query("environment");
  const status = c.req.query("status");

  // Build where conditions for count
  const conditions = [eq(deploymentEvents.organizationId, organizationId)];
  if (service) {
    conditions.push(eq(deploymentEvents.service, service));
  }
  if (environment) {
    const environments = ["production", "staging", "development", "testing"] as const;
    if (environments.includes(environment as (typeof environments)[number])) {
      conditions.push(eq(deploymentEvents.environment, environment as (typeof environments)[number]));
    }
  }
  if (status) {
    conditions.push(eq(deploymentEvents.status, status as any));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(deploymentEvents)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);

  const events = await db.query.deploymentEvents.findMany({
    where: and(...conditions),
    orderBy: [desc(deploymentEvents.deployedAt)],
    limit,
    offset,
    with: {
      webhook: {
        columns: {
          id: true,
          name: true,
        },
      },
      incidentLinks: {
        with: {
          incident: {
            columns: {
              id: true,
              title: true,
              severity: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return c.json({
    success: true,
    data: events,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + events.length < total,
    },
  });
});

deploymentsRoutes.get("/events/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const event = await db.query.deploymentEvents.findFirst({
    where: and(
      eq(deploymentEvents.id, id),
      eq(deploymentEvents.organizationId, organizationId)
    ),
    with: {
      webhook: {
        columns: {
          id: true,
          name: true,
        },
      },
      incidentLinks: {
        with: {
          incident: true,
        },
      },
    },
  });

  if (!event) {
    return c.json(
      {
        success: false,
        error: "Deployment event not found",
      },
      404
    );
  }

  return c.json({
    success: true,
    data: event,
  });
});

deploymentsRoutes.post("/events/:id/rollback", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const event = await db.query.deploymentEvents.findFirst({
    where: and(
      eq(deploymentEvents.id, id),
      eq(deploymentEvents.organizationId, organizationId)
    ),
  });

  if (!event) {
    return c.json({ success: false, error: "Deployment event not found" }, 404);
  }

  const [updated] = await db
    .update(deploymentEvents)
    .set({ status: "rolled_back" })
    .where(and(eq(deploymentEvents.id, id), eq(deploymentEvents.organizationId, organizationId)))
    .returning();

  if (!updated) {
    return c.json({ success: false, error: "Failed to rollback deployment" }, 500);
  }

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "deployment:rolled_back",
    data: { id: updated.id, service: updated.service, version: updated.version },
    timestamp: new Date().toISOString(),
  });

  return c.json({ success: true, data: updated });
});

deploymentsRoutes.post("/events", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createDeploymentEventSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  // If affected monitors specified, verify they belong to the org
  if (validated.affectedMonitors && validated.affectedMonitors.length > 0) {
    const validMonitors = await db.query.monitors.findMany({
      where: and(
        eq(monitors.organizationId, organizationId),
        inArray(monitors.id, validated.affectedMonitors)
      ),
      columns: { id: true },
    });

    const validIds = validMonitors.map((m) => m.id);
    const invalidIds = validated.affectedMonitors.filter((id) => !validIds.includes(id));

    if (invalidIds.length > 0) {
      return c.json(
        {
          success: false,
          error: `Invalid monitor IDs: ${invalidIds.join(", ")}`,
        },
        400
      );
    }
  }

  const [event] = await db
    .insert(deploymentEvents)
    .values({
      id,
      organizationId,
      externalId: validated.externalId,
      service: validated.service,
      version: validated.version,
      environment: validated.environment || "production",
      status: validated.status,
      deployedAt: new Date(validated.deployedAt),
      deployedBy: validated.deployedBy,
      commitSha: validated.commitSha,
      commitMessage: validated.commitMessage,
      branch: validated.branch,
      affectedMonitors: validated.affectedMonitors || [],
      metadata: validated.metadata || {},
      createdAt: now,
    })
    .returning();

  if (!event) {
    return c.json({ success: false, error: "Failed to create deployment event" }, 500);
  }

  // Publish deployment event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "deployment:created",
    data: {
      id: event.id,
      service: event.service,
      version: event.version,
      status: event.status,
      environment: event.environment,
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "deployment.create",
    resourceType: "deployment_event",
    resourceId: event.id,
    resourceName: `${event.service}@${event.version || "unknown"}`,
    metadata: {
      service: event.service,
      version: event.version,
      environment: event.environment,
      status: event.status,
    },
  });

  // Queue auto-correlation if completed/failed
  if (event.status === "completed" || event.status === "failed") {
    const correlationQueue = getQueue(QUEUE_NAMES.DEPLOYMENT_CORRELATE);
    await correlationQueue.add(
      "correlate",
      {
        deploymentId: event.id,
        organizationId,
        service: event.service,
        deployedAt: event.deployedAt,
        affectedMonitors: event.affectedMonitors,
      },
      {
        delay: 5 * 60 * 1000, // Wait 5 minutes for incidents to potentially occur
      }
    );
  }

  return c.json(
    {
      success: true,
      data: event,
    },
    201
  );
});

deploymentsRoutes.post("/events/:id/link-incident", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const { incidentId, notes } = linkDeploymentIncidentSchema.parse({
    ...body,
    deploymentId: id,
  });

  // Verify deployment belongs to organization
  const deployment = await db.query.deploymentEvents.findFirst({
    where: and(
      eq(deploymentEvents.id, id),
      eq(deploymentEvents.organizationId, organizationId)
    ),
  });

  if (!deployment) {
    return c.json(
      {
        success: false,
        error: "Deployment not found",
      },
      404
    );
  }

  // Verify incident belongs to organization
  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, incidentId),
      eq(incidents.organizationId, organizationId)
    ),
  });

  if (!incident) {
    return c.json(
      {
        success: false,
        error: "Incident not found",
      },
      404
    );
  }

  // Check if link already exists
  const existingLink = await db.query.deploymentIncidents.findFirst({
    where: and(
      eq(deploymentIncidents.deploymentId, id),
      eq(deploymentIncidents.incidentId, incidentId)
    ),
  });

  if (existingLink) {
    return c.json(
      {
        success: false,
        error: "Link already exists",
      },
      409
    );
  }

  const linkId = nanoid();
  const now = new Date();

  const [link] = await db
    .insert(deploymentIncidents)
    .values({
      id: linkId,
      deploymentId: id,
      incidentId,
      correlationType: "manual",
      confidence: null, // Manual links don't have confidence scores
      notes,
      linkedBy: getAuditUserId(c),
      linkedAt: now,
    })
    .returning();

  // Publish event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "deployment:linked",
    data: {
      deploymentId: id,
      incidentId,
      correlationType: "manual",
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "deployment.link_incident",
    resourceType: "deployment_incident",
    resourceId: linkId,
    resourceName: `${deployment.service} -> ${incident.title}`,
    metadata: {
      deploymentId: id,
      incidentId,
      notes,
    },
  });

  return c.json(
    {
      success: true,
      data: link,
    },
    201
  );
});

deploymentsRoutes.delete("/events/:id/link-incident/:incidentId", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id, incidentId } = c.req.param();

  // Verify deployment belongs to organization
  const deployment = await db.query.deploymentEvents.findFirst({
    where: and(
      eq(deploymentEvents.id, id),
      eq(deploymentEvents.organizationId, organizationId)
    ),
  });

  if (!deployment) {
    return c.json(
      {
        success: false,
        error: "Deployment not found",
      },
      404
    );
  }

  const existingLink = await db.query.deploymentIncidents.findFirst({
    where: and(
      eq(deploymentIncidents.deploymentId, id),
      eq(deploymentIncidents.incidentId, incidentId)
    ),
  });

  if (!existingLink) {
    return c.json(
      {
        success: false,
        error: "Link not found",
      },
      404
    );
  }

  await db
    .delete(deploymentIncidents)
    .where(
      and(
        eq(deploymentIncidents.deploymentId, id),
        eq(deploymentIncidents.incidentId, incidentId)
      )
    );

  // Publish event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "deployment:unlinked",
    data: {
      deploymentId: id,
      incidentId,
    },
    timestamp: new Date().toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "deployment.unlink_incident",
    resourceType: "deployment_incident",
    resourceId: existingLink.id,
    metadata: {
      deploymentId: id,
      incidentId,
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Get deployment timeline (deployments near incidents)
deploymentsRoutes.get("/timeline", async (c) => {
  const organizationId = await requireOrganization(c);
  const hours = parseInt(c.req.query("hours") || "24");
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get recent deployments
  const recentDeployments = await db.query.deploymentEvents.findMany({
    where: and(
      eq(deploymentEvents.organizationId, organizationId),
      gte(deploymentEvents.deployedAt, since)
    ),
    orderBy: [desc(deploymentEvents.deployedAt)],
    with: {
      incidentLinks: {
        with: {
          incident: {
            columns: {
              id: true,
              title: true,
              severity: true,
              status: true,
              startedAt: true,
            },
          },
        },
      },
    },
  });

  // Get recent incidents (that may not be linked yet)
  const recentIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, organizationId),
      gte(incidents.startedAt, since)
    ),
    orderBy: [desc(incidents.startedAt)],
    columns: {
      id: true,
      title: true,
      severity: true,
      status: true,
      startedAt: true,
      resolvedAt: true,
    },
  });

  // Build timeline combining deployments and incidents
  type TimelineEvent = {
    type: "deployment" | "incident";
    timestamp: Date;
    data: unknown;
  };

  const timeline: TimelineEvent[] = [
    ...recentDeployments.map((d) => ({
      type: "deployment" as const,
      timestamp: d.deployedAt,
      data: {
        id: d.id,
        service: d.service,
        version: d.version,
        status: d.status,
        environment: d.environment,
        linkedIncidents: d.incidentLinks.map((l) => l.incident),
      },
    })),
    ...recentIncidents.map((i) => ({
      type: "incident" as const,
      timestamp: i.startedAt,
      data: i,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return c.json({
    success: true,
    data: timeline,
    meta: {
      hours,
      since: since.toISOString(),
    },
  });
});

// Deployments related to a specific incident (linked or time-adjacent)
deploymentsRoutes.get("/incident/:incidentId", async (c) => {
  const organizationId = await requireOrganization(c);
  const { incidentId } = c.req.param();
  const windowHours = parseInt(c.req.query("hours") || "24");

  const incident = await db.query.incidents.findFirst({
    where: and(eq(incidents.id, incidentId), eq(incidents.organizationId, organizationId)),
  });

  if (!incident) {
    return c.json({ success: false, error: "Incident not found" }, 404);
  }

  const start = incident.startedAt;
  const end = new Date(
    (incident.resolvedAt || new Date()).getTime() + windowHours * 60 * 60 * 1000
  );

  const deployments = await db.query.deploymentEvents.findMany({
    where: and(
      eq(deploymentEvents.organizationId, organizationId),
      gte(deploymentEvents.deployedAt, new Date(start.getTime() - windowHours * 60 * 60 * 1000)),
      lte(deploymentEvents.deployedAt, end)
    ),
    orderBy: [desc(deploymentEvents.deployedAt)],
    with: {
      incidentLinks: {
        where: eq(deploymentIncidents.incidentId, incidentId),
      },
    },
  });

  return c.json({
    success: true,
    data: deployments,
    meta: {
      windowHours,
    },
  });
});

deploymentsRoutes.get("/stats", async (c) => {
  const organizationId = await requireOrganization(c);
  const days = parseInt(c.req.query("days") || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Count deployments by status
  const statusCounts = await db
    .select({
      status: deploymentEvents.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(deploymentEvents)
    .where(
      and(
        eq(deploymentEvents.organizationId, organizationId),
        gte(deploymentEvents.deployedAt, since)
      )
    )
    .groupBy(deploymentEvents.status);

  // Count deployments by environment
  const envCounts = await db
    .select({
      environment: deploymentEvents.environment,
      count: sql<number>`COUNT(*)`,
    })
    .from(deploymentEvents)
    .where(
      and(
        eq(deploymentEvents.organizationId, organizationId),
        gte(deploymentEvents.deployedAt, since)
      )
    )
    .groupBy(deploymentEvents.environment);

  // Count deployments by service
  const serviceCounts = await db
    .select({
      service: deploymentEvents.service,
      count: sql<number>`COUNT(*)`,
    })
    .from(deploymentEvents)
    .where(
      and(
        eq(deploymentEvents.organizationId, organizationId),
        gte(deploymentEvents.deployedAt, since)
      )
    )
    .groupBy(deploymentEvents.service)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  // Count correlations
  const correlationStats = await db
    .select({
      correlationType: deploymentIncidents.correlationType,
      count: sql<number>`COUNT(*)`,
    })
    .from(deploymentIncidents)
    .innerJoin(
      deploymentEvents,
      eq(deploymentIncidents.deploymentId, deploymentEvents.id)
    )
    .where(
      and(
        eq(deploymentEvents.organizationId, organizationId),
        gte(deploymentEvents.deployedAt, since)
      )
    )
    .groupBy(deploymentIncidents.correlationType);

  return c.json({
    success: true,
    data: {
      byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
      byEnvironment: Object.fromEntries(envCounts.map((e) => [e.environment, e.count])),
      topServices: serviceCounts,
      correlations: Object.fromEntries(correlationStats.map((c) => [c.correlationType, c.count])),
      period: {
        days,
        since: since.toISOString(),
      },
    },
  });
});
