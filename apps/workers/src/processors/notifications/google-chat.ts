import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";

interface GoogleChatNotificationJob {
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

// Map severity to Google Chat card header color
function getSeverityColor(severity?: string): string {
  switch (severity) {
    case "critical":
      return "#EA4335"; // Red
    case "major":
      return "#FBBC04"; // Yellow
    case "minor":
      return "#4285F4"; // Blue
    case "resolved":
      return "#34A853"; // Green
    default:
      return "#5F6368"; // Gray
  }
}

// Build a Google Chat card message
function buildGoogleChatCard(message: GoogleChatNotificationJob["message"]) {
  const color = getSeverityColor(message.severity);

  const widgets: Array<Record<string, unknown>> = [];

  // Add main text
  widgets.push({
    textParagraph: {
      text: message.text,
    },
  });

  // Add key-value widgets for details
  if (message.monitorName || message.severity || message.timestamp) {
    const keyValueWidgets: Array<Record<string, unknown>> = [];

    if (message.monitorName) {
      keyValueWidgets.push({
        decoratedText: {
          topLabel: "Monitor",
          text: message.monitorName,
          startIcon: {
            knownIcon: "BOOKMARK",
          },
        },
      });
    }

    if (message.severity) {
      keyValueWidgets.push({
        decoratedText: {
          topLabel: "Severity",
          text: message.severity.charAt(0).toUpperCase() + message.severity.slice(1),
          startIcon: {
            knownIcon: "DESCRIPTION",
          },
        },
      });
    }

    if (message.timestamp) {
      keyValueWidgets.push({
        decoratedText: {
          topLabel: "Time",
          text: message.timestamp,
          startIcon: {
            knownIcon: "CLOCK",
          },
        },
      });
    }

    widgets.push({
      columns: {
        columnItems: keyValueWidgets.map((w) => ({
          horizontalSizeStyle: "FILL_AVAILABLE_SPACE",
          horizontalAlignment: "START",
          verticalAlignment: "CENTER",
          widgets: [w],
        })),
      },
    });
  }

  // Add button if status page URL is provided
  if (message.statusPageUrl) {
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: "View Status Page",
            onClick: {
              openLink: {
                url: message.statusPageUrl,
              },
            },
          },
        ],
      },
    });
  }

  const card = {
    cardsV2: [
      {
        cardId: `alert-${Date.now()}`,
        card: {
          header: {
            title: message.title,
            subtitle: message.severity
              ? `Severity: ${message.severity.toUpperCase()}`
              : "Uni-Status Alert",
            imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/warning/default/48px.svg",
            imageType: "CIRCLE",
          },
          sections: [
            {
              widgets,
            },
          ],
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

export async function processGoogleChatNotification(job: Job<GoogleChatNotificationJob>) {
  const { webhookUrl, message, alertHistoryId, channelId } = job.data;
  const attemptsMade = job.attemptsMade;

  console.log(`[Google Chat] Sending notification (attempt ${attemptsMade + 1}): ${message.title}`);

  try {
    const chatCard = buildGoogleChatCard(message);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(chatCard),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const errorMsg = `Google Chat webhook returned ${response.status}: ${responseText}`;

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

    console.log(`[Google Chat] Successfully sent notification`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Google Chat] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
