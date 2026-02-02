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

const log = createLogger({ module: "protocol-rdp-check" });


interface ProtocolConfig extends Record<string, unknown> {
  host: string;
  port: number;
  ssl?: boolean;
  nla?: boolean;  // Network Level Authentication
}

interface RdpCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    protocol?: ProtocolConfig;
  };
}

// RDP Protocol constants
// Reference: https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/

// X.224 Connection Request TPDU
function buildX224ConnectionRequest(): Buffer {
  // TPKT Header (RFC 1006)
  // Version: 3, Reserved: 0, Length: 11 (including TPKT header)
  const tpktHeader = Buffer.from([0x03, 0x00, 0x00, 0x0b]);

  // X.224 Connection Request
  // Length indicator: 6 (remaining bytes after this)
  // CR CDT (Connection Request): 0xe0
  // DST-REF: 0x00 0x00
  // SRC-REF: 0x00 0x00
  // Class/Options: 0x00
  const x224 = Buffer.from([0x06, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00]);

  return Buffer.concat([tpktHeader, x224]);
}

// Parse X.224 Connection Confirm
function parseX224ConnectionConfirm(data: Buffer): { success: boolean; reason?: string } {
  if (data.length < 7) {
    return { success: false, reason: "Response too short" };
  }

  // Check TPKT header
  if (data[0] !== 0x03) {
    return { success: false, reason: "Invalid TPKT version" };
  }

  // Check X.224 TPDU type
  // CC (Connection Confirm) is 0xd0
  // Data TPDU is 0xf0
  const tpduByte = data[5];
  if (tpduByte === undefined) {
    return { success: false, reason: "Response too short" };
  }
  const tpduType = tpduByte & 0xf0;

  if (tpduType === 0xd0) {
    // Connection Confirm - RDP server is responding
    return { success: true };
  } else if (tpduType === 0xf0) {
    // Data TPDU - might be negotiation response
    return { success: true };
  } else {
    return { success: false, reason: `Unexpected TPDU type: 0x${tpduType.toString(16)}` };
  }
}

export async function processRdpCheck(job: Job<RdpCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing RDP check for ${monitorId}`);

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
    let socket: net.Socket | tls.TLSSocket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;
    let receivedData = false;

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

      log.info(`RDP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

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
      const connectCallback = () => {
        log.info(`RDP connected to ${decryptedConfig.host}:${decryptedConfig.port}`);

        // Send X.224 Connection Request
        const connectionRequest = buildX224ConnectionRequest();
        socket?.write(connectionRequest);
      };

      const setupSocketHandlers = (sock: net.Socket | tls.TLSSocket) => {
        sock.on("data", async (data: Buffer) => {
          receivedData = true;

          const response = parseX224ConnectionConfirm(data);

          if (response.success) {
            await cleanup("success");
          } else {
            await cleanup("failure", response.reason || "Invalid RDP response", "INVALID_RESPONSE");
          }
        });

        sock.on("error", (err) => {
          const errMessage = err.message || "Unknown error";

          if (errMessage.includes("ECONNREFUSED")) {
            cleanup("failure", errMessage, "CONNECTION_REFUSED");
          } else if (errMessage.includes("ENOTFOUND") || errMessage.includes("getaddrinfo")) {
            cleanup("failure", errMessage, "HOST_NOT_FOUND");
          } else if (errMessage.includes("ECONNRESET")) {
            // Connection reset often means RDP is there but rejected the connection
            // This can happen with NLA enabled - still indicates RDP is running
            cleanup("success");
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
            // If we received any data before close, consider it a success
            // RDP servers sometimes close connection after initial handshake
            if (receivedData) {
              cleanup("success");
            } else {
              cleanup("failure", "Connection closed without response", "CONNECTION_CLOSED");
            }
          }
        });
      };

      if (decryptedConfig.ssl) {
        // TLS-wrapped RDP (typically port 3389 with TLS)
        socket = tls.connect({
          host: decryptedConfig.host,
          port: decryptedConfig.port,
          rejectUnauthorized: false,
          timeout: timeoutMs,
        }, connectCallback);
        setupSocketHandlers(socket);
      } else {
        // Standard RDP connection
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
