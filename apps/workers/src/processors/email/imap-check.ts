import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import * as net from "net";
import * as tls from "tls";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "email-imap-check" });


interface EmailServerConfig extends Record<string, unknown> {
  host: string;
  port: number;
  username?: string;
  password?: string;
  ssl?: boolean;
  starttls?: boolean;
}

interface ImapCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    emailServer?: EmailServerConfig;
  };
}

export async function processImapCheck(job: Job<ImapCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing IMAP check for ${monitorId}`);

  const emailConfig = config?.emailServer;
  if (!emailConfig) {
    log.error(`No email server config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing email server configuration" };
  }

  // Decrypt any encrypted secrets
  const decryptedConfig = await decryptConfigSecrets<EmailServerConfig>(emailConfig);

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();

  return new Promise<{ status: CheckStatus; responseTimeMs: number; errorMessage?: string }>((resolve) => {
    let status: CheckStatus = "success";
    let responseTimeMs = 0;
    let errorMessage: string | undefined;
    let errorCode: string | undefined;
    let socket: net.Socket | tls.TLSSocket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;
    let commandTag = 0;
    let currentState: "greeting" | "capability" | "login" | "logout" | "done" = "greeting";
    let dataBuffer = "";

    const cleanup = async (finalStatus: CheckStatus, finalError?: string, finalErrorCode?: string) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (socket) {
        try {
          socket.destroy();
        } catch {
          // Ignore cleanup errors
        }
        socket = null;
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

      log.info(`IMAP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

      resolve({
        status,
        responseTimeMs,
        errorMessage,
      });
    };

    const sendCommand = (command: string) => {
      commandTag++;
      const taggedCommand = `A${commandTag} ${command}\r\n`;
      socket?.write(taggedCommand);
    };

    const handleResponse = (data: string) => {
      dataBuffer += data;

      // Check for complete response (ends with tag + OK/NO/BAD or untagged * response)
      const lines = dataBuffer.split("\r\n");

      for (const line of lines) {
        if (!line) continue;

        const tagPattern = new RegExp(`^A${commandTag} (OK|NO|BAD)`, "i");
        const untaggedPattern = /^\* (OK|NO|BAD|CAPABILITY|BYE)/i;

        if (currentState === "greeting") {
          // Wait for server greeting
          if (line.startsWith("* OK") || line.startsWith("* PREAUTH")) {
            currentState = "capability";
            sendCommand("CAPABILITY");
            dataBuffer = "";
          } else if (line.startsWith("* BYE") || line.startsWith("* NO")) {
            cleanup("failure", `Server rejected connection: ${line}`, "CONNECTION_REJECTED");
          }
        } else if (currentState === "capability") {
          if (tagPattern.test(line)) {
            if (line.includes("OK")) {
              // If we have credentials, try to login
              if (decryptedConfig.username && decryptedConfig.password) {
                currentState = "login";
                sendCommand(`LOGIN "${decryptedConfig.username}" "${decryptedConfig.password}"`);
                dataBuffer = "";
              } else {
                // No credentials, just logout
                currentState = "logout";
                sendCommand("LOGOUT");
                dataBuffer = "";
              }
            } else {
              cleanup("failure", `CAPABILITY failed: ${line}`, "PROTOCOL_ERROR");
            }
          }
        } else if (currentState === "login") {
          if (tagPattern.test(line)) {
            if (line.includes("OK")) {
              // Login successful, logout
              currentState = "logout";
              sendCommand("LOGOUT");
              dataBuffer = "";
            } else {
              cleanup("failure", "Authentication failed", "AUTH_FAILED");
            }
          }
        } else if (currentState === "logout") {
          if (line.includes("BYE") || tagPattern.test(line)) {
            cleanup("success");
          }
        }
      }
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup("timeout", "Connection timeout", "TIMEOUT");
    }, timeoutMs);

    try {
      const connectCallback = () => {
        log.info(`IMAP connected to ${decryptedConfig.host}:${decryptedConfig.port}`);
      };

      const setupSocketHandlers = (sock: net.Socket | tls.TLSSocket) => {
        sock.setEncoding("utf8");

        sock.on("data", (data: string) => {
          handleResponse(data);
        });

        sock.on("error", (err) => {
          const errMessage = err.message || "Unknown error";

          if (errMessage.includes("ECONNREFUSED")) {
            cleanup("failure", errMessage, "CONNECTION_REFUSED");
          } else if (errMessage.includes("ENOTFOUND") || errMessage.includes("getaddrinfo")) {
            cleanup("failure", errMessage, "HOST_NOT_FOUND");
          } else if (errMessage.includes("certificate") || errMessage.includes("SSL") || errMessage.includes("TLS")) {
            cleanup("failure", errMessage, "SSL_ERROR");
          } else if (errMessage.includes("timeout") || errMessage.includes("ETIMEDOUT")) {
            cleanup("timeout", errMessage, "TIMEOUT");
          } else {
            cleanup("error", errMessage, "UNKNOWN");
          }
        });

        sock.on("close", () => {
          if (!resolved) {
            if (currentState === "logout" || currentState === "done") {
              cleanup("success");
            } else {
              cleanup("failure", "Connection closed unexpectedly", "CONNECTION_CLOSED");
            }
          }
        });
      };

      if (decryptedConfig.ssl) {
        socket = tls.connect({
          host: decryptedConfig.host,
          port: decryptedConfig.port,
          rejectUnauthorized: false,
          timeout: timeoutMs,
        }, connectCallback);
        setupSocketHandlers(socket);
      } else {
        socket = net.connect({
          host: decryptedConfig.host,
          port: decryptedConfig.port,
          timeout: timeoutMs,
        }, connectCallback);
        setupSocketHandlers(socket);
      }

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      cleanup("error", errMessage, "UNKNOWN");
    }
  });
}
