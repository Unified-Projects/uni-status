import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { TwitterApi } from "twitter-api-v2";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";

interface TwitterNotificationJob {
  // Twitter API credentials
  twitterApiKey: string;
  twitterApiSecret: string;
  twitterAccessToken: string;
  twitterAccessSecret: string;
  // Mode configuration
  twitterMode: "tweet" | "dm";
  twitterDmRecipient?: string;
  // Message content
  monitorName: string;
  monitorUrl: string;
  status: "down" | "degraded" | "recovered";
  message?: string;
  dashboardUrl: string;
  timestamp: string;
  // Optional IDs for logging
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

function formatTwitterMessage(data: TwitterNotificationJob, maxLength: number = 280): string {
  const statusEmoji = {
    down: "🔴",
    degraded: "🟡",
    recovered: "🟢",
  };

  const statusText = {
    down: "DOWN",
    degraded: "DEGRADED",
    recovered: "RECOVERED",
  };

  const emoji = statusEmoji[data.status] || "⚪";
  const status = statusText[data.status] || data.status.toUpperCase();

  // Build message, ensuring it fits in character limit
  let msg = `${emoji} ${data.monitorName} is ${status}`;

  // Add URL if it fits
  const urlPart = data.monitorUrl ? `\n${data.monitorUrl}` : "";

  // Add error message if it fits
  const msgPart = data.message ? `\n${data.message}` : "";

  // Add dashboard link
  const dashboardPart = `\n\n${data.dashboardUrl}`;

  // Calculate what we can fit
  const fullMsg = msg + urlPart + msgPart + dashboardPart;

  if (fullMsg.length <= maxLength) {
    return fullMsg;
  }

  // Truncate error message if needed
  const baseWithDashboard = msg + urlPart + dashboardPart;
  if (baseWithDashboard.length <= maxLength) {
    const remainingChars = maxLength - baseWithDashboard.length - 4; // -4 for "\n..."
    if (remainingChars > 10 && data.message) {
      const truncatedMsg = data.message.substring(0, remainingChars) + "...";
      return msg + urlPart + `\n${truncatedMsg}` + dashboardPart;
    }
    return baseWithDashboard;
  }

  // Just basic message + dashboard
  const minMsg = msg + dashboardPart;
  if (minMsg.length <= maxLength) {
    return minMsg;
  }

  // Absolute minimum - truncate everything
  return msg.substring(0, maxLength - 3) + "...";
}

export async function processTwitterNotification(job: Job<TwitterNotificationJob>) {
  const { data, attemptsMade } = job;
  const {
    twitterApiKey,
    twitterApiSecret,
    twitterAccessToken,
    twitterAccessSecret,
    twitterMode,
    twitterDmRecipient,
    alertHistoryId,
    channelId,
  } = data;

  console.log(`[Twitter] Sending ${twitterMode} notification (attempt ${attemptsMade + 1})`);

  try {
    // Create Twitter client with OAuth 1.0a User Context
    const client = new TwitterApi({
      appKey: twitterApiKey,
      appSecret: twitterApiSecret,
      accessToken: twitterAccessToken,
      accessSecret: twitterAccessSecret,
    });

    if (twitterMode === "dm") {
      // Direct Message mode
      if (!twitterDmRecipient) {
        const errorMsg = "Twitter DM recipient ID is required for DM mode";
        console.error(`[Twitter] ${errorMsg}`);

        if (alertHistoryId && channelId && attemptsMade >= 4) {
          await logNotification(alertHistoryId, channelId, false, null, errorMsg, attemptsMade + 1);
        }
        throw new Error(errorMsg);
      }

      // Format message (DMs can be longer, up to 10000 chars)
      const message = formatTwitterMessage(data, 10000);

      // Send DM via v2 API
      await client.v2.sendDmToParticipant(twitterDmRecipient, {
        text: message,
      });

      console.log(`[Twitter] Successfully sent DM to ${twitterDmRecipient}`);
    } else {
      // Tweet mode
      const message = formatTwitterMessage(data, 280);

      // Post tweet via v2 API
      await client.v2.tweet(message);

      console.log(`[Twitter] Successfully posted tweet`);
    }

    // Log success
    if (alertHistoryId && channelId) {
      await logNotification(alertHistoryId, channelId, true, null, null, attemptsMade + 1);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Twitter] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
