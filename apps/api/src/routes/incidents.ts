import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  incidents,
  incidentUpdates,
  incidentDocuments,
  checkResults,
  statusPages,
  statusPageMonitors,
  eventSubscriptions,
  componentSubscriptions,
  monitors,
} from "@uni-status/database/schema";
import {
  createIncidentSchema,
  updateIncidentSchema,
  createIncidentUpdateSchema,
  createIncidentDocumentSchema,
  updateIncidentDocumentSchema,
} from "@uni-status/shared/validators";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { createAuditLog, createAuditLogWithChanges, getAuditUserId } from "../lib/audit";
import {
  queueEventSubscriptionNotification,
  queueComponentSubscriptionNotification,
} from "../lib/queues";
import { eq, and, desc, inArray, gte, lte, or, sql } from "drizzle-orm";

/**
 * Notifies event subscribers when an incident is updated.
 * Finds all status pages that show this incident and sends notifications.
 */
async function notifyEventSubscribers(
  incidentId: string,
  incidentTitle: string,
  incidentStatus: string,
  incidentMessage: string | null,
  affectedMonitors: string[],
  organizationId: string,
  updateMessage?: string
): Promise<void> {
  // Check if there are any subscribers for this incident
  const subscriberCount = await db.query.eventSubscriptions.findFirst({
    where: and(
      eq(eventSubscriptions.eventType, "incident"),
      eq(eventSubscriptions.eventId, incidentId),
      eq(eventSubscriptions.verified, true)
    ),
  });

  if (!subscriberCount) {
    return; // No subscribers, skip
  }

  // Find status pages that show this incident (via affected monitors)
  if (!affectedMonitors || affectedMonitors.length === 0) {
    return;
  }

  // Get status pages that have any of the affected monitors linked
  const linkedPages = await db
    .select({
      statusPageId: statusPageMonitors.statusPageId,
    })
    .from(statusPageMonitors)
    .where(inArray(statusPageMonitors.monitorId, affectedMonitors));

  if (linkedPages.length === 0) {
    return;
  }

  const pageIds = [...new Set(linkedPages.map((lp) => lp.statusPageId))];

  // Get status page details (just need first published one for the notification)
  const statusPage = await db.query.statusPages.findFirst({
    where: and(
      inArray(statusPages.id, pageIds),
      eq(statusPages.organizationId, organizationId),
      eq(statusPages.published, true)
    ),
  });

  if (!statusPage) {
    return; // No published status page found
  }

  // Queue notification
  await queueEventSubscriptionNotification({
    eventType: "incident",
    eventId: incidentId,
    eventTitle: incidentTitle,
    eventStatus: incidentStatus,
    eventDescription: incidentMessage ?? null,
    updateMessage,
    statusPageSlug: statusPage.slug,
    statusPageName: statusPage.name,
  });
}

/**
 * Notifies component subscribers when a new incident is created.
 * Finds all status pages with affected monitors and notifies subscribers.
 */
async function notifyComponentSubscribers(
  incidentId: string,
  incidentTitle: string,
  incidentStatus: string,
  incidentSeverity: string,
  incidentMessage: string | null,
  affectedMonitorIds: string[],
  organizationId: string
): Promise<void> {
  if (!affectedMonitorIds || affectedMonitorIds.length === 0) {
    return;
  }

  // Get monitor details for the affected monitors
  const affectedMonitorDetails = await db.query.monitors.findMany({
    where: inArray(monitors.id, affectedMonitorIds),
  });

  if (affectedMonitorDetails.length === 0) {
    return;
  }

  // Get status pages that have any of the affected monitors linked
  const linkedPages = await db
    .select({
      statusPageId: statusPageMonitors.statusPageId,
      monitorId: statusPageMonitors.monitorId,
      displayName: statusPageMonitors.displayName,
    })
    .from(statusPageMonitors)
    .where(inArray(statusPageMonitors.monitorId, affectedMonitorIds));

  if (linkedPages.length === 0) {
    return;
  }

  // Group by status page
  const pageMonitorMap = new Map<string, Array<{ id: string; name: string }>>();
  for (const link of linkedPages) {
    const monitorDetail = affectedMonitorDetails.find((m) => m.id === link.monitorId);
    if (!monitorDetail) continue;

    const monitors = pageMonitorMap.get(link.statusPageId) || [];
    monitors.push({
      id: link.monitorId,
      name: link.displayName || monitorDetail.name,
    });
    pageMonitorMap.set(link.statusPageId, monitors);
  }

  // Get status page details for all affected pages
  const pageIds = [...pageMonitorMap.keys()];
  const statusPageDetails = await db.query.statusPages.findMany({
    where: and(
      inArray(statusPages.id, pageIds),
      eq(statusPages.organizationId, organizationId),
      eq(statusPages.published, true)
    ),
  });

  // Queue notification for each status page
  for (const statusPage of statusPageDetails) {
    const affectedMonitors = pageMonitorMap.get(statusPage.id) || [];
    if (affectedMonitors.length === 0) continue;

    await queueComponentSubscriptionNotification({
      notificationType: "incident_created",
      statusPageId: statusPage.id,
      statusPageSlug: statusPage.slug,
      statusPageName: statusPage.name,
      affectedMonitors,
      eventType: "incident",
      eventId: incidentId,
      eventTitle: incidentTitle,
      eventStatus: incidentStatus,
      eventSeverity: incidentSeverity,
      eventDescription: incidentMessage ?? undefined,
    });
  }
}

