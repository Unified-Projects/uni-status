import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import { Client as SSHClient } from "ssh2";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "protocol-ssh-check" });


interface ProtocolConfig extends Record<string, unknown> {
  host: string;
  port: number;
  username?: string;
  password?: string;
  privateKey?: string;
  command?: string;
}

interface SshCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    protocol?: ProtocolConfig;
  };
}

export async function processSshCheck(job: Job<SshCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing SSH check for ${monitorId}`);

  const protocolConfig = config?.protocol;
  if (!protocolConfig) {
    log.error(`No protocol config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing protocol configuration" };
  }

  // Decrypt any encrypted secrets
  const decryptedConfig = await decryptConfigSecrets<ProtocolConfig>(protocolConfig);

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();

  return new Promise<{ status: CheckStatus; responseTimeMs: number; errorMessage?: string }>((resolve) => {
    let status: CheckStatus = "success";
    let responseTimeMs = 0;
    let errorMessage: string | undefined;
    let errorCode: string | undefined;
    let client: SSHClient | null = null;
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
          client.end();
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

      log.info(`SSH check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

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
      client = new SSHClient();

      client.on("ready", async () => {
        log.info(`SSH connected to ${decryptedConfig.host}:${decryptedConfig.port}`);

        // If a command is specified, execute it
        if (decryptedConfig.command) {
          client!.exec(decryptedConfig.command, (err, stream) => {
            if (err) {
              cleanup("failure", `Command execution failed: ${err.message}`, "COMMAND_FAILED");
              return;
            }

            let output = "";
            let exitCode = 0;

            stream.on("close", (code: number) => {
              exitCode = code;
              if (exitCode === 0) {
                cleanup("success");
              } else {
                cleanup("failure", `Command exited with code ${exitCode}`, "NON_ZERO_EXIT");
              }
            });

            stream.on("data", (data: Buffer) => {
              output += data.toString();
            });

            stream.stderr.on("data", (data: Buffer) => {
              output += data.toString();
            });
          });
        } else {
          // No command, just verify connection works
          await cleanup("success");
        }
      });

      client.on("error", (err) => {
        const errMessage = err.message || "Unknown SSH error";

        if (errMessage.includes("ECONNREFUSED")) {
          cleanup("failure", errMessage, "CONNECTION_REFUSED");
        } else if (errMessage.includes("ENOTFOUND") || errMessage.includes("getaddrinfo")) {
          cleanup("failure", errMessage, "HOST_NOT_FOUND");
        } else if (errMessage.includes("authentication") || errMessage.includes("All configured") || errMessage.includes("publickey")) {
          cleanup("failure", errMessage, "AUTH_FAILED");
        } else if (errMessage.includes("timeout") || errMessage.includes("ETIMEDOUT")) {
          cleanup("timeout", errMessage, "TIMEOUT");
        } else if (errMessage.includes("handshake") || errMessage.includes("protocol")) {
          cleanup("failure", errMessage, "PROTOCOL_ERROR");
        } else {
          cleanup("error", errMessage, "UNKNOWN");
        }
      });

      client.on("close", () => {
        if (!resolved) {
          cleanup("failure", "Connection closed unexpectedly", "CONNECTION_CLOSED");
        }
      });

      // Build connection config
      const connectConfig: Record<string, unknown> = {
        host: decryptedConfig.host,
        port: decryptedConfig.port,
        readyTimeout: timeoutMs,
        keepaliveInterval: 0,
      };

      // Add authentication
      if (decryptedConfig.privateKey) {
        connectConfig.privateKey = decryptedConfig.privateKey;
        if (decryptedConfig.username) {
          connectConfig.username = decryptedConfig.username;
        }
      } else if (decryptedConfig.username && decryptedConfig.password) {
        connectConfig.username = decryptedConfig.username;
        connectConfig.password = decryptedConfig.password;
      } else if (decryptedConfig.username) {
        // Try with just username (for key-based auth where key is in default location)
        connectConfig.username = decryptedConfig.username;
        connectConfig.agent = process.env.SSH_AUTH_SOCK;
      } else {
        // No auth configured - just check if SSH server responds
        // This will fail auth but we can detect the server is up
        connectConfig.username = "probe";
        connectConfig.password = "probe";
        connectConfig.tryKeyboard = false;
      }

      client.connect(connectConfig as Parameters<SSHClient["connect"]>[0]);

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      cleanup("error", errMessage, "UNKNOWN");
    }
  });
}
