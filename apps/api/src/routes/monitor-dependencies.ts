import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitorDependencies, monitors } from "@uni-status/database/schema";
import {
  createMonitorDependencySchema,
  updateMonitorDependencySchema,
  bulkCreateMonitorDependenciesSchema,
} from "@uni-status/shared/validators";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { createAuditLog, getAuditUserId } from "../lib/audit";
import { eq, and, or, inArray } from "drizzle-orm";

export const monitorDependenciesRoutes = new OpenAPIHono();

// List all dependencies for organization
monitorDependenciesRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  // Get all monitors for this organization to filter dependencies
  const orgMonitors = await db.query.monitors.findMany({
    where: eq(monitors.organizationId, organizationId),
    columns: { id: true, name: true, type: true, status: true },
  });

  const monitorIds = orgMonitors.map((m) => m.id);

  if (monitorIds.length === 0) {
    return c.json({
      success: true,
      data: [],
    });
  }

  // Get dependencies where either upstream or downstream is in org's monitors
  const dependencies = await db
    .select({
      id: monitorDependencies.id,
      downstreamMonitorId: monitorDependencies.downstreamMonitorId,
      upstreamMonitorId: monitorDependencies.upstreamMonitorId,
      description: monitorDependencies.description,
      createdAt: monitorDependencies.createdAt,
    })
    .from(monitorDependencies)
    .where(
      or(
        inArray(monitorDependencies.downstreamMonitorId, monitorIds),
        inArray(monitorDependencies.upstreamMonitorId, monitorIds)
      )
    );

  // Create a lookup map for monitor info
  const monitorMap = new Map(
    orgMonitors.map((m) => [m.id, { id: m.id, name: m.name, type: m.type, status: m.status }])
  );

  // Enrich dependencies with monitor info
  const enrichedDependencies = dependencies.map((dep) => ({
    ...dep,
    downstreamMonitor: monitorMap.get(dep.downstreamMonitorId) || null,
    upstreamMonitor: monitorMap.get(dep.upstreamMonitorId) || null,
  }));

  return c.json({
    success: true,
    data: enrichedDependencies,
  });
});

// Get dependencies for a specific monitor
monitorDependenciesRoutes.get("/monitor/:monitorId", async (c) => {
  const organizationId = await requireOrganization(c);
  const { monitorId } = c.req.param();

  // Verify monitor belongs to organization
  const monitor = await db.query.monitors.findFirst({
    where: and(eq(monitors.id, monitorId), eq(monitors.organizationId, organizationId)),
  });

  if (!monitor) {
    return c.json({ success: false, error: "Monitor not found" }, 404);
  }

  // Get all org monitors for enrichment
  const orgMonitors = await db.query.monitors.findMany({
    where: eq(monitors.organizationId, organizationId),
    columns: { id: true, name: true, type: true, status: true },
  });

  const monitorMap = new Map(
    orgMonitors.map((m) => [m.id, { id: m.id, name: m.name, type: m.type, status: m.status }])
  );

  // Get upstream dependencies (what this monitor depends on)
  const upstreamDeps = await db
    .select()
    .from(monitorDependencies)
    .where(eq(monitorDependencies.downstreamMonitorId, monitorId));

  // Get downstream dependencies (what depends on this monitor)
  const downstreamDeps = await db
    .select()
    .from(monitorDependencies)
    .where(eq(monitorDependencies.upstreamMonitorId, monitorId));

  return c.json({
    success: true,
    data: {
      upstream: upstreamDeps.map((dep) => ({
        ...dep,
        monitor: monitorMap.get(dep.upstreamMonitorId) || null,
      })),
      downstream: downstreamDeps.map((dep) => ({
        ...dep,
        monitor: monitorMap.get(dep.downstreamMonitorId) || null,
      })),
    },
  });
});

// Create a single dependency
monitorDependenciesRoutes.post("/", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createMonitorDependencySchema.parse(body);

  // Validate no self-reference
  if (validated.downstreamMonitorId === validated.upstreamMonitorId) {
    return c.json({ success: false, error: "A monitor cannot depend on itself" }, 400);
  }

  // Verify both monitors exist and belong to organization
  const [downstream, upstream] = await Promise.all([
    db.query.monitors.findFirst({
      where: and(
        eq(monitors.id, validated.downstreamMonitorId),
        eq(monitors.organizationId, organizationId)
      ),
    }),
    db.query.monitors.findFirst({
      where: and(
        eq(monitors.id, validated.upstreamMonitorId),
        eq(monitors.organizationId, organizationId)
      ),
    }),
  ]);

  if (!downstream) {
    return c.json({ success: false, error: "Downstream monitor not found" }, 404);
  }

  if (!upstream) {
    return c.json({ success: false, error: "Upstream monitor not found" }, 404);
  }

  // Check for existing dependency
  const existing = await db.query.monitorDependencies.findFirst({
    where: and(
      eq(monitorDependencies.downstreamMonitorId, validated.downstreamMonitorId),
      eq(monitorDependencies.upstreamMonitorId, validated.upstreamMonitorId)
    ),
  });

  if (existing) {
    return c.json({ success: false, error: "Dependency already exists" }, 409);
  }

  const id = nanoid();
  const now = new Date();

  const [dependency] = await db
    .insert(monitorDependencies)
    .values({
      id,
      downstreamMonitorId: validated.downstreamMonitorId,
      upstreamMonitorId: validated.upstreamMonitorId,
      description: validated.description,
      createdAt: now,
    })
    .returning();

  if (!dependency) {
    return c.json({ success: false, error: "Failed to create dependency" }, 500);
  }

  // Publish event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "dependency:created",
    data: {
      id: dependency.id,
      downstreamMonitorId: dependency.downstreamMonitorId,
      upstreamMonitorId: dependency.upstreamMonitorId,
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.update",
    resourceType: "monitor",
    resourceId: validated.downstreamMonitorId,
    resourceName: downstream.name,
    metadata: {
      after: {
        dependencyCreated: {
          upstreamMonitorId: validated.upstreamMonitorId,
          upstreamMonitorName: upstream.name,
          description: validated.description,
        },
      },
    },
  });

  return c.json(
    {
      success: true,
      data: dependency,
    },
    201
  );
});

