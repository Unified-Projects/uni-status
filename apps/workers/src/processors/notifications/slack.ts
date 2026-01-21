import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";

interface SlackNotificationJob {
  webhookUrl: string;
  message: {
    text: string;
    blocks?: unknown[];
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

export async function processSlackNotification(job: Job<SlackNotificationJob>) {
  const { webhookUrl, message, alertHistoryId, channelId } = job.data;
  const attemptsMade = job.attemptsMade;

  console.log(`[Slack] Sending notification (attempt ${attemptsMade + 1}): ${message.text}`);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorMsg = `Slack webhook returned ${response.status}`;
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

    console.log(`[Slack] Successfully sent notification`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Slack] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
