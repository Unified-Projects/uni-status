import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { enterpriseDb as db } from "../../database";
import { oncallRotations, oncallOverrides } from "../../database/schema/oncall";
import {
  createOncallRotationSchema,
  updateOncallRotationSchema,
  createOncallOverrideSchema,
} from "@uni-status/shared/validators";
import { requireOrganization, requireScope } from "../middleware/auth";
import { eq, and, gte, asc } from "drizzle-orm";

export const oncallRoutes = new OpenAPIHono();

// List rotations with overrides
oncallRoutes.get("/rotations", async (c) => {
  const organizationId = await requireOrganization(c);

  const rotations = await db.query.oncallRotations.findMany({
    where: eq(oncallRotations.organizationId, organizationId),
    orderBy: [asc(oncallRotations.name)],
    with: {
      overrides: true,
    },
  });

  return c.json({ success: true, data: rotations });
});

// Create rotation
oncallRoutes.post("/rotations", async (c) => {
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

  const result = createOncallRotationSchema.safeParse(body);
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
  const hasParticipants = validated.participants.length > 0;
  const now = new Date();
  const [rotation] = await db
    .insert(oncallRotations)
    .values({
      id: nanoid(),
      organizationId,
      name: validated.name,
      description: validated.description,
      timezone: validated.timezone || "UTC",
      rotationStart: validated.rotationStart ? new Date(validated.rotationStart) : now,
      shiftDurationMinutes: validated.shiftDurationMinutes,
      participants: validated.participants,
      handoffNotificationMinutes: validated.handoffNotificationMinutes,
      handoffChannels: validated.handoffChannels || [],
      active: validated.active ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return c.json(
    {
      success: hasParticipants,
      data: rotation,
      ...(hasParticipants
        ? {}
        : { error: "At least one participant is required for a rotation" }),
    },
    hasParticipants ? 201 : 400
  );
});

// Update rotation
oncallRoutes.patch("/rotations/:id", async (c) => {
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

  const result = updateOncallRotationSchema.safeParse(body);
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

  const [rotation] = await db
    .update(oncallRotations)
    .set({
      ...validated,
      rotationStart: validated.rotationStart ? new Date(validated.rotationStart) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(oncallRotations.id, id), eq(oncallRotations.organizationId, organizationId)))
    .returning();

  if (!rotation) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  return c.json({ success: true, data: rotation });
});

// Delete rotation
oncallRoutes.delete("/rotations/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  await db.delete(oncallOverrides).where(eq(oncallOverrides.rotationId, id));
  const result = await db
    .delete(oncallRotations)
    .where(and(eq(oncallRotations.id, id), eq(oncallRotations.organizationId, organizationId)))
    .returning();

  return c.json({ success: true, data: { deleted: result.length > 0 } });
});

// Create override
oncallRoutes.post("/rotations/:id/overrides", async (c) => {
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

  const result = createOncallOverrideSchema.safeParse(body);
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
  const [override] = await db
    .insert(oncallOverrides)
    .values({
      id: nanoid(),
      rotationId: id,
      userId: validated.userId,
      startAt: new Date(validated.startAt),
      endAt: new Date(validated.endAt),
      reason: validated.reason,
      createdAt: now,
    })
    .returning();

  return c.json({ success: true, data: override }, 201);
});

// Coverage gaps detection (simple check for empty participants or override windows)
oncallRoutes.get("/rotations/:id/coverage", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const rotation = await db.query.oncallRotations.findFirst({
    where: and(eq(oncallRotations.id, id), eq(oncallRotations.organizationId, organizationId)),
    with: { overrides: true },
  });

  if (!rotation) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  const gaps: Array<{ start: string; end: string; reason: string }> = [];

  if (!rotation.participants || rotation.participants.length === 0) {
    gaps.push({
      start: rotation.rotationStart.toISOString(),
      end: new Date(rotation.rotationStart.getTime() + rotation.shiftDurationMinutes * 60000).toISOString(),
      reason: "No participants configured",
    });
  }

  // Check overrides that leave window empty
  const now = new Date();
  const activeOverride = rotation.overrides.find(
    (o) => o.startAt <= now && o.endAt >= now
  );

  if (activeOverride && !rotation.participants.includes(activeOverride.userId)) {
    gaps.push({
      start: activeOverride.startAt.toISOString(),
      end: activeOverride.endAt.toISOString(),
      reason: "Override user not in participant list",
    });
  }

  return c.json({
    success: true,
    data: {
      gaps,
      hasGaps: gaps.length > 0,
    },
  });
});

