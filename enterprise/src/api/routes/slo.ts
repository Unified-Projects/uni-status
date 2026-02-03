import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { monitors } from "@uni-status/database";
import { enterpriseDb as db } from "../../database";
import { sloTargets, errorBudgets, sloBreaches } from "../../database/schema/slo";
import {
  createSloTargetSchema,
  updateSloTargetSchema,
} from "@uni-status/shared/validators";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { createAuditLog, createAuditLogWithChanges, getAuditUserId } from "../lib/audit";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export const sloRoutes = new OpenAPIHono();

// Helper to format SLO target percentage (remove trailing zeros)
function formatSloTarget(target: any) {
  return {
    ...target,
    targetPercentage: parseFloat(target.targetPercentage).toString(),
  };
}

// Helper to calculate error budget for a period
function calculateErrorBudget(
  targetPercentage: number,
  totalMinutes: number
): { budgetMinutes: number; allowedDowntimeMinutes: number } {
  const allowedDowntimePercentage = 100 - targetPercentage;
  const budgetMinutes = (allowedDowntimePercentage / 100) * totalMinutes;
  return {
    budgetMinutes,
    allowedDowntimeMinutes: budgetMinutes,
  };
}

// Helper to get period dates based on window type
function getPeriodDates(window: "daily" | "weekly" | "monthly" | "quarterly" | "annually"): {
  periodStart: Date;
  periodEnd: Date;
  totalMinutes: number;
} {
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  switch (window) {
    case "daily":
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case "weekly":
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Start week on Monday
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0);
      periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 6, 23, 59, 59);
      break;
    case "monthly":
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case "quarterly":
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1);
      periodEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
      break;
    case "annually":
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
  }

  const totalMinutes = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60);

  return { periodStart, periodEnd, totalMinutes };
}

// List SLO targets
sloRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const result = await db.query.sloTargets.findMany({
    where: eq(sloTargets.organizationId, organizationId),
    orderBy: [desc(sloTargets.createdAt)],
    limit,
    offset,
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
  });

  // Get current error budget status for each SLO
  const enrichedResult = await Promise.all(
    result.map(async (slo) => {
      const { periodStart, periodEnd } = getPeriodDates(slo.window);

      // Get current period's error budget
      const budget = await db.query.errorBudgets.findFirst({
        where: and(
          eq(errorBudgets.sloTargetId, slo.id),
          lte(errorBudgets.periodStart, new Date()),
          gte(errorBudgets.periodEnd, new Date())
        ),
      });

      return {
        ...slo,
        currentBudget: budget
          ? {
              percentRemaining: parseFloat(budget.percentRemaining),
              percentConsumed: parseFloat(budget.percentConsumed || "0"),
              remainingMinutes: parseFloat(budget.remainingMinutes),
              breached: budget.breached,
            }
          : null,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      };
    })
  );

  return c.json({
    success: true,
    data: enrichedResult,
    meta: {
      limit,
      offset,
    },
  });
});

// Create SLO target
sloRoutes.post("/", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = createSloTargetSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.errors?.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;

  // Verify monitor belongs to organization
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, validated.monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    return c.json(
      {
        success: false,
        error: "Monitor not found",
      },
      404
    );
  }

  const id = nanoid();
  const now = new Date();

  // Create the SLO target
  const [sloTarget] = await db
    .insert(sloTargets)
    .values({
      id,
      organizationId,
      monitorId: validated.monitorId,
      name: validated.name,
      targetPercentage: validated.targetPercentage.toString(),
      window: validated.window || "monthly",
      gracePeriodMinutes: validated.gracePeriodMinutes ?? 5,
      alertThresholds: validated.alertThresholds?.map(String),
      active: validated.active ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!sloTarget) {
    return c.json({ success: false, error: "Failed to create SLO target" }, 500);
  }

  // Initialize the error budget for the current period
  const { periodStart, periodEnd, totalMinutes } = getPeriodDates(
    validated.window || "monthly"
  );
  const { budgetMinutes } = calculateErrorBudget(validated.targetPercentage, totalMinutes);

  const budgetId = nanoid();
  await db.insert(errorBudgets).values({
    id: budgetId,
    sloTargetId: id,
    periodStart,
    periodEnd,
    totalMinutes: totalMinutes.toString(),
    budgetMinutes: budgetMinutes.toString(),
    consumedMinutes: "0",
    remainingMinutes: budgetMinutes.toString(),
    percentRemaining: "100.00",
    percentConsumed: "0",
    breached: false,
    createdAt: now,
    updatedAt: now,
  });

  // Publish SLO created event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "slo:created",
    data: { id: sloTarget.id, name: sloTarget.name, monitorId: sloTarget.monitorId },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "slo.create",
    resourceType: "slo_target",
    resourceId: sloTarget.id,
    resourceName: sloTarget.name,
    metadata: {
      after: {
        name: sloTarget.name,
        targetPercentage: sloTarget.targetPercentage,
        window: sloTarget.window,
        monitorId: sloTarget.monitorId,
      },
    },
  });

  return c.json(
    {
      success: true,
      data: formatSloTarget(sloTarget),
    },
    201
  );
});