/**
 * Links failed check results to an incident.
 * This retroactively associates failed checks from affected monitors
 * that occurred during the incident time window.
 */
async function linkCheckResultsToIncident(
  incidentId: string,
  affectedMonitors: string[],
  startedAt: Date,
  resolvedAt: Date | null
): Promise<number> {
  if (!affectedMonitors || affectedMonitors.length === 0) {
    return 0;
  }

  const endTime = resolvedAt || new Date();

  // Update check results that:
  // 1. Belong to affected monitors
  // 2. Have a failure status (failure, timeout, error)
  // 3. Occurred within the incident time window
  // 4. Don't already have an incident linked (to avoid overwriting)
  const result = await db
    .update(checkResults)
    .set({ incidentId })
    .where(
      and(
        inArray(checkResults.monitorId, affectedMonitors),
        or(
          eq(checkResults.status, "failure"),
          eq(checkResults.status, "timeout"),
          eq(checkResults.status, "error")
        ),
        gte(checkResults.createdAt, startedAt),
        lte(checkResults.createdAt, endTime),
        eq(checkResults.incidentId, null as any)
      )
    )
    .returning({ id: checkResults.id });

  return result.length;
}

export const incidentsRoutes = new OpenAPIHono();

// List incidents
incidentsRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);
  const status = c.req.query("status");

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Build where conditions
  const conditions = [eq(incidents.organizationId, organizationId)];
  if (status) {
    conditions.push(eq(incidents.status, status as any));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(incidents)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.incidents.findMany({
    where: and(...conditions),
    orderBy: [desc(incidents.startedAt)],
    limit,
    offset,
    with: {
      updates: {
        orderBy: [desc(incidentUpdates.createdAt)],
      },
    },
  });

  return c.json({
    success: true,
    data: result,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + result.length < total,
    },
  });
});

// Create incident
incidentsRoutes.post("/", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createIncidentSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  const [incident] = await db
    .insert(incidents)
    .values({
      id,
      organizationId,
      ...validated,
      createdBy: auth.user?.id || auth.apiKey!.id,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!incident) {
    return c.json({ success: false, error: "Failed to create incident" }, 500);
  }

  // Create initial update
  await db.insert(incidentUpdates).values({
    id: nanoid(),
    incidentId: id,
    status: validated.status || "investigating",
    message: validated.message || "We are investigating this issue.",
    createdBy: auth.user?.id || auth.apiKey!.id,
    createdAt: now,
  });

  // Retroactively link failed check results to this incident
  if (validated.affectedMonitors && validated.affectedMonitors.length > 0) {
    await linkCheckResultsToIncident(
      id,
      validated.affectedMonitors,
      now, // startedAt is now for new incidents
      null // not resolved yet
    );
  }

  // Publish incident created event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "incident:created",
    data: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "incident.create",
    resourceType: "incident",
    resourceId: incident.id,
    resourceName: incident.title,
    metadata: { after: { title: incident.title, severity: incident.severity, status: incident.status } },
  });

  // Notify component subscribers about the new incident
  if (validated.affectedMonitors && validated.affectedMonitors.length > 0) {
    await notifyComponentSubscribers(
      incident.id,
      incident.title,
      incident.status,
      incident.severity,
      incident.message,
      validated.affectedMonitors,
      organizationId
    );
  }

  return c.json(
    {
      success: true,
      data: incident,
    },
    201
  );
});

