import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import { Redis } from "ioredis";

interface DatabaseConfig extends Record<string, unknown> {
  host: string;
  port: number;
  database?: string;  // Redis database number (0-15)
  username?: string;
  password?: string;
  ssl?: boolean;
  query?: string;  // Not used for Redis, but kept for consistency
}

interface RedisCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    database?: DatabaseConfig;
  };
}

export async function processRedisCheck(job: Job<RedisCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  console.log(`Processing Redis check for ${monitorId}`);

  const dbConfig = config?.database;
  if (!dbConfig) {
    console.error(`No database config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing database configuration" };
  }

  // Decrypt any encrypted secrets
  const decryptedConfig = await decryptConfigSecrets<DatabaseConfig>(dbConfig);

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  let client: Redis | null = null;

  try {
    // Build connection config
    const redisOptions: Record<string, unknown> = {
      host: decryptedConfig.host,
      port: decryptedConfig.port,
      password: decryptedConfig.password || undefined,
      username: decryptedConfig.username || undefined,
      db: decryptedConfig.database ? parseInt(decryptedConfig.database) : 0,
      connectTimeout: timeoutMs,
      commandTimeout: timeoutMs,
      lazyConnect: true,
      maxRetriesPerRequest: 0,  // Don't retry, we want immediate failure
      retryStrategy: () => null,  // Don't retry connections
    };

    if (decryptedConfig.ssl) {
      redisOptions.tls = {};
    }

    client = new Redis(redisOptions);

    // Connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // Execute PING command
    const pong = await client.ping();

    responseTimeMs = Math.round(performance.now() - startTime);

    if (pong !== "PONG") {
      status = "failure";
      errorMessage = `Unexpected PING response: ${pong}`;
      errorCode = "INVALID_RESPONSE";
    }

    // Disconnect
    client.disconnect();
    client = null;

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
      } else if (error.message.includes("ENOTFOUND")) {
        status = "failure";
        errorCode = "HOST_NOT_FOUND";
      } else if (error.message.includes("NOAUTH") || error.message.includes("AUTH") || error.message.includes("WRONGPASS")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else {
        status = "error";
        errorCode = "UNKNOWN";
      }
    } else {
      status = "error";
      errorMessage = "Unknown error occurred";
      errorCode = "UNKNOWN";
    }

    // Clean up connection on error
    if (client) {
      try {
        client.disconnect();
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

  // Fetch monitor to get organizationId for alert evaluation
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

  console.log(`Redis check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
