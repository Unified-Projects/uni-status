import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  incidents,
  incidentUpdates,
  maintenanceWindows,
  monitors,
  eventSubscriptions,
  user,
} from "@uni-status/database/schema";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { createAuditLog, getAuditUserId } from "../lib/audit";
import { eq, and, desc, or, gte, lte, ilike, inArray, sql, count } from "drizzle-orm";
import type { UnifiedEvent, EventUpdate, EventType } from "@uni-status/shared";

export const eventsRoutes = new OpenAPIHono();

// Helper to determine maintenance window status
function getMaintenanceStatus(startsAt: Date, endsAt: Date): "scheduled" | "active" | "completed" {
  const now = new Date();
  if (now < startsAt) return "scheduled";
  if (now > endsAt) return "completed";
  return "active";
}

// Transform incident to unified event
function incidentToEvent(
  incident: typeof incidents.$inferSelect & {
    updates?: Array<typeof incidentUpdates.$inferSelect & { createdByUser?: { id: string; name: string } | null }>;
    createdByUser?: { id: string; name: string } | null;
  },
  monitorDetails?: Array<{ id: string; name: string }>
): UnifiedEvent {
  return {
    id: incident.id,
    type: "incident",
    title: incident.title,
    description: incident.message,
    status: incident.status,
    severity: incident.severity,
    affectedMonitors: (incident.affectedMonitors as string[]) || [],
    affectedMonitorDetails: monitorDetails,
    startedAt: incident.startedAt.toISOString(),
    endedAt: incident.resolvedAt?.toISOString() || null,
    updates: (incident.updates || []).map((u) => ({
      id: u.id,
      status: u.status,
      message: u.message,
      createdAt: u.createdAt.toISOString(),
      createdBy: u.createdByUser || undefined,
    })),
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    createdBy: incident.createdByUser || undefined,
  };
}

// Transform maintenance window to unified event
function maintenanceToEvent(
  maintenance: typeof maintenanceWindows.$inferSelect & {
    createdByUser?: { id: string; name: string } | null;
  },
  monitorDetails?: Array<{ id: string; name: string }>
): UnifiedEvent {
  const status = getMaintenanceStatus(maintenance.startsAt, maintenance.endsAt);
  return {
    id: maintenance.id,
    type: "maintenance",
    title: maintenance.name,
    description: maintenance.description,
    status,
    severity: "maintenance",
    affectedMonitors: (maintenance.affectedMonitors as string[]) || [],
    affectedMonitorDetails: monitorDetails,
    startedAt: maintenance.startsAt.toISOString(),
    endedAt: maintenance.endsAt.toISOString(),
    timezone: maintenance.timezone,
    updates: [], // Maintenance windows don't have updates
    createdAt: maintenance.createdAt.toISOString(),
    updatedAt: maintenance.updatedAt.toISOString(),
    createdBy: maintenance.createdByUser || undefined,
  };
}

// Get monitor details for a list of IDs
async function getMonitorDetails(
  monitorIds: string[],
  organizationId: string
): Promise<Map<string, { id: string; name: string }>> {
  if (monitorIds.length === 0) return new Map();

  const monitorData = await db
    .select({ id: monitors.id, name: monitors.name })
    .from(monitors)
    .where(
      and(
        inArray(monitors.id, monitorIds),
        eq(monitors.organizationId, organizationId)
      )
    );

  return new Map(monitorData.map((m) => [m.id, m]));
}

