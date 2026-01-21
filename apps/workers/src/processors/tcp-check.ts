import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import type { CheckStatus } from "@uni-status/shared/types";

interface TcpCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  regions: string[];
  assertions?: {
    tcpOptions?: {
      send?: string;
      expect?: string;
    };
  };
}

export async function processTcpCheck(job: Job<TcpCheckJob>) {
  const { monitorId, url, timeoutMs, regions, assertions } = job.data;
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const preferredRegion = regions[0] || defaultRegion;
  const region = preferredRegion === "us-east" && defaultRegion !== "us-east"
    ? defaultRegion
    : preferredRegion;
  const tcpOptions = assertions?.tcpOptions;

  console.log(`Processing TCP check for ${monitorId}: ${url}`);

  const { hostname, port } = parseTcpUrl(url);

  if (!hostname || !port) {
    return handleError(
      monitorId,
      region,
      "Invalid URL format. Expected: tcp://hostname:port or hostname:port",
      "INVALID_URL",
      0
    );
  }

  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let responseData: string | undefined;

  try {
    const socket = await Promise.race([
      new Promise<Awaited<ReturnType<typeof Bun.connect>>>((resolve, reject) => {
        let resolved = false;
        let dataBuffer = "";

        Bun.connect({
          hostname,
          port,
          socket: {
            data(socket, data) {
              dataBuffer += data.toString();
            },
            open(socket) {
              resolved = true;
              resolve(socket as any);
            },
            close(socket) {
              if (!resolved) {
                reject(new Error("Connection closed before opening"));
              }
            },
            error(socket, error) {
              reject(error);
            },
            connectError(socket, error) {
              reject(error);
            },
          },
        }).catch(reject);
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out")), timeoutMs)
      ),
    ]);

    responseTimeMs = Math.round(performance.now() - startTime);

    // If send data is specified, send it and wait for response
    if (tcpOptions?.send && socket) {
      socket.write(tcpOptions.send);

      // Wait briefly for response
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Check expected response pattern
    if (tcpOptions?.expect && responseData) {
      const regex = new RegExp(tcpOptions.expect);
      if (!regex.test(responseData)) {
        status = "failure";
        errorMessage = `Response did not match expected pattern: ${tcpOptions.expect}`;
        errorCode = "PATTERN_MISMATCH";
      }
    }

    // Clean up
    if (socket) {
      socket.end();
    }
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      if (
        error.message.includes("timed out") ||
        error.message.includes("timeout")
      ) {
        status = "timeout";
        errorMessage = `Connection timed out after ${timeoutMs}ms`;
        errorCode = "TIMEOUT";
      } else if (error.message.includes("ECONNREFUSED")) {
        status = "failure";
        errorMessage = `Connection refused on port ${port}`;
        errorCode = "ECONNREFUSED";
      } else if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ENOENT") ||
        error.message.includes("getaddrinfo")
      ) {
        status = "failure";
        errorMessage = `Host not found: ${hostname}`;
        errorCode = "ENOTFOUND";
      } else if (error.message.includes("EHOSTUNREACH")) {
        status = "failure";
        errorMessage = `Host unreachable: ${hostname}`;
        errorCode = "EHOSTUNREACH";
      } else if (error.message.includes("ENETUNREACH")) {
        status = "failure";
        errorMessage = `Network unreachable`;
        errorCode = "ENETUNREACH";
      } else {
        status = "error";
        errorMessage = error.message;
        errorCode = error.name;
      }
    } else {
      status = "error";
      errorMessage = "Unknown TCP error occurred";
      errorCode = "UNKNOWN";
    }
  }

  // Store result
  const resultId = nanoid();

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs,
    tcpMs: responseTimeMs,
    errorMessage,
    errorCode,
    createdAt: new Date(),
  });

  // Link failed checks to active incidents
  await linkCheckToActiveIncident(resultId, monitorId, status);

  // Update monitor status
  const newStatus = status === "success" ? "active" : "down";

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

  console.log(
    `TCP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`
  );

  return {
    status,
    responseTimeMs,
  };
}

function parseTcpUrl(url: string): { hostname: string | null; port: number | null } {
  try {
    // Handle tcp:// prefix
    let cleanUrl = url;
    if (url.startsWith("tcp://")) {
      cleanUrl = url.replace("tcp://", "");
    }

    // Handle standard URL format (extract host and default ports)
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      return {
        hostname: parsed.hostname,
        port: parsed.port
          ? parseInt(parsed.port)
          : url.startsWith("https://")
            ? 443
            : 80,
      };
    }

    // Parse hostname:port format
    const [host, portStr] = cleanUrl.split(":");
    if (host && portStr) {
      const port = Number.parseInt(portStr, 10);
      if (!Number.isNaN(port) && port > 0 && port <= 65535) {
        return {
          hostname: host,
          port,
        };
      }
    }

    return { hostname: null, port: null };
  } catch {
    return { hostname: null, port: null };
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
  };
}