// Calendar-style view (upcoming shifts)
oncallRoutes.get("/rotations/:id/calendar", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();
  const days = parseInt(c.req.query("days") || "7");

  const rotation = await db.query.oncallRotations.findFirst({
    where: and(eq(oncallRotations.id, id), eq(oncallRotations.organizationId, organizationId)),
  });

  if (!rotation) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  const schedule: Array<{ userId: string; start: string; end: string }> = [];
  const start = rotation.rotationStart;
  const shiftMs = rotation.shiftDurationMinutes * 60 * 1000;
  const horizon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  let cursor = new Date(start);
  let participantIdx = 0;

  while (cursor < horizon && rotation.participants.length > 0) {
    const next = new Date(cursor.getTime() + shiftMs);
    const userId = rotation.participants[participantIdx % rotation.participants.length];
    if (!userId) {
      participantIdx++;
      cursor = next;
      continue;
    }
    schedule.push({
      userId,
      start: cursor.toISOString(),
      end: next.toISOString(),
    });
    participantIdx++;
    cursor = next;
  }

  // Expand overrides onto schedule
  const overrides = await db.query.oncallOverrides.findMany({
    where: and(eq(oncallOverrides.rotationId, id), gte(oncallOverrides.endAt, new Date())),
  });

  return c.json({
    success: true,
    data: {
      schedule,
      overrides,
    },
  });
});

// Get current on-call person for a specific rotation
oncallRoutes.get("/rotations/:id/current", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const rotation = await db.query.oncallRotations.findFirst({
    where: and(eq(oncallRotations.id, id), eq(oncallRotations.organizationId, organizationId)),
    with: { overrides: true },
  });

  if (!rotation) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  if (!rotation.active || rotation.participants.length === 0) {
    return c.json({
      success: true,
      data: {
        currentUserId: null,
        isOverride: false,
        shiftStart: null,
        shiftEnd: null,
        reason: !rotation.active ? "Rotation is inactive" : "No participants configured",
      },
    });
  }

  const now = new Date();
  const shiftMs = rotation.shiftDurationMinutes * 60 * 1000;
  const rotationStart = rotation.rotationStart;

  // Check for active override first
  const activeOverride = rotation.overrides.find(
    (o) => o.startAt <= now && o.endAt >= now
  );

  if (activeOverride) {
    return c.json({
      success: true,
      data: {
        currentUserId: activeOverride.userId,
        isOverride: true,
        shiftStart: activeOverride.startAt.toISOString(),
        shiftEnd: activeOverride.endAt.toISOString(),
        overrideReason: activeOverride.reason,
      },
    });
  }

  // Calculate current shift based on rotation schedule
  const elapsedMs = now.getTime() - rotationStart.getTime();
  const currentShiftIndex = Math.floor(elapsedMs / shiftMs);
  const participantIndex = currentShiftIndex % rotation.participants.length;
  const shiftStartMs = rotationStart.getTime() + currentShiftIndex * shiftMs;
  const shiftEndMs = shiftStartMs + shiftMs;

  return c.json({
    success: true,
    data: {
      currentUserId: rotation.participants[participantIndex],
      isOverride: false,
      shiftStart: new Date(shiftStartMs).toISOString(),
      shiftEnd: new Date(shiftEndMs).toISOString(),
    },
  });
});

// Get all currently on-call users across all active rotations
oncallRoutes.get("/current", async (c) => {
  const organizationId = await requireOrganization(c);

  const rotations = await db.query.oncallRotations.findMany({
    where: and(
      eq(oncallRotations.organizationId, organizationId),
      eq(oncallRotations.active, true)
    ),
    with: { overrides: true },
  });

  const now = new Date();
  const currentOncall: Array<{
    rotationId: string;
    rotationName: string;
    currentUserId: string;
    isOverride: boolean;
    shiftStart: string;
    shiftEnd: string;
  }> = [];

  for (const rotation of rotations) {
    if (rotation.participants.length === 0) continue;

    const shiftMs = rotation.shiftDurationMinutes * 60 * 1000;

    // Check for active override
    const activeOverride = rotation.overrides.find(
      (o) => o.startAt <= now && o.endAt >= now
    );

    if (activeOverride) {
      currentOncall.push({
        rotationId: rotation.id,
        rotationName: rotation.name,
        currentUserId: activeOverride.userId,
        isOverride: true,
        shiftStart: activeOverride.startAt.toISOString(),
        shiftEnd: activeOverride.endAt.toISOString(),
      });
    } else {
      const elapsedMs = now.getTime() - rotation.rotationStart.getTime();
      const currentShiftIndex = Math.floor(elapsedMs / shiftMs);
      const participantIndex = currentShiftIndex % rotation.participants.length;
      const currentUserId = rotation.participants[participantIndex];
      if (!currentUserId) {
        continue;
      }
      const shiftStartMs = rotation.rotationStart.getTime() + currentShiftIndex * shiftMs;
      const shiftEndMs = shiftStartMs + shiftMs;

      currentOncall.push({
        rotationId: rotation.id,
        rotationName: rotation.name,
        currentUserId,
        isOverride: false,
        shiftStart: new Date(shiftStartMs).toISOString(),
        shiftEnd: new Date(shiftEndMs).toISOString(),
      });
    }
  }

  return c.json({ success: true, data: currentOncall });
});

// Handoff notification (manual trigger)
oncallRoutes.post("/rotations/:id/handoff", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const rotation = await db.query.oncallRotations.findFirst({
    where: and(eq(oncallRotations.id, id), eq(oncallRotations.organizationId, organizationId)),
  });

  if (!rotation) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  await db
    .update(oncallRotations)
    .set({ lastHandoffNotificationAt: new Date(), lastHandoffStart: new Date() })
    .where(eq(oncallRotations.id, id));

  return c.json({
    success: true,
    data: { notified: true, channels: rotation.handoffChannels },
  });
});