// List unified events (incidents + maintenance)
eventsRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  // Parse query parameters
  const types = c.req.query("types")?.split(",") as EventType[] | undefined;
  const status = c.req.query("status")?.split(",");
  const severity = c.req.query("severity")?.split(",");
  const monitorIds = c.req.query("monitors")?.split(",");
  const search = c.req.query("search");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  // Determine what to include based on types and severity filters
  // If severity=maintenance only is passed, don't include incidents
  const onlyMaintenanceSeverity = severity && severity.length === 1 && severity[0] === "maintenance";
  const includeIncidents = (!types || types.includes("incident")) && !onlyMaintenanceSeverity;
  const includeMaintenance = !types || types.includes("maintenance");

  let allEvents: UnifiedEvent[] = [];
  let totalIncidents = 0;
  let totalMaintenance = 0;

  // Build incident status filter
  const incidentStatuses = status?.filter((s) =>
    ["investigating", "identified", "monitoring", "resolved"].includes(s)
  );

  // Build maintenance status filter (computed)
  const maintenanceStatuses = status?.filter((s) =>
    ["scheduled", "active", "completed"].includes(s)
  );

  // Fetch incidents
  if (includeIncidents) {
    let incidentWhere = eq(incidents.organizationId, organizationId);

    // Status filter
    if (incidentStatuses && incidentStatuses.length > 0) {
      incidentWhere = and(
        incidentWhere,
        inArray(incidents.status, incidentStatuses as any)
      )!;
    }

    // Severity filter
    if (severity && severity.length > 0) {
      const incidentSeverities = severity.filter((s) => s !== "maintenance");
      if (incidentSeverities.length > 0) {
        incidentWhere = and(
          incidentWhere,
          inArray(incidents.severity, incidentSeverities as any)
        )!;
      }
    }

    // Search filter
    if (search) {
      incidentWhere = and(
        incidentWhere,
        or(
          ilike(incidents.title, `%${search}%`),
          ilike(incidents.message, `%${search}%`)
        )
      )!;
    }

    // Date filters
    if (startDate) {
      incidentWhere = and(
        incidentWhere,
        gte(incidents.startedAt, new Date(startDate))
      )!;
    }
    if (endDate) {
      incidentWhere = and(
        incidentWhere,
        lte(incidents.startedAt, new Date(endDate))
      )!;
    }

    // Monitor filter
    if (monitorIds && monitorIds.length > 0) {
      // Filter incidents that have any of the specified monitors
      incidentWhere = and(
        incidentWhere,
        sql`${incidents.affectedMonitors} ?| array[${sql.raw(monitorIds.map((id) => `'${id}'`).join(","))}]`
      )!;
    }

    const incidentResults = await db.query.incidents.findMany({
      where: incidentWhere,
      orderBy: [desc(incidents.startedAt)],
      with: {
        updates: {
          orderBy: [desc(incidentUpdates.createdAt)],
          with: {
            createdByUser: {
              columns: { id: true, name: true },
            },
          },
        },
        createdByUser: {
          columns: { id: true, name: true },
        },
      },
    });

    totalIncidents = incidentResults.length;
    allEvents = allEvents.concat(incidentResults.map((i) => incidentToEvent(i)));
  }

  // Fetch maintenance windows
  if (includeMaintenance && (!severity || severity.includes("maintenance"))) {
    let maintenanceWhere = eq(maintenanceWindows.organizationId, organizationId);

    // Search filter
    if (search) {
      maintenanceWhere = and(
        maintenanceWhere,
        or(
          ilike(maintenanceWindows.name, `%${search}%`),
          ilike(maintenanceWindows.description, `%${search}%`)
        )
      )!;
    }

    // Date filters
    if (startDate) {
      maintenanceWhere = and(
        maintenanceWhere,
        gte(maintenanceWindows.startsAt, new Date(startDate))
      )!;
    }
    if (endDate) {
      maintenanceWhere = and(
        maintenanceWhere,
        lte(maintenanceWindows.startsAt, new Date(endDate))
      )!;
    }

    // Monitor filter
    if (monitorIds && monitorIds.length > 0) {
      maintenanceWhere = and(
        maintenanceWhere,
        sql`${maintenanceWindows.affectedMonitors} ?| array[${sql.raw(monitorIds.map((id) => `'${id}'`).join(","))}]`
      )!;
    }

    const maintenanceResults = await db.query.maintenanceWindows.findMany({
      where: maintenanceWhere,
      orderBy: [desc(maintenanceWindows.startsAt)],
      with: {
        createdByUser: {
          columns: { id: true, name: true },
        },
      },
    });

    // Filter by computed status if needed
    let filteredMaintenance = maintenanceResults;
    if (maintenanceStatuses && maintenanceStatuses.length > 0) {
      filteredMaintenance = maintenanceResults.filter((m) =>
        maintenanceStatuses.includes(getMaintenanceStatus(m.startsAt, m.endsAt))
      );
    }

    totalMaintenance = filteredMaintenance.length;
    allEvents = allEvents.concat(filteredMaintenance.map((m) => maintenanceToEvent(m)));
  }

  // Collect all monitor IDs for details
  const allMonitorIds = new Set<string>();
  for (const event of allEvents) {
    for (const monitorId of event.affectedMonitors) {
      allMonitorIds.add(monitorId);
    }
  }

  // Fetch monitor details
  const monitorDetailsMap = await getMonitorDetails(
    Array.from(allMonitorIds),
    organizationId
  );

  // Attach monitor details to events
  for (const event of allEvents) {
    event.affectedMonitorDetails = event.affectedMonitors
      .map((id) => monitorDetailsMap.get(id))
      .filter((m): m is { id: string; name: string } => m !== undefined);
  }

  // Sort all events by start date (newest first)
  allEvents.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  // Apply pagination
  const total = allEvents.length;
  const paginatedEvents = allEvents.slice(offset, offset + limit);

  return c.json({
    success: true,
    data: {
      events: paginatedEvents,
      total,
      hasMore: offset + limit < total,
      counts: {
        incidents: totalIncidents,
        maintenance: totalMaintenance,
      },
    },
  });
});

