import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, organizations, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { remoteWriteIngestSchema } from "@uni-status/shared/validators";
import { evaluateSliStatus } from "@uni-status/shared";
import type { CheckStatus } from "@uni-status/shared/types";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";

export const remoteWriteRoutes = new OpenAPIHono();

function getTokenFromRequest(c: any): string | null {
  const auth = c.req.header("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7);
  }
  const headerToken = c.req.header("x-remote-write-token");
  if (headerToken) return headerToken;
  return null;
}

remoteWriteRoutes.post("/:monitorId", async (c) => {
  const { monitorId } = c.req.param();

  const payload = remoteWriteIngestSchema.parse(await c.req.json());

  const monitor = await db.query.monitors.findFirst({
    where: eq(monitors.id, monitorId),
  });

  if (!monitor || monitor.type !== "prometheus_remote_write") {
    return c.json({ success: false, error: "Monitor not found or not remote-write type" }, 404);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, monitor.organizationId),
  });

  const token = org?.settings?.integrations?.prometheus?.remoteWriteToken;
  const providedToken = getTokenFromRequest(c);

  if (!token || !providedToken || token !== providedToken) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const promConfig = (monitor.config as { prometheus?: Record<string, unknown> } | null)?.prometheus || {};
  const thresholds = promConfig.thresholds as
    | {
        degraded?: number;
        down?: number;
        comparison?: "gte" | "lte";
        normalizePercent?: boolean;
      }
    | undefined;

  const remoteWriteConfig = promConfig.remoteWrite as
    | {
        regionLabel?: string;
      }
    | undefined;

  const regionLabelKey = remoteWriteConfig?.regionLabel || "region";

  const firstSeries = payload.series[0];
  if (!firstSeries || firstSeries.samples.length === 0) {
    return c.json({ success: false, error: "No samples provided" }, 400);
  }
  const lastSample = firstSeries.samples[firstSeries.samples.length - 1];
  if (!lastSample) {
    return c.json({ success: false, error: "No samples provided" }, 400);
  }
  const value = lastSample.value;
  const sampleTimestamp = lastSample.timestamp ? new Date(lastSample.timestamp) : new Date();

  const region = firstSeries.labels[regionLabelKey] || monitor.regions?.[0] || "custom";

  // SLO-aware status
  let sloTargetPercent: number | undefined;
  try {
    const { sloTargets } = await import("@uni-status/enterprise/database/schema");
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const sloTarget = await enterpriseDb.query.sloTargets.findFirst({
      where: eq(sloTargets.monitorId, monitorId),
    });
    sloTargetPercent = sloTarget ? Number(sloTarget.targetPercentage) : undefined;
  } catch {
    // Enterprise package not available, skip SLO-aware status
  }

  const status: CheckStatus = evaluateSliStatus(value, thresholds, sloTargetPercent);

  const resultId = nanoid();
  const now = new Date();

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs: null,
    errorMessage: status === "failure" ? "Remote write threshold breached" : undefined,
    createdAt: sampleTimestamp || now,
    metadata: {
      remoteWrite: {
        labels: firstSeries.labels,
        sampleCount: firstSeries.samples.length,
      },
      value,
    },
  });

  const monitorStatus = status === "success" ? "active" : status === "degraded" ? "degraded" : "down";
  await db
    .update(monitors)
    .set({
      status: monitorStatus,
      updatedAt: now,
      lastCheckedAt: now,
    })
    .where(eq(monitors.id, monitorId));

  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status,
      responseTimeMs: null,
      value,
      timestamp: now.toISOString(),
    },
  });

  await evaluateAlerts({
    monitor: { id: monitor.id, name: monitor.name, type: monitor.type },
    checkResult: {
      id: resultId,
      status,
      responseTimeMs: null,
      errorMessage: status === "failure" ? "Remote write threshold breached" : undefined,
      value,
    },
    organizationId: monitor.organizationId,
  });

  return c.json({
    success: true,
    data: {
      resultId,
      status,
    },
  });
});