// Bulk create dependencies
monitorDependenciesRoutes.post("/bulk", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = bulkCreateMonitorDependenciesSchema.parse(body);

  // Filter out self-references
  const upstreamIds = validated.upstreamMonitorIds.filter(
    (id) => id !== validated.downstreamMonitorId
  );

  if (upstreamIds.length === 0) {
    return c.json({ success: false, error: "No valid upstream monitors provided" }, 400);
  }

  // Verify downstream monitor exists
  const downstream = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, validated.downstreamMonitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!downstream) {
    return c.json({ success: false, error: "Downstream monitor not found" }, 404);
  }

  // Verify all upstream monitors exist and belong to organization
  const upstreamMonitors = await db.query.monitors.findMany({
    where: and(eq(monitors.organizationId, organizationId), inArray(monitors.id, upstreamIds)),
  });

  const validUpstreamIds = upstreamMonitors.map((m) => m.id);
  const invalidIds = upstreamIds.filter((id) => !validUpstreamIds.includes(id));

  if (invalidIds.length > 0) {
    return c.json(
      { success: false, error: `Some upstream monitors not found: ${invalidIds.join(", ")}` },
      404
    );
  }

  // Get existing dependencies to avoid duplicates
  const existingDeps = await db
    .select({ upstreamMonitorId: monitorDependencies.upstreamMonitorId })
    .from(monitorDependencies)
    .where(
      and(
        eq(monitorDependencies.downstreamMonitorId, validated.downstreamMonitorId),
        inArray(monitorDependencies.upstreamMonitorId, validUpstreamIds)
      )
    );

  const existingUpstreamIds = new Set(existingDeps.map((d) => d.upstreamMonitorId));
  const newUpstreamIds = validUpstreamIds.filter((id) => !existingUpstreamIds.has(id));

  if (newUpstreamIds.length === 0) {
    return c.json({ success: true, data: [], message: "All dependencies already exist" });
  }

  const now = new Date();
  const newDependencies = newUpstreamIds.map((upstreamId) => ({
    id: nanoid(),
    downstreamMonitorId: validated.downstreamMonitorId,
    upstreamMonitorId: upstreamId,
    description: validated.description,
    createdAt: now,
  }));

  const created = await db.insert(monitorDependencies).values(newDependencies).returning();

  // Publish event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "dependencies:created",
    data: {
      count: created.length,
      downstreamMonitorId: validated.downstreamMonitorId,
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.update",
    resourceType: "monitor",
    resourceId: validated.downstreamMonitorId,
    resourceName: downstream.name,
    metadata: {
      after: {
        dependenciesCreated: newUpstreamIds.length,
        upstreamMonitorIds: newUpstreamIds,
      },
    },
  });

  return c.json(
    {
      success: true,
      data: created,
    },
    201
  );
});

// Update dependency (description only)
monitorDependenciesRoutes.patch("/:id", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateMonitorDependencySchema.parse(body);

  // Get existing dependency
  const existing = await db.query.monitorDependencies.findFirst({
    where: eq(monitorDependencies.id, id),
  });

  if (!existing) {
    return c.json({ success: false, error: "Dependency not found" }, 404);
  }

  // Verify downstream monitor belongs to organization
  const downstream = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, existing.downstreamMonitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!downstream) {
    return c.json({ success: false, error: "Dependency not found" }, 404);
  }

  const [updated] = await db
    .update(monitorDependencies)
    .set({ description: validated.description })
    .where(eq(monitorDependencies.id, id))
    .returning();

  return c.json({
    success: true,
    data: updated,
  });
});

// Delete a single dependency
monitorDependenciesRoutes.delete("/:id", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Get existing dependency
  const existing = await db.query.monitorDependencies.findFirst({
    where: eq(monitorDependencies.id, id),
  });

  if (!existing) {
    return c.json({ success: false, error: "Dependency not found" }, 404);
  }

  // Verify downstream monitor belongs to organization
  const downstream = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, existing.downstreamMonitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!downstream) {
    return c.json({ success: false, error: "Dependency not found" }, 404);
  }

  await db.delete(monitorDependencies).where(eq(monitorDependencies.id, id));

  // Publish event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "dependency:deleted",
    data: { id },
    timestamp: new Date().toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "monitor.update",
    resourceType: "monitor",
    resourceId: existing.downstreamMonitorId,
    resourceName: downstream.name,
    metadata: {
      before: {
        dependencyDeleted: {
          upstreamMonitorId: existing.upstreamMonitorId,
          description: existing.description,
        },
      },
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});
