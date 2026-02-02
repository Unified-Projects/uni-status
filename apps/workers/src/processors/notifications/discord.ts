import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-discord" });


interface DiscordNotificationJob {
  webhookUrl: string;
  message: {
    content?: string;
    embeds?: unknown[];
  };
  // Optional IDs for logging (present when triggered by alerts, absent for test notifications)
  alertHistoryId?: string;
  channelId?: string;
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

export async function processDiscordNotification(job: Job<DiscordNotificationJob>) {
  const { webhookUrl, message, alertHistoryId, channelId } = job.data;
  const attemptsMade = job.attemptsMade;

  log.info(`[Discord] Sending notification (attempt ${attemptsMade + 1})`);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorMsg = `Discord webhook returned ${response.status}`;
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

    log.info(`[Discord] Successfully sent notification`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(`[Discord] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
