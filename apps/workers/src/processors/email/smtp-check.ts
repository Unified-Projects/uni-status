import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../../lib/redis";
import { evaluateAlerts } from "../../lib/alert-evaluator";
import { decryptConfigSecrets } from "@uni-status/shared/crypto";
import type { CheckStatus } from "@uni-status/shared/types";
import nodemailer from "nodemailer";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "email-smtp-check" });


interface EmailServerConfig extends Record<string, unknown> {
  host: string;
  port: number;
  username?: string;
  password?: string;
  ssl?: boolean;
  starttls?: boolean;
}

interface SmtpCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  config?: {
    emailServer?: EmailServerConfig;
  };
}

export async function processSmtpCheck(job: Job<SmtpCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  log.info(`Processing SMTP check for ${monitorId}`);

  const emailConfig = config?.emailServer;
  if (!emailConfig) {
    log.error(`No email server config found for monitor ${monitorId}`);
    return { status: "error" as CheckStatus, message: "Missing email server configuration" };
  }

  // Decrypt any encrypted secrets
  const decryptedConfig = await decryptConfigSecrets<EmailServerConfig>(emailConfig);

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  let transporter: nodemailer.Transporter | null = null;

  try {
    // Build transport config
    const transportConfig: nodemailer.TransportOptions & Record<string, unknown> = {
      host: decryptedConfig.host,
      port: decryptedConfig.port,
      secure: decryptedConfig.ssl ?? false,  // true for SSL, false for TLS/STARTTLS
      connectionTimeout: timeoutMs,
      socketTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      tls: {
        rejectUnauthorized: false,
      },
    };

    // Configure authentication if provided
    if (decryptedConfig.username && decryptedConfig.password) {
      transportConfig.auth = {
        user: decryptedConfig.username,
        pass: decryptedConfig.password,
      };
    }

    // Configure STARTTLS
    if (decryptedConfig.starttls && !decryptedConfig.ssl) {
      transportConfig.requireTLS = true;
    }

    transporter = nodemailer.createTransport(transportConfig);

    // Verify connection
    await transporter.verify();

    responseTimeMs = Math.round(performance.now() - startTime);

    // Close connection
    transporter.close();
    transporter = null;

  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      errorMessage = error.message;

      // Classify error codes
      if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT") || error.message.includes("ESOCKET")) {
        status = "timeout";
        errorCode = "TIMEOUT";
      } else if (error.message.includes("ECONNREFUSED")) {
        status = "failure";
        errorCode = "CONNECTION_REFUSED";
      } else if (error.message.includes("ENOTFOUND") || error.message.includes("getaddrinfo")) {
        status = "failure";
        errorCode = "HOST_NOT_FOUND";
      } else if (error.message.includes("authentication") || error.message.includes("535") || error.message.includes("Invalid login")) {
        status = "failure";
        errorCode = "AUTH_FAILED";
      } else if (error.message.includes("certificate") || error.message.includes("SSL") || error.message.includes("TLS")) {
        status = "failure";
        errorCode = "SSL_ERROR";
      } else if (error.message.includes("greeting") || error.message.includes("banner")) {
        status = "failure";
        errorCode = "INVALID_RESPONSE";
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
    if (transporter) {
      try {
        transporter.close();
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

  log.info(`SMTP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    errorMessage,
  };
}
