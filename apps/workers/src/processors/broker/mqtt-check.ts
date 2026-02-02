import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import mqtt from "mqtt";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "broker-mqtt-check" });


interface BrokerConfig extends Record<string, unknown> {
  host: string;
  port: number;
  username?: string;
  password?: string;
  ssl?: boolean;
  clientId?: string;
  topic?: string;
  qos?: 0 | 1 | 2;
}

interface MqttCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    broker?: BrokerConfig;
  };
}

export async function processMqttCheck(job: Job<MqttCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing MQTT check for ${monitorId}`);

  const brokerConfig = config?.broker;
  if (!brokerConfig) {
    log.error(`No broker config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing broker configuration" };
  }

  // Decrypt any encrypted secrets
  const decryptedConfig = await decryptConfigSecrets<BrokerConfig>(brokerConfig);

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();

  return new Promise<{ status: CheckStatus; responseTimeMs: number; errorMessage?: string }>((resolve) => {
    let status: CheckStatus = "success";
    let responseTimeMs = 0;
    let errorMessage: string | undefined;
    let errorCode: string | undefined;
    let client: mqtt.MqttClient | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = async (finalStatus: CheckStatus, finalError?: string, finalErrorCode?: string) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (client) {
        try {
          client.end(true);
        } catch {
          // Ignore cleanup errors
        }
        client = null;
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

      // Fetch monitor to get organizationId
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

      // Publish event
      await publishEvent(`monitor:${monitorId}`, {
        type: "monitor:check",
        data: {
          monitorId,
          status,
          responseTimeMs,
          timestamp: now.toISOString(),
        },
      });

      // Evaluate alerts
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

      log.info(`MQTT check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

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
      // Build connection URL
      const protocol = decryptedConfig.ssl ? "mqtts" : "mqtt";
      const brokerUrl = `${protocol}://${decryptedConfig.host}:${decryptedConfig.port}`;

      // Build client options
      const clientOptions: mqtt.IClientOptions = {
        clientId: decryptedConfig.clientId || `uni-status-probe-${nanoid(8)}`,
        connectTimeout: timeoutMs,
        reconnectPeriod: 0,  // Don't reconnect
        clean: true,
        rejectUnauthorized: false,  // Allow self-signed certs
      };

      // Add authentication if provided
      if (decryptedConfig.username) {
        clientOptions.username = decryptedConfig.username;
      }
      if (decryptedConfig.password) {
        clientOptions.password = decryptedConfig.password;
      }

      client = mqtt.connect(brokerUrl, clientOptions);

      client.on("connect", async () => {
        log.info(`MQTT connected to ${brokerUrl}`);

        // If a topic is specified, try to subscribe
        if (decryptedConfig.topic && client) {
          const qos = decryptedConfig.qos ?? 0;
          client.subscribe(decryptedConfig.topic, { qos }, (err) => {
            if (err) {
              cleanup("failure", `Subscribe failed: ${err.message}`, "SUBSCRIBE_FAILED");
            } else {
              // Unsubscribe and disconnect
              client?.unsubscribe(decryptedConfig.topic!, () => {
                cleanup("success");
              });
            }
          });
        } else {
          // No topic specified, connection is enough
          await cleanup("success");
        }
      });

      client.on("error", (err) => {
        const errMessage = err.message || "Unknown MQTT error";

        if (errMessage.includes("ECONNREFUSED")) {
          cleanup("failure", errMessage, "CONNECTION_REFUSED");
        } else if (errMessage.includes("ENOTFOUND") || errMessage.includes("getaddrinfo")) {
          cleanup("failure", errMessage, "HOST_NOT_FOUND");
        } else if (errMessage.includes("Not authorized") || errMessage.includes("bad user name or password")) {
          cleanup("failure", errMessage, "AUTH_FAILED");
        } else if (errMessage.includes("certificate") || errMessage.includes("SSL") || errMessage.includes("TLS")) {
          cleanup("failure", errMessage, "SSL_ERROR");
        } else if (errMessage.includes("timeout") || errMessage.includes("ETIMEDOUT")) {
          cleanup("timeout", errMessage, "TIMEOUT");
        } else {
          cleanup("error", errMessage, "UNKNOWN");
        }
      });

      client.on("close", () => {
        if (!resolved) {
          cleanup("failure", "Connection closed unexpectedly", "CONNECTION_CLOSED");
        }
      });

      client.on("offline", () => {
        if (!resolved) {
          cleanup("failure", "Client went offline", "OFFLINE");
        }
      });

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      cleanup("error", errMessage, "UNKNOWN");
    }
  });
}
