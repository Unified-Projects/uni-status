import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";
import { decrypt } from "@uni-status/shared/lib/crypto";
import { signWebhookPayload } from "@uni-status/shared/lib/webhook-signing";

interface WebhookNotificationJob {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  // Optional IDs for logging (present when triggered by alerts, absent for test notifications)
  alertHistoryId?: string;
  channelId?: string;
  // Optional signing key for HMAC-SHA256 signatures (encrypted)
  signingKey?: string;
}

async function logNotification(
  alertHistoryId: string,
  channelId: string,
  success: boolean,
  responseCode: number | null,
  errorMessage: string | null,
  retryCount: number
) {
  await db.insert(notificationLogs).values({
    id: nanoid(),
    alertHistoryId,
    channelId,
    success,
    responseCode,
    errorMessage,
    retryCount,
    sentAt: new Date(),
  });
}

export async function processWebhookNotification(job: Job<WebhookNotificationJob>) {
  const { url, method = "POST", headers = {}, body, alertHistoryId, channelId, signingKey } = job.data;
  const attemptsMade = job.attemptsMade;

  console.log(`[Webhook] Sending notification to ${url} (attempt ${attemptsMade + 1})`);

  try {
    const bodyString = body ? JSON.stringify(body) : "";
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    // Add HMAC-SHA256 signature headers if signing key is provided
    if (signingKey) {
      try {
        const decryptedKey = await decrypt(signingKey);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = signWebhookPayload(bodyString, decryptedKey, timestamp);

        requestHeaders["X-Uni-Status-Signature"] = `sha256=${signature}`;
        requestHeaders["X-Uni-Status-Timestamp"] = timestamp.toString();
      } catch (signError) {
        console.error("[Webhook] Failed to sign payload:", signError);
        // Continue without signing rather than failing the entire notification
      }
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: bodyString || undefined,
    });

    if (!response.ok) {
      const errorMsg = `Webhook returned ${response.status}`;
      // Log failure on final attempt
      if (alertHistoryId && channelId && attemptsMade >= 4) {
        await logNotification(alertHistoryId, channelId, false, response.status, errorMsg, attemptsMade + 1);
      }
      throw new Error(errorMsg);
    }

    // Log success
    if (alertHistoryId && channelId) {
      await logNotification(alertHistoryId, channelId, true, response.status, null, attemptsMade + 1);
    }

    console.log(`[Webhook] Successfully sent to ${url}`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Webhook] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
