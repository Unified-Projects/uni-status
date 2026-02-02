import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults, heartbeatPings } from "@uni-status/database/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import type { CheckStatus } from "@uni-status/shared/types";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "heartbeat-check" });


interface HeartbeatCheckJob {
  monitorId: string;
  config: {
    heartbeat?: {
      expectedInterval: number;  // seconds between expected pings
      gracePeriod: number;       // grace period in seconds
      timezone?: string;
    };
  };
}

export async function processHeartbeatCheck(job: Job<HeartbeatCheckJob>) {
  const { monitorId, config } = job.data;

  log.info(`Processing heartbeat check for ${monitorId}`);

  const heartbeatConfig = config?.heartbeat;
  if (!heartbeatConfig) {
    log.error(`No heartbeat config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing heartbeat configuration" };
  }

  const { expectedInterval, gracePeriod = 60 } = heartbeatConfig;
  const now = new Date();
  const startTime = performance.now();

  let status: CheckStatus = "success";
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let responseTimeMs = 0;

  try {
    // Get the most recent heartbeat ping for this monitor
    const lastPing = await db.query.heartbeatPings.findFirst({
      where: eq(heartbeatPings.monitorId, monitorId),
      orderBy: [desc(heartbeatPings.createdAt)],
    });

    responseTimeMs = Math.round(performance.now() - startTime);

    if (!lastPing) {
      // No pings ever received
      status = "failure";
      errorMessage = "No heartbeat pings received yet";
      errorCode = "NO_PINGS";
    } else {
      const lastPingTime = new Date(lastPing.createdAt);
      const timeSinceLastPing = (now.getTime() - lastPingTime.getTime()) / 1000; // in seconds
      const threshold = expectedInterval + gracePeriod;

      if (timeSinceLastPing > threshold) {
        // Ping is overdue
        status = "failure";
        errorMessage = `Last heartbeat was ${Math.round(timeSinceLastPing)} seconds ago (expected every ${expectedInterval}s with ${gracePeriod}s grace)`;
        errorCode = "OVERDUE";
      } else if (timeSinceLastPing > expectedInterval) {
        // Within grace period but late
        status = "degraded";
        errorMessage = `Last heartbeat was ${Math.round(timeSinceLastPing)} seconds ago (expected every ${expectedInterval}s)`;
      } else {
        // On time
        status = "success";
      }

      // Check if the last ping indicated a failure
      if (lastPing.status === "fail") {
        status = "failure";
        errorMessage = lastPing.exitCode
          ? `Last heartbeat reported failure with exit code ${lastPing.exitCode}`
          : "Last heartbeat reported failure";
        errorCode = "JOB_FAILED";
      }
    }
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);
    status = "error";
    if (error instanceof Error) {
      errorMessage = error.message;
      errorCode = error.name;
    } else {
      errorMessage = "Unknown error occurred";
      errorCode = "UNKNOWN";
    }
  }

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

  // Fetch monitor to get organizationId for alert evaluation
  const monitor = await db
    .select({ organizationId: monitors.organizationId })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

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
  if (monitor[0]) {
    await evaluateAlerts({
      monitorId,
      organizationId: monitor[0].organizationId,
      checkResultId: resultId,
      checkStatus: status,
      errorMessage,
      responseTimeMs,
    });
  }

  log.info(`Heartbeat check completed for ${monitorId}: ${status}`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}

/**
 * Record a heartbeat ping from an external source.
 * This is called by the API when a heartbeat ping is received.
 */
export async function recordHeartbeatPing(
  monitorId: string,
  pingStatus: "start" | "complete" | "fail" = "complete",
  durationMs?: number,
  exitCode?: number,
  metadata?: Record<string, unknown>
): Promise<{ id: string; createdAt: Date }> {
  const id = nanoid();
  const now = new Date();

  await db.insert(heartbeatPings).values({
    id,
    monitorId,
    status: pingStatus,
    durationMs,
    exitCode,
    metadata,
    createdAt: now,
  });

  // Update the monitor's lastCheckedAt to reflect activity
  await db
    .update(monitors)
    .set({
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(monitors.id, monitorId));

  // Publish event for real-time updates
  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:heartbeat",
    data: {
      monitorId,
      pingStatus,
      durationMs,
      exitCode,
      timestamp: now.toISOString(),
    },
  });

  return { id, createdAt: now };
}

/**
 * Get heartbeat statistics for a monitor
 */
export async function getHeartbeatStats(
  monitorId: string,
  since?: Date
): Promise<{
  totalPings: number;
  successPings: number;
  failedPings: number;
  avgDurationMs: number | null;
  lastPingAt: Date | null;
}> {
  const cutoff = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours

  const pings = await db.query.heartbeatPings.findMany({
    where: and(
      eq(heartbeatPings.monitorId, monitorId),
      gte(heartbeatPings.createdAt, cutoff)
    ),
    orderBy: [desc(heartbeatPings.createdAt)],
  });

  const totalPings = pings.length;
  const successPings = pings.filter((p) => p.status === "complete").length;
  const failedPings = pings.filter((p) => p.status === "fail").length;

  const durationsWithValue = pings
    .filter((p) => p.durationMs !== null)
    .map((p) => p.durationMs!);

  const avgDurationMs =
    durationsWithValue.length > 0
      ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length
      : null;

  const lastPingAt = pings[0]?.createdAt ?? null;

  return {
    totalPings,
    successPings,
    failedPings,
    avgDurationMs,
    lastPingAt,
  };
}