// Get single event by type and ID
eventsRoutes.get("/:type/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { type, id } = c.req.param();
  const auth = c.get("auth");

  if (type === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.id, id),
        eq(incidents.organizationId, organizationId)
      ),
      with: {
        updates: {
          orderBy: [desc(incidentUpdates.createdAt)],
          with: {
            createdByUser: {
              columns: { id: true, name: true },
            },
          },
        },
        createdByUser: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!incident) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    // Get monitor details
    const monitorDetailsMap = await getMonitorDetails(
      (incident.affectedMonitors as string[]) || [],
      organizationId
    );

    const event = incidentToEvent(incident);
    event.affectedMonitorDetails = event.affectedMonitors
      .map((monitorId) => monitorDetailsMap.get(monitorId))
      .filter((m): m is { id: string; name: string } => m !== undefined);

    // Check subscription status for authenticated user
    if (auth?.user?.id) {
      const subscription = await db.query.eventSubscriptions.findFirst({
        where: and(
          eq(eventSubscriptions.eventType, "incident"),
          eq(eventSubscriptions.eventId, id),
          eq(eventSubscriptions.userId, auth.user.id)
        ),
      });
      event.isSubscribed = !!subscription;
    }

    // Get subscriber count
    const [subCount] = await db
      .select({ count: count() })
      .from(eventSubscriptions)
      .where(
        and(
          eq(eventSubscriptions.eventType, "incident"),
          eq(eventSubscriptions.eventId, id),
          eq(eventSubscriptions.verified, true)
        )
      );
    event.subscriberCount = subCount?.count || 0;

    return c.json({ success: true, data: event });
  } else if (type === "maintenance") {
    const maintenance = await db.query.maintenanceWindows.findFirst({
      where: and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId)
      ),
      with: {
        createdByUser: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!maintenance) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    // Get monitor details
    const monitorDetailsMap = await getMonitorDetails(
      (maintenance.affectedMonitors as string[]) || [],
      organizationId
    );

    const event = maintenanceToEvent(maintenance);
    event.affectedMonitorDetails = event.affectedMonitors
      .map((monitorId) => monitorDetailsMap.get(monitorId))
      .filter((m): m is { id: string; name: string } => m !== undefined);

    // Check subscription status for authenticated user
    if (auth?.user?.id) {
      const subscription = await db.query.eventSubscriptions.findFirst({
        where: and(
          eq(eventSubscriptions.eventType, "maintenance"),
          eq(eventSubscriptions.eventId, id),
          eq(eventSubscriptions.userId, auth.user.id)
        ),
      });
      event.isSubscribed = !!subscription;
    }

    // Get subscriber count
    const [subCount] = await db
      .select({ count: count() })
      .from(eventSubscriptions)
      .where(
        and(
          eq(eventSubscriptions.eventType, "maintenance"),
          eq(eventSubscriptions.eventId, id),
          eq(eventSubscriptions.verified, true)
        )
      );
    event.subscriberCount = subCount?.count || 0;

    return c.json({ success: true, data: event });
  } else {
    return c.json({ success: false, error: "Invalid event type" }, 400);
  }
});

// Subscribe to event updates
eventsRoutes.post("/:type/:id/subscribe", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { type, id } = c.req.param();

  if (type !== "incident" && type !== "maintenance") {
    return c.json({ success: false, error: "Invalid event type" }, 400);
  }

  // Verify event exists
  if (type === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.id, id),
        eq(incidents.organizationId, organizationId)
      ),
    });
    if (!incident) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }
  } else {
    const maintenance = await db.query.maintenanceWindows.findFirst({
      where: and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId)
      ),
    });
    if (!maintenance) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }
  }

  const body = await c.req.json().catch(() => ({}));
  const channels = body.channels || { email: true };

  // Check if already subscribed
  const existing = await db.query.eventSubscriptions.findFirst({
    where: and(
      eq(eventSubscriptions.eventType, type),
      eq(eventSubscriptions.eventId, id),
      eq(eventSubscriptions.userId, auth.user!.id)
    ),
  });

  if (existing) {
    // Update channels if different
    const [updated] = await db
      .update(eventSubscriptions)
      .set({ channels })
      .where(eq(eventSubscriptions.id, existing.id))
      .returning();

    return c.json({ success: true, data: updated });
  }

  // Create new subscription
  const subscriptionId = nanoid();
  const unsubscribeToken = nanoid(32);

  const [subscription] = await db
    .insert(eventSubscriptions)
    .values({
      id: subscriptionId,
      eventType: type,
      eventId: id,
      userId: auth.user!.id,
      channels,
      verified: true, // Authenticated users are auto-verified
      unsubscribeToken,
      createdAt: new Date(),
    })
    .returning();

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "event_subscription.create",
    resourceType: type,
    resourceId: id,
    resourceName: `${type}:${id}`,
  });

  return c.json({ success: true, data: subscription }, 201);
});

