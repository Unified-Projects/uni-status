import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import { Client as PgClient } from "pg";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "database-postgres-check" });


interface DatabaseConfig extends Record<string, unknown> {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  query?: string;
  expectedRowCount?: number;
}

interface PostgresCheckJob {
  monitorId: string;
  url: string;  // Format: postgres://host:port/database or just identifier
  timeoutMs: number;
  config?: {
    database?: DatabaseConfig;
  };
}

export async function processPostgresCheck(job: Job<PostgresCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing Postgres check for ${monitorId}`);

  const dbConfig = config?.database;
  if (!dbConfig) {
    log.error(`No database config found for monitor ${monitorId}`);
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

  let client: PgClient | null = null;

  try {
    // Build connection config
    const connectionConfig = {
      host: decryptedConfig.host,
      port: decryptedConfig.port,
      database: decryptedConfig.database || "postgres",
      user: decryptedConfig.username,
      password: decryptedConfig.password,
      ssl: decryptedConfig.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
    };

    client = new PgClient(connectionConfig);

    // Connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // Execute health query
    const query = decryptedConfig.query || "SELECT 1 AS health_check";
    const result = await client.query(query);

    responseTimeMs = Math.round(performance.now() - startTime);

    // Check expected row count if specified
    if (decryptedConfig.expectedRowCount !== undefined) {
      if (result.rowCount !== decryptedConfig.expectedRowCount) {
        status = "failure";
        errorMessage = `Expected ${decryptedConfig.expectedRowCount} rows, got ${result.rowCount}`;
        errorCode = "ROW_COUNT_MISMATCH";
      }
    }

    // Close connection
    await client.end();
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
      } else if (error.message.includes("authentication") || error.message.includes("password")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else if (error.message.includes("does not exist")) {
        status = "failure";
        errorCode = "DATABASE_NOT_FOUND";
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
        await client.end();
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

  log.info(`Postgres check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
