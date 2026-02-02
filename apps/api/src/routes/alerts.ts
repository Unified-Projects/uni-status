import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { alertChannels, alertPolicies, alertHistory, monitorAlertPolicies, organizations, users } from "@uni-status/database/schema";
import { createAlertChannelSchema, updateAlertChannelSchema, createAlertPolicySchema, updateAlertPolicySchema } from "@uni-status/shared/validators";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { decryptConfigSecrets } from "@uni-status/shared/lib/crypto";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";
import { requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { queueTestNotification } from "../lib/queues";
import { createAuditLog, createAuditLogWithChanges, getAuditUserId } from "../lib/audit";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: 'alerts-routes' });

export const alertsRoutes = new OpenAPIHono();

// === Alert Channels ===

alertsRoutes.get("/channels", async (c) => {
  const organizationId = await requireOrganization(c);

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertChannels)
    .where(eq(alertChannels.organizationId, organizationId));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.alertChannels.findMany({
    where: eq(alertChannels.organizationId, organizationId),
    orderBy: [desc(alertChannels.createdAt)],
    limit,
    offset,
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

alertsRoutes.post("/channels", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createAlertChannelSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  const [channel] = await db
    .insert(alertChannels)
    .values({
      id,
      organizationId,
      ...validated,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!channel) {
    throw new HTTPException(500, { message: "Failed to create alert channel" });
  }

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "config:channel_created",
    data: { id: channel.id, name: channel.name, type: channel.type },
    timestamp: now.toISOString(),
  });

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "alert_channel.create",
    resourceType: "alert_channel",
    resourceId: channel.id,
    resourceName: channel.name,
    metadata: { after: { name: channel.name, type: channel.type, enabled: channel.enabled } },
  });

  return c.json(
    {
      success: true,
      data: channel,
    },
    201
  );
});

alertsRoutes.patch("/channels/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateAlertChannelSchema.parse(body);
  const now = new Date();

  // Get existing channel for audit
  const existingChannel = await db.query.alertChannels.findFirst({
    where: and(eq(alertChannels.id, id), eq(alertChannels.organizationId, organizationId)),
  });

  if (!existingChannel) {
    throw new HTTPException(404, { message: "Channel not found" });
  }

  const [channel] = await db
    .update(alertChannels)
    .set({
      ...validated,
      updatedAt: now,
    })
    .where(
      and(
        eq(alertChannels.id, id),
        eq(alertChannels.organizationId, organizationId)
      )
    )
    .returning();

  if (!channel) {
    throw new HTTPException(500, { message: "Failed to update alert channel" });
  }

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "config:channel_updated",
    data: { id: channel.id, name: channel.name, type: channel.type },
    timestamp: now.toISOString(),
  });

  await createAuditLogWithChanges(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "alert_channel.update",
    resourceType: "alert_channel",
    resourceId: channel.id,
    resourceName: channel.name,
    before: { name: existingChannel.name, type: existingChannel.type, enabled: existingChannel.enabled },
    after: { name: channel.name, type: channel.type, enabled: channel.enabled },
  });

  return c.json({
    success: true,
    data: channel,
  });
});

alertsRoutes.delete("/channels/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Get channel info for audit
  const existingChannel = await db.query.alertChannels.findFirst({
    where: and(eq(alertChannels.id, id), eq(alertChannels.organizationId, organizationId)),
  });

  if (!existingChannel) {
    throw new Error("Not found");
  }

  const result = await db
    .delete(alertChannels)
    .where(
      and(
        eq(alertChannels.id, id),
        eq(alertChannels.organizationId, organizationId)
      )
    )
    .returning();

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "config:channel_deleted",
    data: { id },
    timestamp: new Date().toISOString(),
  });

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "alert_channel.delete",
    resourceType: "alert_channel",
    resourceId: id,
    resourceName: existingChannel.name,
    metadata: { before: { name: existingChannel.name, type: existingChannel.type } },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