// Unsubscribe from event
eventsRoutes.delete("/:type/:id/subscribe", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { type, id } = c.req.param();

  if (type !== "incident" && type !== "maintenance") {
    return c.json({ success: false, error: "Invalid event type" }, 400);
  }

  const [deleted] = await db
    .delete(eventSubscriptions)
    .where(
      and(
        eq(eventSubscriptions.eventType, type as any),
        eq(eventSubscriptions.eventId, id),
        eq(eventSubscriptions.userId, auth.user!.id)
      )
    )
    .returning();

  if (!deleted) {
    return c.json({ success: false, error: "Subscription not found" }, 404);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "event_subscription.delete",
    resourceType: type,
    resourceId: id,
    resourceName: `${type}:${id}`,
  });

  return c.json({ success: true, data: { id: deleted.id } });
});

// List user's event subscriptions
eventsRoutes.get("/subscriptions", async (c) => {
  const auth = requireAuth(c);

  const subscriptions = await db.query.eventSubscriptions.findMany({
    where: eq(eventSubscriptions.userId, auth.user!.id),
    orderBy: [desc(eventSubscriptions.createdAt)],
  });

  return c.json({ success: true, data: subscriptions });
});

// Export event to ICS or JSON
eventsRoutes.get("/:type/:id/export", async (c) => {
  const organizationId = await requireOrganization(c);
  const { type, id } = c.req.param();
  const format = c.req.query("format") || "json";

  let event: UnifiedEvent | null = null;

  if (type === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.id, id),
        eq(incidents.organizationId, organizationId)
      ),
      with: {
        updates: {
          orderBy: [desc(incidentUpdates.createdAt)],
        },
        createdByUser: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!incident) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    event = incidentToEvent(incident);
  } else if (type === "maintenance") {
    const maintenance = await db.query.maintenanceWindows.findFirst({
      where: and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId)
      ),
      with: {
        createdByUser: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!maintenance) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    event = maintenanceToEvent(maintenance);
  } else {
    return c.json({ success: false, error: "Invalid event type" }, 400);
  }

  if (format === "ics") {
    const icsContent = generateICS(event);
    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="${event.type}-${event.id}.ics"`
    );
    return c.body(icsContent);
  }

  // Default to JSON
  c.header("Content-Type", "application/json");
  c.header(
    "Content-Disposition",
    `attachment; filename="${event.type}-${event.id}.json"`
  );
  return c.json(event);
});

// Generate ICS content for an event
function generateICS(event: UnifiedEvent): string {
  const now = new Date();
  const startDate = new Date(event.startedAt);
  const endDate = event.endedAt ? new Date(event.endedAt) : new Date(startDate.getTime() + 3600000); // Default 1 hour

  const formatDate = (d: Date): string => {
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const escapeText = (text: string): string => {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  };

  const description =
    event.type === "incident"
      ? `Status: ${event.status}\nSeverity: ${event.severity}\n\n${event.description || ""}\n\nUpdates:\n${event.updates.map((u) => `[${u.status}] ${u.message}`).join("\n")}`
      : `${event.description || ""}\n\nAffected services: ${event.affectedMonitorDetails?.map((m) => m.name).join(", ") || "None specified"}`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Uni Status//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@uni-status`,
    `DTSTAMP:${formatDate(now)}`,
    `DTSTART:${formatDate(startDate)}`,
    `DTEND:${formatDate(endDate)}`,
    `SUMMARY:${escapeText(event.type === "incident" ? `[${event.severity.toUpperCase()}] ${event.title}` : `[MAINTENANCE] ${event.title}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `STATUS:${event.status === "resolved" || event.status === "completed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
