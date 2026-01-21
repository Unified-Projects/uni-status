import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  maintenanceWindows,
  statusPages,
  statusPageMonitors,
  eventSubscriptions,
  monitors,
} from "@uni-status/database/schema";
import {
  createMaintenanceWindowSchema,
  updateMaintenanceWindowSchema,
} from "@uni-status/shared/validators";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import {
  queueEventSubscriptionNotification,
  queueComponentSubscriptionNotification,
} from "../lib/queues";
import { eq, and, desc, lte, gte, or, inArray } from "drizzle-orm";

export const maintenanceWindowsRoutes = new OpenAPIHono();

/**
 * Notifies event subscribers when a maintenance window is updated.
 */
async function notifyMaintenanceSubscribers(
  maintenanceId: string,
  maintenanceName: string,
  maintenanceStatus: string,
  maintenanceDescription: string | null,
  affectedMonitors: string[],
  organizationId: string,
  updateMessage?: string
): Promise<void> {
  // Check if there are any subscribers for this maintenance
  const subscriberCount = await db.query.eventSubscriptions.findFirst({
    where: and(
      eq(eventSubscriptions.eventType, "maintenance"),
      eq(eventSubscriptions.eventId, maintenanceId),
      eq(eventSubscriptions.verified, true)
    ),
  });

  if (!subscriberCount) {
    return; // No subscribers, skip
  }

  // Find status pages that show this maintenance (via affected monitors)
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

  // Get status page details
  const statusPage = await db.query.statusPages.findFirst({
    where: and(
      inArray(statusPages.id, pageIds),
      eq(statusPages.organizationId, organizationId),
      eq(statusPages.published, true)
    ),
  });

  if (!statusPage) {
    return;
  }

  // Queue notification
  await queueEventSubscriptionNotification({
    eventType: "maintenance",
    eventId: maintenanceId,
    eventTitle: maintenanceName,
    eventStatus: maintenanceStatus,
    eventDescription: maintenanceDescription,
    updateMessage,
    statusPageSlug: statusPage.slug,
    statusPageName: statusPage.name,
  });
}

/**
 * Notifies component subscribers when a new maintenance window is scheduled.
 */
async function notifyComponentSubscribersForMaintenance(
  maintenanceId: string,
  maintenanceName: string,
  maintenanceDescription: string | null,
  affectedMonitorIds: string[],
  organizationId: string
): Promise<void> {
  if (!affectedMonitorIds || affectedMonitorIds.length === 0) {
    return;
  }

  // Get monitor details
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

  // Get status page details
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
      notificationType: "maintenance_scheduled",
      statusPageId: statusPage.id,
      statusPageSlug: statusPage.slug,
      statusPageName: statusPage.name,
      affectedMonitors,
      eventType: "maintenance",
      eventId: maintenanceId,
      eventTitle: maintenanceName,
      eventStatus: "scheduled",
      eventDescription: maintenanceDescription ?? undefined,
    });
  }
}

// Helper to determine maintenance window status
function getMaintenanceStatus(startsAt: Date, endsAt: Date): "scheduled" | "active" | "completed" {
  const now = new Date();
  if (now < startsAt) return "scheduled";
  if (now > endsAt) return "completed";
  return "active";
}

// List maintenance windows
maintenanceWindowsRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);
  const status = c.req.query("status"); // upcoming, active, past, all
  const now = new Date();

  let whereClause;

  switch (status) {
    case "upcoming":
      whereClause = and(
        eq(maintenanceWindows.organizationId, organizationId),
        gte(maintenanceWindows.startsAt, now)
      );
      break;
    case "active":
      whereClause = and(
        eq(maintenanceWindows.organizationId, organizationId),
        lte(maintenanceWindows.startsAt, now),
        gte(maintenanceWindows.endsAt, now)
      );
      break;
    case "past":
      whereClause = and(
        eq(maintenanceWindows.organizationId, organizationId),
        lte(maintenanceWindows.endsAt, now)
      );
      break;
    default:
      whereClause = eq(maintenanceWindows.organizationId, organizationId);
  }

  const result = await db.query.maintenanceWindows.findMany({
    where: whereClause,
    orderBy: [desc(maintenanceWindows.startsAt)],
    with: {
      createdByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  // Add computed status to each window
  const dataWithStatus = result.map((window) => ({
    ...window,
    computedStatus: getMaintenanceStatus(window.startsAt, window.endsAt),
  }));

  return c.json({
    success: true,
    data: dataWithStatus,
  });
});

// Create maintenance window
maintenanceWindowsRoutes.post("/", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createMaintenanceWindowSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  const [maintenanceWindow] = await db
    .insert(maintenanceWindows)
    .values({
      id,
      organizationId,
      name: validated.name,
      description: validated.description,
      affectedMonitors: validated.affectedMonitors,
      startsAt: new Date(validated.startsAt),
      endsAt: new Date(validated.endsAt),
      timezone: validated.timezone,
      recurrence: validated.recurrence || { type: "none" },
      notifySubscribers: validated.notifySubscribers || { onStart: true, onEnd: true },
      createdBy: auth.user?.id || auth.apiKey!.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!maintenanceWindow) {
    return c.json({ success: false, error: "Failed to create maintenance window" }, 500);
  }

  // Publish maintenance created event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "maintenance:created",
    data: {
      id: maintenanceWindow.id,
      name: maintenanceWindow.name,
      startsAt: maintenanceWindow.startsAt.toISOString(),
      endsAt: maintenanceWindow.endsAt.toISOString(),
      affectedMonitors: maintenanceWindow.affectedMonitors,
    },
    timestamp: now.toISOString(),
  });

  // Notify component subscribers about the scheduled maintenance
  if (validated.affectedMonitors && validated.affectedMonitors.length > 0) {
    await notifyComponentSubscribersForMaintenance(
      maintenanceWindow.id,
      maintenanceWindow.name,
      maintenanceWindow.description,
      validated.affectedMonitors,
      organizationId
    );
  }

  return c.json(
    {
      success: true,
      data: {
        ...maintenanceWindow,
        computedStatus: getMaintenanceStatus(maintenanceWindow.startsAt, maintenanceWindow.endsAt),
      },
    },
    201
  );
});

