import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";

interface SmsNotificationJob {
  to: string;  // Phone number in E.164 format (+1234567890)
  message: string;
  // Twilio credentials - should be passed from environment or encrypted config
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  alertHistoryId?: string;
  channelId?: string;
}

// Twilio API endpoint template
const getTwilioApiUrl = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

// Truncate message to SMS limit (160 chars for single SMS, can be longer for concatenated)
function truncateMessage(message: string, maxLength: number = 160): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength - 3) + "...";
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

export async function processSmsNotification(job: Job<SmsNotificationJob>) {
  const {
    to,
    message,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
    alertHistoryId,
    channelId,
  } = job.data;
  const attemptsMade = job.attemptsMade;

  // Get Twilio credentials from job data or environment
  const accountSid = twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = twilioFromNumber || process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const errorMsg = "Twilio credentials not configured";
    console.error(`[SMS] ${errorMsg}`);

    if (alertHistoryId && channelId) {
      await logNotification(alertHistoryId, channelId, false, null, errorMsg, attemptsMade + 1);
    }
    throw new Error(errorMsg);
  }

  console.log(`[SMS] Sending notification to ${to} (attempt ${attemptsMade + 1})`);

  try {
    // Truncate message if needed
    const smsBody = truncateMessage(message, 1600); // Twilio supports concatenated SMS up to 1600 chars

    // Build form data for Twilio API
    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", fromNumber);
    formData.append("Body", smsBody);

    // Make request to Twilio API
    const response = await fetch(getTwilioApiUrl(accountSid), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
      body: formData.toString(),
    });

    const responseData = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg = `Twilio API returned ${response.status}: ${responseData.message || responseData.error_message || "Unknown error"}`;

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

    console.log(`[SMS] Successfully sent to ${to}, SID: ${responseData.sid}`);
    return {
      success: true,
      statusCode: response.status,
      messageSid: responseData.sid,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[SMS] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
