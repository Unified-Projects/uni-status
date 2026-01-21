import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";

interface TeamsNotificationJob {
  webhookUrl: string;
  message: {
    title: string;
    text: string;
    severity?: "minor" | "major" | "critical" | "resolved";
    monitorName?: string;
    statusPageUrl?: string;
    timestamp?: string;
  };
  alertHistoryId?: string;
  channelId?: string;
}

// Map severity to Adaptive Card theme color
function getSeverityColor(severity?: string): string {
  switch (severity) {
    case "critical":
      return "attention"; // Red
    case "major":
      return "warning"; // Yellow/Orange
    case "minor":
      return "accent"; // Blue
    case "resolved":
      return "good"; // Green
    default:
      return "default";
  }
}

// Build an Adaptive Card for Teams (using the Adaptive Card schema)
function buildAdaptiveCard(message: TeamsNotificationJob["message"]) {
  const color = getSeverityColor(message.severity);

  const facts: Array<{ title: string; value: string }> = [];

  if (message.monitorName) {
    facts.push({ title: "Monitor", value: message.monitorName });
  }
  if (message.severity) {
    facts.push({ title: "Severity", value: message.severity.charAt(0).toUpperCase() + message.severity.slice(1) });
  }
  if (message.timestamp) {
    facts.push({ title: "Time", value: message.timestamp });
  }

  const card: Record<string, unknown> = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: message.title,
              weight: "bolder",
              size: "medium",
              wrap: true,
              style: color === "attention" ? "heading" : "default",
            },
            {
              type: "TextBlock",
              text: message.text,
              wrap: true,
              spacing: "small",
            },
            ...(facts.length > 0
              ? [
                  {
                    type: "FactSet",
                    facts: facts,
                    spacing: "medium",
                  },
                ]
              : []),
          ],
          ...(message.statusPageUrl
            ? {
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: "View Status Page",
                    url: message.statusPageUrl,
                  },
                ],
              }
            : {}),
          msteams: {
            width: "Full",
          },
        },
      },
    ],
  };

  return card;
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

export async function processTeamsNotification(job: Job<TeamsNotificationJob>) {
  const { webhookUrl, message, alertHistoryId, channelId } = job.data;
  const attemptsMade = job.attemptsMade;

  console.log(`[Teams] Sending notification (attempt ${attemptsMade + 1}): ${message.title}`);

  try {
    const adaptiveCard = buildAdaptiveCard(message);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(adaptiveCard),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const errorMsg = `Teams webhook returned ${response.status}: ${responseText}`;

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

    console.log(`[Teams] Successfully sent notification`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Teams] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