alertsRoutes.post("/channels/:id/test", async (c) => {
  const auth = c.get("auth");
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const channel = await db.query.alertChannels.findFirst({
    where: and(
      eq(alertChannels.id, id),
      eq(alertChannels.organizationId, organizationId)
    ),
  });

  if (!channel) {
    throw new Error("Not found");
  }

  // Get current user's email for test notification
  let currentUserEmail: string | undefined;
  if (auth.user?.id) {
    const user = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, auth.user.id))
      .limit(1);
    currentUserEmail = user[0]?.email;
  }

  // Fetch org credentials for email notifications (BYO SMTP/Resend)
  let orgCredentials: OrganizationCredentials | undefined;
  if (channel.type === "email") {
    const org = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org[0]?.settings?.credentials) {
      try {
        orgCredentials = await decryptConfigSecrets(org[0].settings.credentials);
      } catch (error) {
        log.error({ organizationId, err: error }, 'Error decrypting org credentials for test');
      }
    }
  }

  const jobId = await queueTestNotification(
    {
      id: channel.id,
      type: channel.type,
      config: channel.config as Record<string, unknown>,
    },
    orgCredentials,
    currentUserEmail
  );

  return c.json({
    success: true,
    data: { queued: true, jobId },
  });
});

// === Alert Policies ===

alertsRoutes.get("/policies", async (c) => {
  const organizationId = await requireOrganization(c);

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertPolicies)
    .where(eq(alertPolicies.organizationId, organizationId));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.alertPolicies.findMany({
    where: eq(alertPolicies.organizationId, organizationId),
    orderBy: [desc(alertPolicies.createdAt)],
    limit,
    offset,
    with: {
      monitorLinks: {
        columns: { monitorId: true },
      },
    },
  });

  return c.json({
    success: true,
    data: result.map(({ monitorLinks, ...policy }) => ({
      ...policy,
      monitorIds: monitorLinks?.map((link) => link.monitorId) ?? [],
    })),
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + result.length < total,
    },
  });
});

alertsRoutes.get("/policies/monitor-counts", async (c) => {
  const organizationId = await requireOrganization(c);

  const counts = await db
    .select({
      policyId: monitorAlertPolicies.policyId,
      count: sql<number>`count(*)::int`,
    })
    .from(monitorAlertPolicies)
    .innerJoin(alertPolicies, eq(alertPolicies.id, monitorAlertPolicies.policyId))
    .where(eq(alertPolicies.organizationId, organizationId))
    .groupBy(monitorAlertPolicies.policyId);

  const countMap: Record<string, number> = {};
  for (const row of counts) {
    countMap[row.policyId] = row.count;
  }

  return c.json({
    success: true,
    data: countMap,
  });
});

alertsRoutes.post("/policies", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createAlertPolicySchema.parse(body);
  const { monitorIds, ...policyData } = validated;

  const id = nanoid();
  const now = new Date();

  const [policy] = await db.transaction(async (tx) => {
    const [createdPolicy] = await tx
      .insert(alertPolicies)
      .values({
        id,
        organizationId,
        ...policyData,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!createdPolicy) return [];

    const uniqueMonitorIds = Array.from(new Set(monitorIds ?? []));
    if (uniqueMonitorIds.length > 0) {
      await tx.insert(monitorAlertPolicies).values(
        uniqueMonitorIds.map((monitorId) => ({
          id: nanoid(),
          monitorId,
          policyId: createdPolicy.id,
          createdAt: now,
        }))
      );
    }

    return [createdPolicy];
  });

  if (!policy) {
    throw new HTTPException(500, { message: "Failed to create alert policy" });
  }

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "config:policy_created",
    data: { id: policy.id, name: policy.name },
    timestamp: now.toISOString(),
  });

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "alert_policy.create",
    resourceType: "alert_policy",
    resourceId: policy.id,
    resourceName: policy.name,
    metadata: { after: { name: policy.name, enabled: policy.enabled, cooldownMinutes: policy.cooldownMinutes } },
  });

  return c.json(
    {
      success: true,
      data: policy,
    },
    201
  );
});

