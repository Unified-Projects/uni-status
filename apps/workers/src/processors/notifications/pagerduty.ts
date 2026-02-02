import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-pagerduty" });


interface PagerDutyNotificationJob {
  routingKey: string;
  message: {
    eventAction: "trigger" | "acknowledge" | "resolve";
    dedupKey?: string;
    severity?: "critical" | "error" | "warning" | "info";
    summary: string;
    source: string;
    component?: string;
    group?: string;
    customDetails?: Record<string, unknown>;
    links?: Array<{ href: string; text: string }>;
  };
  alertHistoryId?: string;
  channelId?: string;
}

const PAGERDUTY_EVENTS_API = "https://events.pagerduty.com/v2/enqueue";

function buildPagerDutyPayload(routingKey: string, message: PagerDutyNotificationJob["message"]) {
  const payload: Record<string, unknown> = {
    routing_key: routingKey,
    event_action: message.eventAction,
  };

  // Add dedup_key for idempotency
  if (message.dedupKey) {
    payload.dedup_key = message.dedupKey;
  }

  // For trigger events, include full payload
  if (message.eventAction === "trigger") {
    payload.payload = {
      summary: message.summary,
      source: message.source,
      severity: message.severity || "error",
      ...(message.component ? { component: message.component } : {}),
      ...(message.group ? { group: message.group } : {}),
      ...(message.customDetails ? { custom_details: message.customDetails } : {}),
    };

    if (message.links && message.links.length > 0) {
      payload.links = message.links;
    }
  }

  return payload;
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

export async function processPagerDutyNotification(job: Job<PagerDutyNotificationJob>) {
  const { routingKey, message, alertHistoryId, channelId } = job.data;
  const attemptsMade = job.attemptsMade;

  log.info(`[PagerDuty] Sending ${message.eventAction} event (attempt ${attemptsMade + 1}): ${message.summary}`);

  try {
    const payload = buildPagerDutyPayload(routingKey, message);

    const response = await fetch(PAGERDUTY_EVENTS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg = `PagerDuty API returned ${response.status}: ${responseData.message || responseData.error || "Unknown error"}`;

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

    log.info(`[PagerDuty] Successfully sent ${message.eventAction} event, dedup_key: ${responseData.dedup_key || message.dedupKey}`);
    return {
      success: true,
      statusCode: response.status,
      dedupKey: responseData.dedup_key || message.dedupKey,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(`[PagerDuty] Failed (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}
