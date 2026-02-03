import { Job } from "bullmq";
import { nanoid } from "nanoid";
import ping from "ping";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import type { CheckStatus } from "@uni-status/shared/types";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "ping-check" });


interface PingCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  regions: string[];
  assertions?: {
    pingOptions?: {
      packetCount?: number;
      packetSize?: number;
    };
  };
}

export async function processPingCheck(job: Job<PingCheckJob>) {
  const { monitorId, url, timeoutMs, regions, assertions } = job.data;
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const preferredRegion = regions[0] || defaultRegion;
  const region = preferredRegion === "us-east" && defaultRegion !== "us-east"
    ? defaultRegion
    : preferredRegion;
  const pingOptions = assertions?.pingOptions;

  log.info(`Processing Ping check for ${monitorId}: ${url}`);

  const hostname = extractHostname(url);

  if (!hostname) {
    return handleError(monitorId, region, "Invalid hostname", "INVALID_HOST", 0);
  }

  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let packetLoss = 0;

  try {
    const result = await ping.promise.probe(hostname, {
      timeout: Math.ceil(timeoutMs / 1000),
      min_reply: pingOptions?.packetCount || 3,
    });

    responseTimeMs = Math.round(performance.now() - startTime);

    if (!result.alive) {
      status = "failure";
      errorMessage = "Host is not responding to ping";
      errorCode = "HOST_DOWN";
      packetLoss = 100;
    } else {
      // Parse timing information
      if (typeof result.time === "number") {
        responseTimeMs = Math.round(result.time);
      }

      // Parse packet loss from output if available
      if (result.packetLoss !== undefined) {
        packetLoss = parseFloat(String(result.packetLoss)) || 0;
      }

      // Parse min/avg/max from output if available (platform-specific)
      if (result.output) {
        // Linux/Mac format: min/avg/max/mdev = X/X/X/X ms
        const rttMatch = result.output.match(
          /min\/avg\/max\/?(?:mdev)?\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/
        );
        const avgRttValue = rttMatch?.[2];
        if (avgRttValue) {
          const avgRtt = parseFloat(avgRttValue);
          responseTimeMs = Math.round(avgRtt);
        }

        // Windows format: Minimum = Xms, Maximum = Xms, Average = Xms
        const winMatch = result.output.match(
          /Average\s*=\s*(\d+)ms/i
        );
        const winAvg = winMatch?.[1];
        if (winAvg) {
          responseTimeMs = parseInt(winAvg, 10);
        }

        // Parse packet loss from output
        const lossMatch = result.output.match(/(\d+(?:\.\d+)?)\s*%\s*(?:packet\s+)?loss/i);
        const lossValue = lossMatch?.[1];
        if (lossValue) {
          packetLoss = parseFloat(lossValue);
        }
      }

      // Degraded if packet loss is between 0 and 100%
      if (packetLoss > 0 && packetLoss < 100) {
        status = "degraded";
        errorMessage = `${packetLoss}% packet loss detected`;
      }
    }
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      if (
        error.message.includes("timed out") ||
        error.message.includes("timeout")
      ) {
        status = "timeout";
        errorMessage = `Ping timed out after ${timeoutMs}ms`;
        errorCode = "TIMEOUT";
      } else {
        status = "error";
        errorMessage = error.message;
        errorCode = error.name;
      }
    } else {
      status = "error";
      errorMessage = "Unknown ping error occurred";
      errorCode = "UNKNOWN";
    }
    packetLoss = 100;
  }

  // Store result
  const resultId = nanoid();

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs,
    errorMessage,
    errorCode,
    createdAt: new Date(),
  });

  // Link failed checks to active incidents
  await linkCheckToActiveIncident(resultId, monitorId, status);

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
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitorId));

  // Fetch monitor to get organizationId for alert evaluation
  const monitor = await db
    .select({ organizationId: monitors.organizationId })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  // Publish event for real-time updates
  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status,
      responseTimeMs,
      packetLoss,
      timestamp: new Date().toISOString(),
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

  log.info(
    `Ping check completed for ${monitorId}: ${status} (${responseTimeMs}ms, ${packetLoss}% loss)`
  );

  return {
    status,
    responseTimeMs,
    packetLoss,
  };
}

function extractHostname(url: string): string | null {
  try {
    // If it's a URL, extract hostname
    if (url.includes("://")) {
      const parsed = new URL(url);
      return parsed.hostname;
    }

    // If it contains a port, strip it
    if (url.includes(":")) {
      return url.split(":")[0] || null;
    }

    // Assume it's already a hostname or IP
    return url.trim() || null;
  } catch {
    return null;
  }
}

async function handleError(
  monitorId: string,
  region: string,
  errorMessage: string,
  errorCode: string,
  responseTimeMs: number
) {
  const resultId = nanoid();

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status: "error",
    responseTimeMs,
    errorMessage,
    errorCode,
    createdAt: new Date(),
  });

  // Link failed checks to active incidents
  await linkCheckToActiveIncident(resultId, monitorId, "error");

  // Fetch monitor to get organizationId for alert evaluation
  const monitor = await db
    .select({ organizationId: monitors.organizationId })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  await db
    .update(monitors)
    .set({
      status: "down",
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitorId));

  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status: "error",
      responseTimeMs,
      errorMessage,
      timestamp: new Date().toISOString(),
    },
  });

  // Evaluate alert policies for this monitor
  if (monitor[0]) {
    await evaluateAlerts({
      monitorId,
      organizationId: monitor[0].organizationId,
      checkResultId: resultId,
      checkStatus: "error",
      errorMessage,
      responseTimeMs,
    });
  }

  return {
    status: "error" as CheckStatus,
    responseTimeMs,
    packetLoss: 100,
  };
}
