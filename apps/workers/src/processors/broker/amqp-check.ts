import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import amqp from "amqplib";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "broker-amqp-check" });


interface BrokerConfig extends Record<string, unknown> {
  host: string;
  port: number;
  username?: string;
  password?: string;
  ssl?: boolean;
  vhost?: string;
  queue?: string;
}

interface AmqpCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    broker?: BrokerConfig;
  };
}

export async function processAmqpCheck(job: Job<AmqpCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing AMQP check for ${monitorId}`);

  const brokerConfig = config?.broker;
  if (!brokerConfig) {
    log.error(`No broker config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing broker configuration" };
  }

  // Decrypt any encrypted secrets
  const decryptedConfig = await decryptConfigSecrets<BrokerConfig>(brokerConfig);

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  let connection: amqp.ChannelModel | null = null;
  let channel: amqp.Channel | null = null;

  try {
    // Build connection URL
    const protocol = decryptedConfig.ssl ? "amqps" : "amqp";
    const username = decryptedConfig.username ? encodeURIComponent(decryptedConfig.username) : "guest";
    const password = decryptedConfig.password ? encodeURIComponent(decryptedConfig.password) : "guest";
    const vhost = decryptedConfig.vhost ? encodeURIComponent(decryptedConfig.vhost) : "";

    const connectionUrl = `${protocol}://${username}:${password}@${decryptedConfig.host}:${decryptedConfig.port}/${vhost}`;

    // Connect with timeout
    const connectPromise = amqp.connect(connectionUrl, {
      timeout: timeoutMs,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
    );

    const activeConnection = await Promise.race([connectPromise, timeoutPromise]);
    connection = activeConnection;

    log.info(`AMQP connected to ${decryptedConfig.host}:${decryptedConfig.port}`);

    // Create a channel to verify full connectivity
    const activeChannel = await activeConnection.createChannel();
    channel = activeChannel;

    // If a queue is specified, try to check it
    if (decryptedConfig.queue) {
      try {
        const queueInfo = await activeChannel.checkQueue(decryptedConfig.queue);
        log.info(`AMQP queue ${decryptedConfig.queue} exists with ${queueInfo.messageCount} messages`);
      } catch (queueError) {
        // Queue doesn't exist - this is a failure condition if queue was specified
        if (queueError instanceof Error && queueError.message.includes("NOT_FOUND")) {
          status = "failure";
          errorMessage = `Queue not found: ${decryptedConfig.queue}`;
          errorCode = "QUEUE_NOT_FOUND";
        } else {
          throw queueError;
        }
      }
    }

    responseTimeMs = Math.round(performance.now() - startTime);

    // Close channel and connection
    await activeChannel.close();
    channel = null;
    await activeConnection.close();
    connection = null;

  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      errorMessage = error.message;

      // Classify error codes
      if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
        status = "timeout";
        errorCode = "TIMEOUT";
      } else if (error.message.includes("ECONNREFUSED")) {
        status = "failure";
        errorCode = "CONNECTION_REFUSED";
      } else if (error.message.includes("ENOTFOUND") || error.message.includes("getaddrinfo")) {
        status = "failure";
        errorCode = "HOST_NOT_FOUND";
      } else if (error.message.includes("ACCESS_REFUSED") || error.message.includes("PRECONDITION_FAILED") ||
                 error.message.includes("credentials") || error.message.includes("403")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else if (error.message.includes("NOT_FOUND")) {
        status = "failure";
        errorCode = "VHOST_NOT_FOUND";
      } else if (error.message.includes("certificate") || error.message.includes("SSL") || error.message.includes("TLS")) {
        status = "failure";
        errorCode = "SSL_ERROR";
      } else if (error.message.includes("Channel closed") || error.message.includes("Connection closed")) {
        status = "failure";
        errorCode = "CONNECTION_CLOSED";
      } else {
        status = "error";
        errorCode = "UNKNOWN";
      }
    } else {
      status = "error";
      errorMessage = "Unknown error occurred";
      errorCode = "UNKNOWN";
    }

    // Clean up on error
    if (channel) {
      try {
        await channel.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

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
  const newStatus = status === "success" ? "active" : "down";

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

  log.info(`AMQP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
