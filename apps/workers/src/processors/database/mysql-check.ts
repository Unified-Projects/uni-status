import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import mysql from "mysql2/promise";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "database-mysql-check" });


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

interface MysqlCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    database?: DatabaseConfig;
  };
}

export async function processMysqlCheck(job: Job<MysqlCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing MySQL check for ${monitorId}`);

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

  let connection: mysql.Connection | null = null;

  try {
    // Build connection config
    const connectionConfig: mysql.ConnectionOptions = {
      host: decryptedConfig.host,
      port: decryptedConfig.port,
      database: decryptedConfig.database,
      user: decryptedConfig.username,
      password: decryptedConfig.password,
      connectTimeout: timeoutMs,
      ssl: decryptedConfig.ssl ? { rejectUnauthorized: false } : undefined,
    };

    // Connect with timeout
    const connectPromise = mysql.createConnection(connectionConfig);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
    );

    connection = await Promise.race([connectPromise, timeoutPromise]);

    // Execute health query
    const query = decryptedConfig.query || "SELECT 1 AS health_check";
    const [rows] = await connection.execute(query);

    responseTimeMs = Math.round(performance.now() - startTime);

    // Check expected row count if specified
    if (decryptedConfig.expectedRowCount !== undefined) {
      const rowCount = Array.isArray(rows) ? rows.length : 0;
      if (rowCount !== decryptedConfig.expectedRowCount) {
        status = "failure";
        errorMessage = `Expected ${decryptedConfig.expectedRowCount} rows, got ${rowCount}`;
        errorCode = "ROW_COUNT_MISMATCH";
      }
    }

    // Close connection
    await connection.end();
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
      } else if (error.message.includes("ENOTFOUND")) {
        status = "failure";
        errorCode = "HOST_NOT_FOUND";
      } else if (error.message.includes("Access denied")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else if (error.message.includes("Unknown database")) {
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
    if (connection) {
      try {
        await connection.end();
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

  log.info(`MySQL check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
