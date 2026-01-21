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

interface ProtocolConfig extends Record<string, unknown> {
  host: string;
  port: number;
  username?: string;  // LDAP bind DN
  password?: string;
  ssl?: boolean;
  baseDn?: string;
}

interface LdapCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    protocol?: ProtocolConfig;
  };
}

// Simple LDAP protocol helpers
// LDAP uses ASN.1 BER encoding

function buildLdapBindRequest(messageId: number, bindDn: string, password: string): Buffer {
  // Build simple bind request
  // Bind Request: messageId, version=3, name, simple auth

  const bindDnBuf = Buffer.from(bindDn, "utf8");
  const passwordBuf = Buffer.from(password, "utf8");

  // LDAP version 3
  const versionBuf = Buffer.from([0x02, 0x01, 0x03]);

  // Bind DN (OCTET STRING)
  const bindDnLenBuf = encodeLdapLength(bindDnBuf.length);
  const bindDnSeq = Buffer.concat([Buffer.from([0x04]), bindDnLenBuf, bindDnBuf]);

  // Password (context-specific [0] for simple auth)
  const passwordLenBuf = encodeLdapLength(passwordBuf.length);
  const passwordSeq = Buffer.concat([Buffer.from([0x80]), passwordLenBuf, passwordBuf]);

  // Bind Request body
  const bindBody = Buffer.concat([versionBuf, bindDnSeq, passwordSeq]);
  const bindBodyLenBuf = encodeLdapLength(bindBody.length);

  // Bind Request (APPLICATION 0)
  const bindRequest = Buffer.concat([Buffer.from([0x60]), bindBodyLenBuf, bindBody]);

  // Message ID
  const messageIdBuf = encodeInteger(messageId);

  // LDAPMessage envelope
  const messageBody = Buffer.concat([messageIdBuf, bindRequest]);
  const messageLenBuf = encodeLdapLength(messageBody.length);

  return Buffer.concat([Buffer.from([0x30]), messageLenBuf, messageBody]);
}

function buildLdapUnbindRequest(messageId: number): Buffer {
  // Unbind Request (APPLICATION 2) with empty body
  const unbindRequest = Buffer.from([0x42, 0x00]);

  // Message ID
  const messageIdBuf = encodeInteger(messageId);

  // LDAPMessage envelope
  const messageBody = Buffer.concat([messageIdBuf, unbindRequest]);
  const messageLenBuf = encodeLdapLength(messageBody.length);

  return Buffer.concat([Buffer.from([0x30]), messageLenBuf, messageBody]);
}

function encodeLdapLength(length: number): Buffer {
  if (length < 128) {
    return Buffer.from([length]);
  } else if (length < 256) {
    return Buffer.from([0x81, length]);
  } else {
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }
}

function encodeInteger(value: number): Buffer {
  if (value < 128) {
    return Buffer.from([0x02, 0x01, value]);
  } else if (value < 256) {
    return Buffer.from([0x02, 0x01, value]);
  } else {
    return Buffer.from([0x02, 0x02, (value >> 8) & 0xff, value & 0xff]);
  }
}

function parseLdapBindResponse(data: Buffer): { resultCode: number; errorMessage?: string } | null {
  try {
    // Basic parsing - look for result code in bind response
    // LDAP response: SEQUENCE { messageId, bindResponse { resultCode, ... } }

    if (data.length < 10) return null;

    // Skip to result code (simplified parsing)
    // Find the bind response (APPLICATION 1 = 0x61)
    let idx = 0;

    // Skip outer SEQUENCE tag and length
    const seqTag = data[idx];
    if (seqTag === undefined || seqTag !== 0x30) return null;
    idx++;
    const seqLenByte = data[idx];
    if (seqLenByte === undefined) return null;
    if (seqLenByte & 0x80) {
      idx += (seqLenByte & 0x7f) + 1;
    } else {
      idx++;
    }

    // Skip message ID
    const messageIdTag = data[idx];
    if (messageIdTag === undefined || messageIdTag !== 0x02) return null;
    idx++;
    const idLen = data[idx];
    if (idLen === undefined) return null;
    idx += idLen + 1;

    // Check for bind response (APPLICATION 1 = 0x61)
    const bindTag = data[idx];
    if (bindTag === undefined || bindTag !== 0x61) return null;
    idx++;

    // Skip bind response length
    const bindLenByte = data[idx];
    if (bindLenByte === undefined) return null;
    if (bindLenByte & 0x80) {
      idx += (bindLenByte & 0x7f) + 1;
    } else {
      idx++;
    }

    // Result code (ENUMERATED)
    const resultTag = data[idx];
    if (resultTag === undefined || resultTag !== 0x0a) return null;
    idx++;
    const resultLen = data[idx];
    if (resultLen === undefined) return null;
    idx++;

    const resultCode = data[idx];
    if (resultCode === undefined) return null;

    return { resultCode };
  } catch {
    return null;
  }
}

export async function processLdapCheck(job: Job<LdapCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  console.log(`Processing LDAP check for ${monitorId}`);

  const protocolConfig = config?.protocol;
  if (!protocolConfig) {
    console.error(`No protocol config found for monitor ${monitorId}`);
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
    let messageId = 1;
    let currentState: "connect" | "bind" | "unbind" | "done" = "connect";

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

      console.log(`LDAP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

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
        console.log(`LDAP connected to ${decryptedConfig.host}:${decryptedConfig.port}`);
        currentState = "bind";

        // Send bind request (anonymous or with credentials)
        const bindDn = decryptedConfig.username || "";
        const password = decryptedConfig.password || "";
        const bindRequest = buildLdapBindRequest(messageId, bindDn, password);
        socket?.write(bindRequest);
      };

      const setupSocketHandlers = (sock: net.Socket | tls.TLSSocket) => {
        sock.on("data", async (data: Buffer) => {
          if (currentState === "bind") {
            const response = parseLdapBindResponse(data);

            if (response) {
              if (response.resultCode === 0) {
                // Success - send unbind
                currentState = "unbind";
                messageId++;
                const unbindRequest = buildLdapUnbindRequest(messageId);
                socket?.write(unbindRequest);

                // Unbind doesn't get a response, so we're done
                await cleanup("success");
              } else if (response.resultCode === 49) {
                // Invalid credentials
                await cleanup("failure", "Authentication failed (invalid credentials)", "AUTH_FAILED");
              } else if (response.resultCode === 53) {
                // Unwilling to perform (server might require TLS)
                await cleanup("failure", "Server unwilling to perform operation", "UNWILLING_TO_PERFORM");
              } else {
                await cleanup("failure", `LDAP bind failed with result code ${response.resultCode}`, "BIND_FAILED");
              }
            }
          }
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
            if (currentState === "unbind" || currentState === "done") {
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
