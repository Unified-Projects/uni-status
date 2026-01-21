import { Job } from "bullmq";
import * as React from "react";
import { sendEmail, EventUpdateEmail } from "@uni-status/email";
import { db } from "@uni-status/database";
import { eventSubscriptions } from "@uni-status/database/schema";
import { eq, and } from "drizzle-orm";
import { getAppUrl, getApiUrl } from "@uni-status/shared/config";

// Event subscription notification job data
export interface EventSubscriptionNotificationJob {
  eventType: "incident" | "maintenance";
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  eventDescription: string | null;
  updateMessage?: string;
  statusPageSlug: string;
  statusPageName: string;
}

// Build the event URL based on environment
function getEventUrl(slug: string, eventType: string, eventId: string): string {
  return `${getAppUrl()}/status/${slug}/events/${eventType}/${eventId}`;
}

// Build the unsubscribe URL using the event unsubscribe endpoint
function getUnsubscribeUrl(token: string): string {
  return `${getApiUrl()}/public/events/unsubscribe?token=${token}`;
}

// Process event subscription notification
async function processEventNotification(
  job: Job<EventSubscriptionNotificationJob>
): Promise<{ success: boolean; sent: number; errors: number }> {
  const {
    eventType,
    eventId,
    eventTitle,
    eventStatus,
    eventDescription,
    updateMessage,
    statusPageSlug,
    statusPageName,
  } = job.data;

  // Get all verified subscribers for this event
  const subscribers = await db.query.eventSubscriptions.findMany({
    where: and(
      eq(eventSubscriptions.eventType, eventType),
      eq(eventSubscriptions.eventId, eventId),
      eq(eventSubscriptions.verified, true)
    ),
  });

  if (subscribers.length === 0) {
    console.log(`[EventSubscriber] No subscribers found for ${eventType}/${eventId}`);
    return { success: true, sent: 0, errors: 0 };
  }

  console.log(
    `[EventSubscriber] Sending ${eventType} update to ${subscribers.length} subscribers`
  );

  const eventUrl = getEventUrl(statusPageSlug, eventType, eventId);
  let sent = 0;
  let errors = 0;

  // Send email to each subscriber
  for (const subscriber of subscribers) {
    try {
      if (!subscriber.email) {
        console.warn("[EventSubscriber] Missing subscriber email, skipping");
        errors++;
        continue;
      }
      const unsubscribeUrl = getUnsubscribeUrl(subscriber.unsubscribeToken);

      const emailComponent = React.createElement(EventUpdateEmail, {
        eventType,
        eventTitle,
        eventStatus,
        eventDescription: eventDescription || undefined,
        statusPageName,
        statusPageSlug,
        eventUrl,
        unsubscribeUrl,
        updateMessage,
      });

      const subject = eventType === "incident"
        ? `[${statusPageName}] Incident Update: ${eventTitle}`
        : `[${statusPageName}] Maintenance Update: ${eventTitle}`;

      const result = await sendEmail({
        to: subscriber.email,
        subject,
        react: emailComponent,
      });

      if (result.success) {
        sent++;
      } else {
        console.error(
          `[EventSubscriber] Failed to send to ${subscriber.email}:`,
          result.error
        );
        errors++;
      }
    } catch (error) {
      console.error(
        `[EventSubscriber] Error sending to ${subscriber.email}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
      errors++;
    }
  }

  console.log(
    `[EventSubscriber] Completed: sent=${sent}, errors=${errors}`
  );

  return { success: true, sent, errors };
}

// Main processor function
export async function processEventSubscriptionNotification(
  job: Job<EventSubscriptionNotificationJob>
): Promise<{ success: boolean; sent: number; errors: number }> {
  const { eventType, eventId } = job.data;
  const attemptsMade = job.attemptsMade;

  console.log(
    `[EventSubscriber] Processing ${eventType}/${eventId} notification (attempt ${attemptsMade + 1})`
  );

  try {
    return await processEventNotification(job);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[EventSubscriber] Error processing ${eventType}/${eventId} notification (attempt ${attemptsMade + 1}):`,
      errorMessage
    );
    throw error;
  }
}