// Get SLO target by ID
sloRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const sloTarget = await db.query.sloTargets.findFirst({
    where: and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)),
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
  });

  if (!sloTarget) {
    return c.json(
      {
        success: false,
        error: "SLO target not found",
      },
      404
    );
  }

  // Get current period's error budget
  const { periodStart, periodEnd } = getPeriodDates(sloTarget.window);
  const currentBudget = await db.query.errorBudgets.findFirst({
    where: and(
      eq(errorBudgets.sloTargetId, id),
      lte(errorBudgets.periodStart, new Date()),
      gte(errorBudgets.periodEnd, new Date())
    ),
  });

  return c.json({
    success: true,
    data: {
      ...formatSloTarget(sloTarget),
      currentBudget: currentBudget
        ? {
            id: currentBudget.id,
            periodStart: currentBudget.periodStart,
            periodEnd: currentBudget.periodEnd,
            totalMinutes: parseFloat(currentBudget.totalMinutes),
            budgetMinutes: parseFloat(currentBudget.budgetMinutes),
            consumedMinutes: parseFloat(currentBudget.consumedMinutes || "0"),
            remainingMinutes: parseFloat(currentBudget.remainingMinutes),
            percentRemaining: parseFloat(currentBudget.percentRemaining),
            percentConsumed: parseFloat(currentBudget.percentConsumed || "0"),
            breached: currentBudget.breached,
            breachedAt: currentBudget.breachedAt,
          }
        : null,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });
});

// Update SLO target
sloRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = updateSloTargetSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.errors?.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;
  const now = new Date();

  // Get existing SLO for audit log
  const existingSlo = await db.query.sloTargets.findFirst({
    where: and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)),
  });

  if (!existingSlo) {
    return c.json(
      {
        success: false,
        error: "SLO target not found",
      },
      404
    );
  }

  // If monitor is being changed, verify it belongs to the organization
  if (validated.monitorId && validated.monitorId !== existingSlo.monitorId) {
    const monitor = await db.query.monitors.findFirst({
      where: and(
        eq(monitors.id, validated.monitorId),
        eq(monitors.organizationId, organizationId)
      ),
    });

    if (!monitor) {
      return c.json(
        {
          success: false,
          error: "Monitor not found",
        },
        404
      );
    }
  }

  const updateData: Record<string, unknown> = {
    updatedAt: now,
  };

  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.monitorId !== undefined) updateData.monitorId = validated.monitorId;
  if (validated.targetPercentage !== undefined)
    updateData.targetPercentage = validated.targetPercentage.toString();
  if (validated.window !== undefined) updateData.window = validated.window;
  if (validated.gracePeriodMinutes !== undefined)
    updateData.gracePeriodMinutes = validated.gracePeriodMinutes;
  if (validated.alertThresholds !== undefined)
    updateData.alertThresholds = validated.alertThresholds?.map(String);
  if (validated.active !== undefined) updateData.active = validated.active;

  const [sloTarget] = await db
    .update(sloTargets)
    .set(updateData)
    .where(and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)))
    .returning();

  if (!sloTarget) {
    return c.json({ success: false, error: "SLO target not found" }, 404);
  }

  // Publish SLO updated event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "slo:updated",
    data: { id: sloTarget.id, name: sloTarget.name },
    timestamp: now.toISOString(),
  });

  // Audit log with changes
  await createAuditLogWithChanges(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "slo.update",
    resourceType: "slo_target",
    resourceId: sloTarget.id,
    resourceName: sloTarget.name,
    before: {
      name: existingSlo.name,
      targetPercentage: existingSlo.targetPercentage,
      window: existingSlo.window,
      active: existingSlo.active,
    },
    after: {
      name: sloTarget.name,
      targetPercentage: sloTarget.targetPercentage,
      window: sloTarget.window,
      active: sloTarget.active,
    },
  });

  return c.json({
    success: true,
    data: formatSloTarget(sloTarget),
  });
});

