import { Job } from "bullmq";
import * as React from "react";
import { sendEmail, ComponentNotificationEmail } from "@uni-status/email";
import { db } from "@uni-status/database";
import { componentSubscriptions } from "@uni-status/database/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAppUrl, getApiUrl } from "@uni-status/shared/config";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-component-subscriber" });


// Component subscription notification job data
export interface ComponentSubscriptionNotificationJob {
  notificationType: "incident_created" | "maintenance_scheduled" | "status_change";
  statusPageId: string;
  statusPageSlug: string;
  statusPageName: string;
  affectedMonitors: Array<{ id: string; name: string }>;
  // For incident/maintenance
  eventType?: "incident" | "maintenance";
  eventId?: string;
  eventTitle?: string;
  eventStatus?: string;
  eventSeverity?: string;
  eventDescription?: string;
  // For status change
  previousStatus?: string;
  newStatus?: string;
}

// Build the event URL based on environment
function getEventUrl(slug: string, eventType: string, eventId: string): string {
  return `${getAppUrl()}/status/${slug}/events/${eventType}/${eventId}`;
}

// Build the status page URL
function getStatusPageUrl(slug: string): string {
  return `${getAppUrl()}/status/${slug}`;
}

// Build the unsubscribe URL using the component unsubscribe endpoint
function getUnsubscribeUrl(token: string): string {
  return `${getApiUrl()}/public/components/unsubscribe?token=${token}`;
}

// Determine which notifyOn field to check based on notification type
function getNotifyOnField(notificationType: string): keyof { newIncident: boolean; newMaintenance: boolean; statusChange: boolean } {
  switch (notificationType) {
    case "incident_created":
      return "newIncident";
    case "maintenance_scheduled":
      return "newMaintenance";
    case "status_change":
      return "statusChange";
    default:
      return "newIncident";
  }
}

// Process component subscription notification with batching
async function processComponentNotification(
  job: Job<ComponentSubscriptionNotificationJob>
): Promise<{ success: boolean; sent: number; errors: number }> {
  const {
    notificationType,
    statusPageId,
    statusPageSlug,
    statusPageName,
    affectedMonitors,
    eventType,
    eventId,
    eventTitle,
    eventStatus,
    eventDescription,
    previousStatus,
    newStatus,
  } = job.data;

  const monitorIds = affectedMonitors.map((m) => m.id);
  const notifyOnField = getNotifyOnField(notificationType);

  // Get all verified subscribers for the affected monitors on this status page
  const allSubscribers = await db.query.componentSubscriptions.findMany({
    where: and(
      eq(componentSubscriptions.statusPageId, statusPageId),
      inArray(componentSubscriptions.monitorId, monitorIds),
      eq(componentSubscriptions.verified, true)
    ),
  });

  if (allSubscribers.length === 0) {
    log.info(
      `[ComponentSubscriber] No subscribers found for monitors on status page ${statusPageId}`
    );
    return { success: true, sent: 0, errors: 0 };
  }

  // Filter subscribers by their notifyOn preferences and group by email
  // This implements batching - one email per subscriber listing all affected monitors
  const subscriberMonitorMap = new Map<string, {
    subscription: typeof allSubscribers[0];
    monitors: Array<{ id: string; name: string }>;
  }>();

  for (const subscriber of allSubscribers) {
    const notifyOn = subscriber.notifyOn as { newIncident?: boolean; newMaintenance?: boolean; statusChange?: boolean } | null;

    // Check if subscriber wants this type of notification
    if (!notifyOn || !notifyOn[notifyOnField]) {
      continue;
    }

    const email = subscriber.email || subscriber.userId;
    if (!email) continue;

    const key = subscriber.email || subscriber.userId || subscriber.id;
    const existing = subscriberMonitorMap.get(key);
    const monitorInfo = affectedMonitors.find((m) => m.id === subscriber.monitorId);

    if (!monitorInfo) continue;

    if (existing) {
      // Add this monitor to their existing list
      existing.monitors.push(monitorInfo);
    } else {
      // New subscriber
      subscriberMonitorMap.set(key, {
        subscription: subscriber,
        monitors: [monitorInfo],
      });
    }
  }

  if (subscriberMonitorMap.size === 0) {
    log.info(
      `[ComponentSubscriber] No subscribers opted in for ${notificationType} notifications`
    );
    return { success: true, sent: 0, errors: 0 };
  }

  log.info(
    `[ComponentSubscriber] Sending ${notificationType} to ${subscriberMonitorMap.size} subscribers`
  );

  const statusPageUrl = getStatusPageUrl(statusPageSlug);
  const eventUrl = eventType && eventId
    ? getEventUrl(statusPageSlug, eventType, eventId)
    : undefined;

  let sent = 0;
  let errors = 0;

  // Send batched email to each unique subscriber
  for (const [, { subscription, monitors }] of subscriberMonitorMap) {
    try {
      const unsubscribeUrl = getUnsubscribeUrl(subscription.unsubscribeToken);
      const recipientEmail = subscription.email;

      if (!recipientEmail) {
        log.info(`[ComponentSubscriber] Skipping subscriber with no email`);
        continue;
      }

      const emailComponent = React.createElement(ComponentNotificationEmail, {
        notificationType: notificationType.replace("_created", "").replace("_scheduled", "") as "incident" | "maintenance" | "status_change",
        statusPageName,
        statusPageUrl,
        affectedMonitors: monitors,
        eventTitle,
        eventStatus,
        eventDescription: eventDescription || undefined,
        eventUrl,
        previousStatus,
        newStatus,
        unsubscribeUrl,
      });

      // Build subject based on notification type
      let subject: string;
      const monitorNames = monitors.map((m) => m.name).join(", ");

      switch (notificationType) {
        case "incident_created":
          subject = `[${statusPageName}] New Incident: ${eventTitle || monitorNames}`;
          break;
        case "maintenance_scheduled":
          subject = `[${statusPageName}] Scheduled Maintenance: ${eventTitle || monitorNames}`;
          break;
        case "status_change":
          subject = `[${statusPageName}] Status Change: ${monitorNames} is now ${newStatus}`;
          break;
        default:
          subject = `[${statusPageName}] Update for ${monitorNames}`;
      }

      const result = await sendEmail({
        to: recipientEmail,
        subject,
        react: emailComponent,
      });

      if (result.success) {
        sent++;
      } else {
        log.error(
          `[ComponentSubscriber] Failed to send to ${recipientEmail}:`,
          result.error
        );
        errors++;
      }
    } catch (error) {
      log.error(
        `[ComponentSubscriber] Error sending to subscriber:`,
        error instanceof Error ? error.message : "Unknown error"
      );
      errors++;
    }
  }

  log.info(
    `[ComponentSubscriber] Completed: sent=${sent}, errors=${errors}`
  );

  return { success: true, sent, errors };
}

// Main processor function
export async function processComponentSubscriptionNotification(
  job: Job<ComponentSubscriptionNotificationJob>
): Promise<{ success: boolean; sent: number; errors: number }> {
  const { notificationType, statusPageId } = job.data;
  const attemptsMade = job.attemptsMade;

  log.info(
    `[ComponentSubscriber] Processing ${notificationType} for status page ${statusPageId} (attempt ${attemptsMade + 1})`
  );

  try {
    return await processComponentNotification(job);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(
      `[ComponentSubscriber] Error processing ${notificationType} notification (attempt ${attemptsMade + 1}):`,
      errorMessage
    );
    throw error;
  }
}
