import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-ntfy" });


interface NtfyNotificationJob {
  topic: string;
  server?: string;  // Default: https://ntfy.sh
  message: {
    title: string;
    body: string;
    priority?: 1 | 2 | 3 | 4 | 5;  // 1=min, 3=default, 5=max
    tags?: string[];  // Emoji tags like "warning", "skull", etc.
    click?: string;   // URL to open when notification is clicked
    actions?: Array<{
      action: "view" | "broadcast" | "http";
      label: string;
      url?: string;
      clear?: boolean;
    }>;
  };
  alertHistoryId?: string;
  channelId?: string;
  // BYO org ntfy credentials
  orgNtfyUsername?: string;
  orgNtfyPassword?: string;
}

// Map severity to ntfy priority and tags
function getSeverityConfig(severity?: string): { priority: number; tags: string[] } {
  switch (severity) {
    case "critical":
      return { priority: 5, tags: ["rotating_light", "warning"] };
    case "major":
      return { priority: 4, tags: ["warning"] };
    case "minor":
      return { priority: 3, tags: ["information_source"] };
    case "resolved":
      return { priority: 2, tags: ["white_check_mark"] };
    default:
      return { priority: 3, tags: [] };
  }
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

export async function processNtfyNotification(job: Job<NtfyNotificationJob>) {
  const {
    topic,
    server,
    message,
    alertHistoryId,
    channelId,
    orgNtfyUsername,
    orgNtfyPassword,
  } = job.data;
  const attemptsMade = job.attemptsMade;

  const ntfyServer = server || "https://ntfy.sh";
  const ntfyUrl = `${ntfyServer}/${topic}`;

  log.info(`[Ntfy] Sending notification to ${topic} (attempt ${attemptsMade + 1}): ${message.title}`);

  try {
    // Build headers for ntfy
    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      "Title": message.title,
    };

    // Add Basic auth if org credentials are provided
    if (orgNtfyUsername && orgNtfyPassword) {
      headers["Authorization"] = `Basic ${Buffer.from(`${orgNtfyUsername}:${orgNtfyPassword}`).toString("base64")}`;
    }

    if (message.priority) {
      headers["Priority"] = String(message.priority);
    }

    if (message.tags && message.tags.length > 0) {
      headers["Tags"] = message.tags.join(",");
    }

    if (message.click) {
      headers["Click"] = message.click;
    }

    if (message.actions && message.actions.length > 0) {
      // Format: action=view, View Details, https://example.com; action=http, ...
      const actionsStr = message.actions
        .map((a) => {
          const parts = [a.action, a.label];
          if (a.url) parts.push(a.url);
          if (a.clear) parts.push("clear=true");
          return parts.join(", ");
        })
        .join("; ");
      headers["Actions"] = actionsStr;
    }

    const response = await fetch(ntfyUrl, {
      method: "POST",
      headers,
      body: message.body,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const errorMsg = `Ntfy returned ${response.status}: ${responseText}`;

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

    log.info(`[Ntfy] Successfully sent notification to ${topic}`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(`[Ntfy] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