// Get incident by ID
incidentsRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, id),
      eq(incidents.organizationId, organizationId)
    ),
    with: {
      updates: {
        orderBy: [desc(incidentUpdates.createdAt)],
      },
    },
  });

  if (!incident) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: incident,
  });
});

// Update incident
incidentsRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateIncidentSchema.parse(body);

  const now = new Date();

  // Get existing incident for audit
  const existingIncident = await db.query.incidents.findFirst({
    where: and(eq(incidents.id, id), eq(incidents.organizationId, organizationId)),
  });

  if (!existingIncident) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Incident not found" },
      },
      404
    );
  }

  const [incident] = await db
    .update(incidents)
    .set({
      ...validated,
      updatedAt: now,
    })
    .where(
      and(eq(incidents.id, id), eq(incidents.organizationId, organizationId))
    )
    .returning();

  if (!incident) {
    return c.json({ success: false, error: "Incident not found" }, 404);
  }

  // If affectedMonitors was updated, retroactively link check results
  if (validated.affectedMonitors && validated.affectedMonitors.length > 0) {
    // Get newly added monitors (those not in the previous list)
    const previousMonitors = existingIncident.affectedMonitors || [];
    const newMonitors = validated.affectedMonitors.filter(
      (m: string) => !previousMonitors.includes(m)
    );

    if (newMonitors.length > 0) {
      await linkCheckResultsToIncident(
        id,
        newMonitors,
        existingIncident.startedAt,
        existingIncident.resolvedAt
      );
    }
  }

  // Publish incident updated event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "incident:updated",
    data: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
    },
    timestamp: now.toISOString(),
  });

  // Audit log with changes
  await createAuditLogWithChanges(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "incident.update",
    resourceType: "incident",
    resourceId: incident.id,
    resourceName: incident.title,
    before: { title: existingIncident.title, severity: existingIncident.severity, status: existingIncident.status },
    after: { title: incident.title, severity: incident.severity, status: incident.status },
  });

  return c.json({
    success: true,
    data: incident,
  });
});

// Add incident update
incidentsRoutes.post("/:id/updates", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Verify incident belongs to org
  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, id),
      eq(incidents.organizationId, organizationId)
    ),
  });

  if (!incident) {
    throw new Error("Not found");
  }

  const body = await c.req.json();
  const validated = createIncidentUpdateSchema.parse(body);

  const updateId = nanoid();
  const now = new Date();

  const [update] = await db
    .insert(incidentUpdates)
    .values({
      id: updateId,
      incidentId: id,
      ...validated,
      createdBy: auth.user?.id || auth.apiKey!.id,
      createdAt: now,
    })
    .returning();

  if (!update) {
    return c.json({ success: false, error: "Failed to add incident update" }, 500);
  }

  // Update incident status
  await db
    .update(incidents)
    .set({
      status: validated.status,
      resolvedAt: validated.status === "resolved" ? now : null,
      updatedAt: now,
    })
    .where(eq(incidents.id, id));

  // Publish incident update event
  const eventType = validated.status === "resolved" ? "incident:resolved" : "incident:updated";
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: eventType,
    data: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: validated.status,
      updateId: update.id,
      message: update.message,
    },
    timestamp: now.toISOString(),
  });

  // Notify event subscribers
  await notifyEventSubscribers(
    incident.id,
    incident.title,
    validated.status,
    incident.message,
    (incident.affectedMonitors || []) as string[],
    organizationId,
    validated.message
  );

  return c.json(
    {
      success: true,
      data: update,
    },
    201
  );
});

// Resolve incident
incidentsRoutes.post("/:id/resolve", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const now = new Date();

  const [incident] = await db
    .update(incidents)
    .set({
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(incidents.id, id), eq(incidents.organizationId, organizationId))
    )
    .returning();

  if (!incident) {
    throw new Error("Not found");
  }

  // Add resolution update
  await db.insert(incidentUpdates).values({
    id: nanoid(),
    incidentId: id,
    status: "resolved",
    message: "This incident has been resolved.",
    createdBy: auth.user?.id || auth.apiKey!.id,
    createdAt: now,
  });

  // Publish incident resolved event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "incident:resolved",
    data: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: "resolved",
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "incident.resolve",
    resourceType: "incident",
    resourceId: incident.id,
    resourceName: incident.title,
    metadata: { after: { status: "resolved" } },
  });

  // Notify event subscribers
  await notifyEventSubscribers(
    incident.id,
    incident.title,
    "resolved",
    incident.message,
    (incident.affectedMonitors || []) as string[],
    organizationId,
    "This incident has been resolved."
  );

  return c.json({
    success: true,
    data: incident,
  });
});

