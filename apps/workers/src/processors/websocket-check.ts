import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import type { CheckStatus } from "@uni-status/shared/types";
import WebSocket from "ws";

interface WebSocketConfig {
  messageToSend?: string;
  expectedResponse?: string;
  subprotocol?: string;
  headers?: Record<string, string>;
}

interface WebSocketCheckJob {
  monitorId: string;
  url: string;  // ws:// or wss:// URL
  timeoutMs: number;
  config?: {
    websocket?: WebSocketConfig;
  };
}

export async function processWebSocketCheck(job: Job<WebSocketCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  console.log(`Processing WebSocket check for ${monitorId}`);

  const wsConfig = config?.websocket || {};
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  return new Promise<{ status: CheckStatus; responseTimeMs: number; errorMessage?: string }>((resolve) => {
    let ws: WebSocket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = async (finalStatus: CheckStatus, finalError?: string, finalErrorCode?: string) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignore cleanup errors
        }
        ws = null;
      }

      responseTimeMs = Math.round(performance.now() - startTime);
      status = finalStatus;
      errorMessage = finalError;
      errorCode = finalErrorCode;

      // Store result
      const resultId = nanoid();
      const now = new Date();

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

      console.log(`WebSocket check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

      resolve({
        status,
        responseTimeMs,
        errorMessage,
      });
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup("timeout", "Connection timeout", "TIMEOUT");
    }, timeoutMs);

    try {
      // Build WebSocket options
      const wsOptions: WebSocket.ClientOptions = {
        handshakeTimeout: timeoutMs,
        headers: wsConfig.headers,
      };

      // Create WebSocket connection
      ws = new WebSocket(url, wsConfig.subprotocol ? [wsConfig.subprotocol] : undefined, wsOptions);

      ws.on("open", async () => {
        console.log(`WebSocket connected to ${url}`);

        // If we need to send a message and expect a response
        if (wsConfig.messageToSend) {
          ws!.send(wsConfig.messageToSend);
        } else if (!wsConfig.expectedResponse) {
          // No message to send and no response expected - just connection check
          await cleanup("success");
        }
      });

      ws.on("message", async (data) => {
        const message = data.toString();

        if (wsConfig.expectedResponse) {
          // Check if response matches expected
          if (message.includes(wsConfig.expectedResponse)) {
            await cleanup("success");
          } else {
            await cleanup("failure", `Unexpected response: ${message.substring(0, 100)}`, "INVALID_RESPONSE");
          }
        } else if (wsConfig.messageToSend) {
          // We sent a message, got a response, consider it success
          await cleanup("success");
        }
      });

      ws.on("error", async (err) => {
        const errMessage = err.message || "Unknown WebSocket error";

        if (errMessage.includes("ECONNREFUSED")) {
          await cleanup("failure", errMessage, "CONNECTION_REFUSED");
        } else if (errMessage.includes("ENOTFOUND") || errMessage.includes("getaddrinfo")) {
          await cleanup("failure", errMessage, "HOST_NOT_FOUND");
        } else if (errMessage.includes("certificate") || errMessage.includes("SSL") || errMessage.includes("TLS")) {
          await cleanup("failure", errMessage, "SSL_ERROR");
        } else if (errMessage.includes("401") || errMessage.includes("403")) {
          await cleanup("failure", errMessage, "AUTH_FAILED");
        } else if (errMessage.includes("404")) {
          await cleanup("failure", errMessage, "NOT_FOUND");
        } else if (errMessage.includes("timeout")) {
          await cleanup("timeout", errMessage, "TIMEOUT");
        } else {
          await cleanup("error", errMessage, "UNKNOWN");
        }
      });

      ws.on("close", async (code, reason) => {
        // If we haven't already resolved, this is an unexpected close
        if (!resolved) {
          if (code === 1000 || code === 1001) {
            // Normal closure after our operations
            await cleanup("success");
          } else {
            await cleanup("failure", `Connection closed: ${code} - ${reason.toString()}`, "CONNECTION_CLOSED");
          }
        }
      });

      // If we only need to check connection (no message to send, no response expected)
      // Give a small window for connection to establish
      if (!wsConfig.messageToSend && !wsConfig.expectedResponse) {
        setTimeout(async () => {
          if (!resolved && ws && ws.readyState === WebSocket.OPEN) {
            await cleanup("success");
          }
        }, 100);
      }

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      cleanup("error", errMessage, "UNKNOWN");
    }
  });
}
