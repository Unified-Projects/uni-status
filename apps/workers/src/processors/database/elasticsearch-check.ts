import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import { Client as ElasticsearchClient } from "@elastic/elasticsearch";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "database-elasticsearch-check" });


interface DatabaseConfig extends Record<string, unknown> {
  host: string;
  port: number;
  database?: string;  // Index name for ES
  username?: string;
  password?: string;
  ssl?: boolean;
  query?: string;  // JSON query for ES
  expectedRowCount?: number;
  apiKey?: string;  // Alternative auth method
}

interface ElasticsearchCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    database?: DatabaseConfig;
  };
}

export async function processElasticsearchCheck(job: Job<ElasticsearchCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing Elasticsearch check for ${monitorId}`);

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

  let client: ElasticsearchClient | null = null;

  try {
    // Build connection config
    const protocol = decryptedConfig.ssl ? "https" : "http";
    const nodeUrl = `${protocol}://${decryptedConfig.host}:${decryptedConfig.port}`;

    const clientConfig: Record<string, unknown> = {
      node: nodeUrl,
      requestTimeout: timeoutMs,
      pingTimeout: timeoutMs,
      maxRetries: 0,
    };

    // Configure authentication
    if (decryptedConfig.apiKey) {
      clientConfig.auth = {
        apiKey: decryptedConfig.apiKey,
      };
    } else if (decryptedConfig.username && decryptedConfig.password) {
      clientConfig.auth = {
        username: decryptedConfig.username,
        password: decryptedConfig.password,
      };
    }

    // SSL configuration
    if (decryptedConfig.ssl) {
      clientConfig.tls = {
        rejectUnauthorized: false,
      };
    }

    client = new ElasticsearchClient(clientConfig);

    // Execute ping to verify connection
    const pingResult = await client.ping();
    if (!pingResult) {
      throw new Error("Elasticsearch ping failed");
    }

    // Get cluster health for additional status info
    const health = await client.cluster.health();

    // Check cluster status
    if (health.status === "red") {
      status = "failure";
      errorMessage = "Cluster health is red";
      errorCode = "CLUSTER_UNHEALTHY";
    } else if (health.status === "yellow") {
      status = "degraded";
      errorMessage = "Cluster health is yellow";
      errorCode = "CLUSTER_DEGRADED";
    }

    // If a custom query is provided and we have a target index, execute it
    if (decryptedConfig.query && decryptedConfig.database && status === "success") {
      try {
        const queryConfig = JSON.parse(decryptedConfig.query);

        const searchResult = await client.search({
          index: decryptedConfig.database,
          body: queryConfig,
          timeout: `${timeoutMs}ms`,
        });

        // Check expected row count if specified
        if (decryptedConfig.expectedRowCount !== undefined) {
          const totalHits = typeof searchResult.hits.total === "number"
            ? searchResult.hits.total
            : searchResult.hits.total?.value ?? 0;

          if (totalHits !== decryptedConfig.expectedRowCount) {
            status = "failure";
            errorMessage = `Expected ${decryptedConfig.expectedRowCount} hits, got ${totalHits}`;
            errorCode = "ROW_COUNT_MISMATCH";
          }
        }
      } catch (queryError) {
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
      } else if (error.message.includes("401") || error.message.includes("security_exception") || error.message.includes("Unauthorized")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else if (error.message.includes("index_not_found")) {
        status = "failure";
        errorCode = "INDEX_NOT_FOUND";
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

  log.info(`Elasticsearch check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