// Get maintenance window by ID
maintenanceWindowsRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const maintenanceWindow = await db.query.maintenanceWindows.findFirst({
    where: and(
      eq(maintenanceWindows.id, id),
      eq(maintenanceWindows.organizationId, organizationId)
    ),
    with: {
      createdByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  if (!maintenanceWindow) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...maintenanceWindow,
      computedStatus: getMaintenanceStatus(maintenanceWindow.startsAt, maintenanceWindow.endsAt),
    },
  });
});

// Update maintenance window
maintenanceWindowsRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateMaintenanceWindowSchema.parse(body);

  const now = new Date();

  const updateData: Record<string, unknown> = {
    updatedAt: now,
  };

  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.description !== undefined) updateData.description = validated.description;
  if (validated.affectedMonitors !== undefined) updateData.affectedMonitors = validated.affectedMonitors;
  if (validated.startsAt !== undefined) updateData.startsAt = new Date(validated.startsAt);
  if (validated.endsAt !== undefined) updateData.endsAt = new Date(validated.endsAt);
  if (validated.timezone !== undefined) updateData.timezone = validated.timezone;
  if (validated.recurrence !== undefined) updateData.recurrence = validated.recurrence;
  if (validated.notifySubscribers !== undefined) updateData.notifySubscribers = validated.notifySubscribers;

  const [maintenanceWindow] = await db
    .update(maintenanceWindows)
    .set(updateData)
    .where(
      and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId)
      )
    )
    .returning();

  if (!maintenanceWindow) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  // Publish maintenance updated event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "maintenance:updated",
    data: {
      id: maintenanceWindow.id,
      name: maintenanceWindow.name,
      startsAt: maintenanceWindow.startsAt.toISOString(),
      endsAt: maintenanceWindow.endsAt.toISOString(),
      affectedMonitors: maintenanceWindow.affectedMonitors,
    },
    timestamp: now.toISOString(),
  });

  return c.json({
    success: true,
    data: {
      ...maintenanceWindow,
      computedStatus: getMaintenanceStatus(maintenanceWindow.startsAt, maintenanceWindow.endsAt),
    },
  });
});

// Delete maintenance window
maintenanceWindowsRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const [deleted] = await db
    .delete(maintenanceWindows)
    .where(
      and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId)
      )
    )
    .returning();

  if (!deleted) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  // Publish maintenance deleted event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "maintenance:deleted",
    data: {
      id: deleted.id,
    },
    timestamp: new Date().toISOString(),
  });

  return c.json({
    success: true,
    data: { id },
  });
});

// End maintenance window early
maintenanceWindowsRoutes.post("/:id/end-early", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const now = new Date();

  const [maintenanceWindow] = await db
    .update(maintenanceWindows)
    .set({
      endsAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId),
        lte(maintenanceWindows.startsAt, now), // Must have started
        gte(maintenanceWindows.endsAt, now) // Must not have ended
      )
    )
    .returning();

  if (!maintenanceWindow) {
    return c.json({ success: false, error: "Not found or not currently active" }, 404);
  }

  // Publish maintenance ended event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "maintenance:ended",
    data: {
      id: maintenanceWindow.id,
      name: maintenanceWindow.name,
      endedEarly: true,
    },
    timestamp: now.toISOString(),
  });

  // Notify event subscribers
  await notifyMaintenanceSubscribers(
    maintenanceWindow.id,
    maintenanceWindow.name,
    "completed",
    maintenanceWindow.description,
    (maintenanceWindow.affectedMonitors || []) as string[],
    organizationId,
    "This maintenance has been completed early."
  );

  return c.json({
    success: true,
    data: {
      ...maintenanceWindow,
      computedStatus: "completed" as const,
    },
  });
});

// Get active maintenance windows (for scheduler integration)
maintenanceWindowsRoutes.get("/active/monitors", async (c) => {
  const organizationId = await requireOrganization(c);
  const now = new Date();

  const activeWindows = await db.query.maintenanceWindows.findMany({
    where: and(
      eq(maintenanceWindows.organizationId, organizationId),
      lte(maintenanceWindows.startsAt, now),
      gte(maintenanceWindows.endsAt, now)
    ),
  });

  // Collect all affected monitor IDs
  const affectedMonitorIds = new Set<string>();
  for (const window of activeWindows) {
    for (const monitorId of window.affectedMonitors as string[]) {
      affectedMonitorIds.add(monitorId);
    }
  }

  return c.json({
    success: true,
    data: {
      monitorIds: Array.from(affectedMonitorIds),
      activeWindows: activeWindows.length,
    },
  });
});