// Delete SLO target
sloRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Get existing SLO for audit log
  const existingSlo = await db.query.sloTargets.findFirst({
    where: and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)),
  });

  if (!existingSlo) {
    return c.json(
      {
        success: false,
        error: "SLO target not found",
      },
      404
    );
  }

  await db
    .delete(sloTargets)
    .where(and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)));

  // Publish SLO deleted event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "slo:deleted",
    data: { id },
    timestamp: new Date().toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "slo.delete",
    resourceType: "slo_target",
    resourceId: id,
    resourceName: existingSlo.name,
    metadata: {
      before: {
        name: existingSlo.name,
        targetPercentage: existingSlo.targetPercentage,
        window: existingSlo.window,
      },
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Get error budget history for an SLO
sloRoutes.get("/:id/budgets", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify SLO belongs to organization
  const sloTarget = await db.query.sloTargets.findFirst({
    where: and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)),
  });

  if (!sloTarget) {
    return c.json(
      {
        success: false,
        error: "SLO target not found",
      },
      404
    );
  }

  const limit = parseInt(c.req.query("limit") || "12");
  const offset = parseInt(c.req.query("offset") || "0");

  const budgets = await db.query.errorBudgets.findMany({
    where: eq(errorBudgets.sloTargetId, id),
    orderBy: [desc(errorBudgets.periodStart)],
    limit,
    offset,
  });

  // Transform to numbers for easier frontend consumption
  const transformedBudgets = budgets.map((b) => ({
    id: b.id,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    totalMinutes: parseFloat(b.totalMinutes),
    budgetMinutes: parseFloat(b.budgetMinutes),
    consumedMinutes: parseFloat(b.consumedMinutes || "0"),
    remainingMinutes: parseFloat(b.remainingMinutes),
    percentRemaining: parseFloat(b.percentRemaining),
    percentConsumed: parseFloat(b.percentConsumed || "0"),
    breached: b.breached,
    breachedAt: b.breachedAt,
    lastAlertThreshold: b.lastAlertThreshold ? parseFloat(b.lastAlertThreshold) : null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }));

  return c.json({
    success: true,
    data: transformedBudgets,
    meta: {
      limit,
      offset,
    },
  });
});

// Get breach history for an SLO
sloRoutes.get("/:id/breaches", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  // Verify SLO belongs to organization
  const sloTarget = await db.query.sloTargets.findFirst({
    where: and(eq(sloTargets.id, id), eq(sloTargets.organizationId, organizationId)),
  });

  if (!sloTarget) {
    return c.json(
      {
        success: false,
        error: "SLO target not found",
      },
      404
    );
  }

  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  const breaches = await db.query.sloBreaches.findMany({
    where: eq(sloBreaches.sloTargetId, id),
    orderBy: [desc(sloBreaches.breachStartedAt)],
    limit,
    offset,
  });

  // Transform to numbers
  const transformedBreaches = breaches.map((b) => ({
    id: b.id,
    breachStartedAt: b.breachStartedAt,
    breachResolvedAt: b.breachResolvedAt,
    downtimeMinutes: b.downtimeMinutes ? parseFloat(b.downtimeMinutes) : null,
    budgetMinutes: b.budgetMinutes ? parseFloat(b.budgetMinutes) : null,
    uptimePercentage: b.uptimePercentage ? parseFloat(b.uptimePercentage) : null,
    targetPercentage: b.targetPercentage ? parseFloat(b.targetPercentage) : null,
    notes: b.notes,
    createdAt: b.createdAt,
  }));

  return c.json({
    success: true,
    data: transformedBreaches,
    meta: {
      limit,
      offset,
    },
  });
});

// Get SLO dashboard summary (all SLOs with their current status)
sloRoutes.get("/summary/dashboard", async (c) => {
  const organizationId = await requireOrganization(c);

  const result = await db.query.sloTargets.findMany({
    where: and(eq(sloTargets.organizationId, organizationId), eq(sloTargets.active, true)),
    with: {
      monitor: {
        columns: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  // Get current error budget status for each SLO
  const summary = await Promise.all(
    result.map(async (slo) => {
      const budget = await db.query.errorBudgets.findFirst({
        where: and(
          eq(errorBudgets.sloTargetId, slo.id),
          lte(errorBudgets.periodStart, new Date()),
          gte(errorBudgets.periodEnd, new Date())
        ),
      });

      // Count breaches this period
      const breachCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(sloBreaches)
        .where(
          and(
            eq(sloBreaches.sloTargetId, slo.id),
            budget ? gte(sloBreaches.breachStartedAt, budget.periodStart) : sql`TRUE`
          )
        );

      return {
        id: slo.id,
        name: slo.name,
        targetPercentage: parseFloat(slo.targetPercentage),
        window: slo.window,
        monitor: slo.monitor,
        status: budget?.breached
          ? "breached"
          : budget && parseFloat(budget.percentRemaining) < 25
          ? "at_risk"
          : "healthy",
        percentRemaining: budget ? parseFloat(budget.percentRemaining) : 100,
        percentConsumed: budget ? parseFloat(budget.percentConsumed || "0") : 0,
        breachCount: breachCount[0]?.count || 0,
      };
    })
  );

  // Calculate overall stats
  const stats = {
    total: summary.length,
    healthy: summary.filter((s) => s.status === "healthy").length,
    atRisk: summary.filter((s) => s.status === "at_risk").length,
    breached: summary.filter((s) => s.status === "breached").length,
    avgBudgetRemaining:
      summary.length > 0
        ? summary.reduce((acc, s) => acc + s.percentRemaining, 0) / summary.length
        : 100,
  };

  return c.json({
    success: true,
    data: {
      slos: summary,
      stats,
    },
  });
});
