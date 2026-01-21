import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import { MongoClient } from "mongodb";

interface DatabaseConfig extends Record<string, unknown> {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  query?: string;
  expectedRowCount?: number;
  authSource?: string;
  replicaSet?: string;
}

interface MongodbCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    database?: DatabaseConfig;
  };
}

export async function processMongodbCheck(job: Job<MongodbCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  console.log(`Processing MongoDB check for ${monitorId}`);

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

  let client: MongoClient | null = null;

  try {
    // Build connection URI
    let connectionUri: string;

    if (decryptedConfig.username && decryptedConfig.password) {
      const authSource = decryptedConfig.authSource || "admin";
      connectionUri = `mongodb://${encodeURIComponent(decryptedConfig.username)}:${encodeURIComponent(decryptedConfig.password)}@${decryptedConfig.host}:${decryptedConfig.port}`;
      connectionUri += `/?authSource=${authSource}`;
    } else {
      connectionUri = `mongodb://${decryptedConfig.host}:${decryptedConfig.port}`;
    }

    if (decryptedConfig.replicaSet) {
      connectionUri += connectionUri.includes("?") ? "&" : "?";
      connectionUri += `replicaSet=${decryptedConfig.replicaSet}`;
    }

    // Create client with options
    client = new MongoClient(connectionUri, {
      serverSelectionTimeoutMS: timeoutMs,
      connectTimeoutMS: timeoutMs,
      socketTimeoutMS: timeoutMs,
      tls: decryptedConfig.ssl ?? false,
      tlsAllowInvalidCertificates: decryptedConfig.ssl ?? false,
      directConnection: !decryptedConfig.replicaSet,
    });

    // Connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // Get database (default to admin for ping)
    const database = client.db(decryptedConfig.database || "admin");

    // Execute ping command to verify connection
    await database.command({ ping: 1 });

    // If a custom query is provided, execute it
    if (decryptedConfig.query) {
      try {
        // Parse query as JSON (e.g., {"collection": "users", "find": {}})
        const queryConfig = JSON.parse(decryptedConfig.query);

        if (queryConfig.collection) {
          const collection = database.collection(queryConfig.collection);
          let result;

          if (queryConfig.find) {
            result = await collection.find(queryConfig.find).toArray();
          } else if (queryConfig.aggregate) {
            result = await collection.aggregate(queryConfig.aggregate).toArray();
          } else if (queryConfig.countDocuments) {
            result = [{ count: await collection.countDocuments(queryConfig.countDocuments) }];
          } else {
            // Default to find all with limit
            result = await collection.find({}).limit(100).toArray();
          }

          // Check expected row count if specified
          if (decryptedConfig.expectedRowCount !== undefined) {
            const rowCount = Array.isArray(result) ? result.length : 0;
            if (rowCount !== decryptedConfig.expectedRowCount) {
              status = "failure";
              errorMessage = `Expected ${decryptedConfig.expectedRowCount} documents, got ${rowCount}`;
              errorCode = "ROW_COUNT_MISMATCH";
            }
          }
        }
      } catch (queryError) {
        // Query parsing/execution error
        if (queryError instanceof Error) {
          status = "failure";
          errorMessage = `Query error: ${queryError.message}`;
          errorCode = "QUERY_ERROR";
        }
      }
    }

    responseTimeMs = Math.round(performance.now() - startTime);

    // Close connection
    await client.close();
    client = null;

  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      errorMessage = error.message;

      // Classify error codes
      if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT") || error.message.includes("timed out")) {
        status = "timeout";
        errorCode = "TIMEOUT";
      } else if (error.message.includes("ECONNREFUSED")) {
        status = "failure";
        errorCode = "CONNECTION_REFUSED";
      } else if (error.message.includes("ENOTFOUND") || error.message.includes("getaddrinfo")) {
        status = "failure";
        errorCode = "HOST_NOT_FOUND";
      } else if (error.message.includes("Authentication failed") || error.message.includes("auth")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else if (error.message.includes("not found") || error.message.includes("doesn't exist")) {
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
        await client.close();
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

  console.log(`MongoDB check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
