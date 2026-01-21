import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults, monitorDependencies } from "@uni-status/database/schema";
import { eq, and, inArray } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import type { CheckStatus } from "@uni-status/shared/types";

interface AggregateConfig {
  thresholdMode: "absolute" | "percentage";
  degradedThresholdCount?: number;
  downThresholdCount?: number;
  degradedThresholdPercent?: number;
  downThresholdPercent?: number;
  countDegradedAsDown?: boolean;
}

interface AggregateCheckJob {
  monitorId: string;
  organizationId?: string;
  config?: {
    aggregate?: AggregateConfig;
  };
}

export async function processAggregateCheck(job: Job<AggregateCheckJob>) {
  const { monitorId, config } = job.data;

  console.log(`Processing aggregate check for ${monitorId}`);

  // Fetch monitor to get organizationId and config if not provided
  const monitor = await db
    .select({
      organizationId: monitors.organizationId,
      config: monitors.config,
    })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  if (!monitor[0]) {
    console.error(`Monitor not found: ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Monitor not found" };
  }

  const organizationId = job.data.organizationId || monitor[0].organizationId;
  const monitorConfig = config || (monitor[0].config as { aggregate?: AggregateConfig } | null);

  const aggregateConfig = monitorConfig?.aggregate;
  if (!aggregateConfig) {
    console.error(`No aggregate config found for monitor ${monitorId}`);
    // Still update the monitor status so it doesn't stay pending forever
    const now = new Date();
    await db
      .update(monitors)
      .set({
        status: "down",
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(monitors.id, monitorId));

    // Store an error result
    await db.insert(checkResults).values({
      id: nanoid(),
      monitorId,
      region: process.env.MONITOR_DEFAULT_REGION || "uk",
      status: "error",
      responseTimeMs: 0,
      errorMessage: "Missing aggregate configuration. Please configure thresholds in monitor settings.",
      errorCode: "MISSING_CONFIG",
      createdAt: now,
    });

    return { status: "error" as CheckStatus, message: "Missing aggregate configuration" };
  }

  const startTime = performance.now();
  const now = new Date();

  let status: CheckStatus = "success";
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  try {
    // Get upstream dependencies from monitorDependencies table
    // The aggregate monitor is the "downstream" monitor, so we query for its upstream dependencies
    const dependencies = await db
      .select({ upstreamMonitorId: monitorDependencies.upstreamMonitorId })
      .from(monitorDependencies)
      .where(eq(monitorDependencies.downstreamMonitorId, monitorId));

    const targetMonitorIds = dependencies.map((d) => d.upstreamMonitorId);

    if (targetMonitorIds.length === 0) {
      status = "error";
      errorMessage = "No dependent monitors configured. Add dependencies to this aggregate monitor.";
      errorCode = "NO_DEPENDENCIES";
    } else {
      // Fetch current status of all target monitors
      const targetMonitors = await db
        .select({
          id: monitors.id,
          name: monitors.name,
          status: monitors.status,
        })
        .from(monitors)
        .where(
          and(
            eq(monitors.organizationId, organizationId),
            inArray(monitors.id, targetMonitorIds)
          )
        );

      // Count statuses
      const totalCount = targetMonitors.length;
      let downCount = 0;
      let degradedCount = 0;
      let activeCount = 0;
      let pausedCount = 0;

      for (const monitor of targetMonitors) {
        switch (monitor.status) {
          case "down":
            downCount++;
            break;
          case "degraded":
            degradedCount++;
            break;
          case "active":
            activeCount++;
            break;
          case "paused":
          case "pending":
            pausedCount++;
            break;
        }
      }

      // Calculate effective counts based on countDegradedAsDown option
      const effectiveDownCount = aggregateConfig.countDegradedAsDown
        ? downCount + degradedCount
        : downCount;
      const effectiveDegradedCount = aggregateConfig.countDegradedAsDown
        ? 0
        : degradedCount;

      // For threshold calculations, exclude paused/pending monitors
      const activeTotal = totalCount - pausedCount;

      if (activeTotal === 0) {
        // All monitors are paused/pending
        status = "success";
        errorMessage = "All dependent monitors are paused or pending";
      } else if (aggregateConfig.thresholdMode === "absolute") {
        // Absolute threshold mode
        if (
          aggregateConfig.downThresholdCount !== undefined &&
          effectiveDownCount >= aggregateConfig.downThresholdCount
        ) {
          status = "failure";
          errorMessage = `${effectiveDownCount} monitor(s) are down (threshold: ${aggregateConfig.downThresholdCount})`;
          errorCode = "DOWN_THRESHOLD_EXCEEDED";
        } else if (
          aggregateConfig.degradedThresholdCount !== undefined &&
          effectiveDegradedCount + effectiveDownCount >= aggregateConfig.degradedThresholdCount
        ) {
          status = "degraded";
          errorMessage = `${effectiveDegradedCount + effectiveDownCount} monitor(s) are degraded/down (threshold: ${aggregateConfig.degradedThresholdCount})`;
        }
      } else {
        // Percentage threshold mode
        const downPercent = (effectiveDownCount / activeTotal) * 100;
        const degradedPercent = ((effectiveDegradedCount + effectiveDownCount) / activeTotal) * 100;

        if (
          aggregateConfig.downThresholdPercent !== undefined &&
          downPercent >= aggregateConfig.downThresholdPercent
        ) {
          status = "failure";
          errorMessage = `${downPercent.toFixed(1)}% of monitors are down (threshold: ${aggregateConfig.downThresholdPercent}%)`;
          errorCode = "DOWN_PERCENT_EXCEEDED";
        } else if (
          aggregateConfig.degradedThresholdPercent !== undefined &&
          degradedPercent >= aggregateConfig.degradedThresholdPercent
        ) {
          status = "degraded";
          errorMessage = `${degradedPercent.toFixed(1)}% of monitors are degraded/down (threshold: ${aggregateConfig.degradedThresholdPercent}%)`;
        }
      }
    }
  } catch (error) {
    status = "error";
    if (error instanceof Error) {
      errorMessage = error.message;
      errorCode = error.name;
    } else {
      errorMessage = "Unknown error occurred during aggregate check";
      errorCode = "UNKNOWN";
    }
  }

  const responseTimeMs = Math.round(performance.now() - startTime);

  // Store result
  const resultId = nanoid();
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region: defaultRegion,
    status,
    responseTimeMs,
    errorMessage,
    errorCode,
    createdAt: now,
  });

  // Update monitor status
  const newStatus =
    status === "success"
      ? "active"
      : status === "degraded"
        ? "degraded"
        : "down";

  await db
    .update(monitors)
    .set({
      status: newStatus,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(monitors.id, monitorId));

  // Publish event for real-time updates
  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status,
      responseTimeMs,
      timestamp: now.toISOString(),
    },
  });

  // Evaluate alert policies for this monitor
  await evaluateAlerts({
    monitorId,
    organizationId,
    checkResultId: resultId,
    checkStatus: status,
    errorMessage,
    responseTimeMs,
  });

  console.log(`Aggregate check completed for ${monitorId}: ${status}`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