// ==========================================
// Incident Documents (RCA/Post-Mortems)
// ==========================================

// List documents for an incident
incidentsRoutes.get("/:id/documents", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify incident belongs to org
  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, id),
      eq(incidents.organizationId, organizationId)
    ),
  });

  if (!incident) {
    throw new Error("Not found");
  }

  const documents = await db.query.incidentDocuments.findMany({
    where: eq(incidentDocuments.incidentId, id),
    orderBy: [desc(incidentDocuments.createdAt)],
  });

  return c.json({
    success: true,
    data: documents,
  });
});

// Add document to incident
incidentsRoutes.post("/:id/documents", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Verify incident belongs to org
  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, id),
      eq(incidents.organizationId, organizationId)
    ),
  });

  if (!incident) {
    throw new Error("Not found");
  }

  const body = await c.req.json();
  const validated = createIncidentDocumentSchema.parse(body);

  const docId = nanoid();
  const now = new Date();

  const [document] = await db
    .insert(incidentDocuments)
    .values({
      id: docId,
      incidentId: id,
      title: validated.title,
      documentUrl: validated.documentUrl,
      documentType: validated.documentType || "postmortem",
      description: validated.description,
      addedBy: auth.user?.id || auth.apiKey!.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!document) {
    return c.json({ success: false, error: "Failed to add incident document" }, 500);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "incident.document.add",
    resourceType: "incident_document",
    resourceId: document.id,
    resourceName: document.title,
    metadata: {
      incidentId: id,
      incidentTitle: incident.title,
      documentType: document.documentType,
    },
  });

  return c.json(
    {
      success: true,
      data: document,
    },
    201
  );
});

// Update document
incidentsRoutes.patch("/:id/documents/:docId", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id, docId } = c.req.param();

  // Verify incident belongs to org
  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, id),
      eq(incidents.organizationId, organizationId)
    ),
  });

  if (!incident) {
    throw new Error("Incident not found");
  }

  // Verify document exists and belongs to this incident
  const existingDoc = await db.query.incidentDocuments.findFirst({
    where: and(
      eq(incidentDocuments.id, docId),
      eq(incidentDocuments.incidentId, id)
    ),
  });

  if (!existingDoc) {
    throw new Error("Document not found");
  }

  const body = await c.req.json();
  const validated = updateIncidentDocumentSchema.parse(body);

  const now = new Date();

  const [document] = await db
    .update(incidentDocuments)
    .set({
      ...validated,
      updatedAt: now,
    })
    .where(
      and(
        eq(incidentDocuments.id, docId),
        eq(incidentDocuments.incidentId, id)
      )
    )
    .returning();

  if (!document) {
    return c.json({ success: false, error: "Failed to update incident document" }, 500);
  }

  // Audit log
  await createAuditLogWithChanges(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "incident.document.update",
    resourceType: "incident_document",
    resourceId: document.id,
    resourceName: document.title,
    before: { title: existingDoc.title, documentUrl: existingDoc.documentUrl },
    after: { title: document.title, documentUrl: document.documentUrl },
  });

  return c.json({
    success: true,
    data: document,
  });
});

// Delete document
incidentsRoutes.delete("/:id/documents/:docId", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id, docId } = c.req.param();

  // Verify incident belongs to org
  const incident = await db.query.incidents.findFirst({
    where: and(
      eq(incidents.id, id),
      eq(incidents.organizationId, organizationId)
    ),
  });

  if (!incident) {
    throw new Error("Incident not found");
  }

  // Verify document exists and belongs to this incident
  const existingDoc = await db.query.incidentDocuments.findFirst({
    where: and(
      eq(incidentDocuments.id, docId),
      eq(incidentDocuments.incidentId, id)
    ),
  });

  if (!existingDoc) {
    throw new Error("Document not found");
  }

  await db
    .delete(incidentDocuments)
    .where(
      and(
        eq(incidentDocuments.id, docId),
        eq(incidentDocuments.incidentId, id)
      )
    );

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "incident.document.delete",
    resourceType: "incident_document",
    resourceId: docId,
    resourceName: existingDoc.title,
    metadata: {
      incidentId: id,
      incidentTitle: incident.title,
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});