alertsRoutes.patch("/policies/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateAlertPolicySchema.parse(body);
  const { monitorIds, ...policyData } = validated;
  const now = new Date();

  // Get existing policy for audit
  const existingPolicy = await db.query.alertPolicies.findFirst({
    where: and(eq(alertPolicies.id, id), eq(alertPolicies.organizationId, organizationId)),
  });

  if (!existingPolicy) {
    throw new Error("Not found");
  }

  const [policy] = await db.transaction(async (tx) => {
    const [updatedPolicy] = await tx
      .update(alertPolicies)
      .set({
        ...policyData,
        updatedAt: now,
      })
      .where(
        and(
          eq(alertPolicies.id, id),
          eq(alertPolicies.organizationId, organizationId)
        )
      )
      .returning();

    if (!updatedPolicy) return [];

    if (monitorIds !== undefined) {
      await tx
        .delete(monitorAlertPolicies)
        .where(eq(monitorAlertPolicies.policyId, updatedPolicy.id));

      const uniqueMonitorIds = Array.from(new Set(monitorIds));
      if (uniqueMonitorIds.length > 0) {
        await tx.insert(monitorAlertPolicies).values(
          uniqueMonitorIds.map((monitorId) => ({
            id: nanoid(),
            monitorId,
            policyId: updatedPolicy.id,
            createdAt: now,
          }))
        );
      }
    }

    return [updatedPolicy];
  });

  if (!policy) {
    throw new HTTPException(500, { message: "Failed to update alert policy" });
  }

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "config:policy_updated",
    data: { id: policy.id, name: policy.name },
    timestamp: now.toISOString(),
  });

  await createAuditLogWithChanges(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "alert_policy.update",
    resourceType: "alert_policy",
    resourceId: policy.id,
    resourceName: policy.name,
    before: { name: existingPolicy.name, enabled: existingPolicy.enabled, cooldownMinutes: existingPolicy.cooldownMinutes },
    after: { name: policy.name, enabled: policy.enabled, cooldownMinutes: policy.cooldownMinutes },
  });

  return c.json({
    success: true,
    data: policy,
  });
});

alertsRoutes.delete("/policies/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Get policy info for audit
  const existingPolicy = await db.query.alertPolicies.findFirst({
    where: and(eq(alertPolicies.id, id), eq(alertPolicies.organizationId, organizationId)),
  });

  if (!existingPolicy) {
    throw new Error("Not found");
  }

  const result = await db
    .delete(alertPolicies)
    .where(
      and(
        eq(alertPolicies.id, id),
        eq(alertPolicies.organizationId, organizationId)
      )
    )
    .returning();

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "config:policy_deleted",
    data: { id },
    timestamp: new Date().toISOString(),
  });

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "alert_policy.delete",
    resourceType: "alert_policy",
    resourceId: id,
    resourceName: existingPolicy.name,
    metadata: { before: { name: existingPolicy.name, enabled: existingPolicy.enabled } },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// === Alert History ===

alertsRoutes.get("/history", async (c) => {
  const organizationId = await requireOrganization(c);

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);
  const status = c.req.query("status");

  const conditions = [eq(alertHistory.organizationId, organizationId)];
  if (status) {
    conditions.push(eq(alertHistory.status, status as "triggered" | "acknowledged" | "resolved"));
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertHistory)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);

  const result = await db.query.alertHistory.findMany({
    where: and(...conditions),
    orderBy: [desc(alertHistory.triggeredAt)],
    limit,
    offset,
    with: {
      monitor: true,
      policy: true,
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

alertsRoutes.post("/history/:id/acknowledge", async (c) => {
  const auth = c.get("auth");
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const now = new Date();

  const [alert] = await db
    .update(alertHistory)
    .set({
      status: "acknowledged",
      acknowledgedAt: now,
      acknowledgedBy: auth.user?.id || auth.apiKey?.id,
    })
    .where(
      and(
        eq(alertHistory.id, id),
        eq(alertHistory.organizationId, organizationId)
      )
    )
    .returning();

  if (!alert) {
    throw new Error("Not found");
  }

  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "alert:acknowledged",
    data: {
      id: alert.id,
      monitorId: alert.monitorId,
      policyId: alert.policyId,
      status: "acknowledged",
      acknowledgedBy: auth.user?.id || auth.apiKey?.id,
    },
    timestamp: now.toISOString(),
  });

  return c.json({
    success: true,
    data: alert,
  });
});
