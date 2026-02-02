import { Job } from "bullmq";
import * as React from "react";
import { sendEmail, SubscriberMaintenanceEmail, SubscriberIncidentEmail } from "@uni-status/email";
import { getAppUrl } from "@uni-status/shared/config";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-subscriber" });


// Subscriber notification job types
type SubscriberNotificationType = "maintenance" | "incident";
type MaintenanceNotificationType = "beforeStart" | "onStart" | "onEnd";

// Maintenance notification job data
interface MaintenanceNotificationJob {
  type: "maintenance";
  notificationType: MaintenanceNotificationType;
  maintenanceWindowId: string;
  maintenanceTitle: string;
  maintenanceDescription: string | null;
  startsAt: string;
  endsAt: string;
  subscriberId: string;
  subscriberEmail: string;
  unsubscribeToken: string;
  statusPageId: string;
  statusPageName: string;
  statusPageSlug: string;
  subject: string;
}

// Future: Incident notification job data
interface IncidentNotificationJob {
  type: "incident";
  incidentId: string;
  incidentTitle: string;
  status: string;
  severity: string;
  message: string;
  subscriberId: string;
  subscriberEmail: string;
  unsubscribeToken: string;
  statusPageId: string;
  statusPageName: string;
  statusPageSlug: string;
  subject: string;
}

type SubscriberNotificationJob = MaintenanceNotificationJob | IncidentNotificationJob;

// Build the status page URL based on environment
function getStatusPageUrl(slug: string): string {
  return `${getAppUrl()}/status/${slug}`;
}

// Build the unsubscribe URL
function getUnsubscribeUrl(slug: string, token: string): string {
  return `${getAppUrl()}/status/${slug}/unsubscribe?token=${token}`;
}

// Format date for display
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// Process maintenance notification
async function processMaintenanceNotification(
  job: Job<MaintenanceNotificationJob>
): Promise<{ success: boolean; to: string }> {
  const {
    maintenanceTitle,
    maintenanceDescription,
    startsAt,
    endsAt,
    subscriberEmail,
    unsubscribeToken,
    statusPageName,
    statusPageSlug,
    notificationType,
  } = job.data;

  const statusPageUrl = getStatusPageUrl(statusPageSlug);
  const unsubscribeUrl = getUnsubscribeUrl(statusPageSlug, unsubscribeToken);

  // Add notification type context to subject/title
  const titleWithContext = {
    beforeStart: `Upcoming: ${maintenanceTitle}`,
    onStart: `Started: ${maintenanceTitle}`,
    onEnd: `Completed: ${maintenanceTitle}`,
  }[notificationType];

  // Build the email component
  const emailComponent = React.createElement(SubscriberMaintenanceEmail, {
    statusPageName,
    maintenanceTitle: titleWithContext,
    startsAt: formatDateTime(startsAt),
    endsAt: formatDateTime(endsAt),
    description: maintenanceDescription || undefined,
    statusPageUrl,
    unsubscribeUrl,
  });

  // Determine subject based on notification type
  const subject = {
    beforeStart: `[${statusPageName}] Upcoming Scheduled Maintenance: ${maintenanceTitle}`,
    onStart: `[${statusPageName}] Scheduled Maintenance Started: ${maintenanceTitle}`,
    onEnd: `[${statusPageName}] Scheduled Maintenance Completed: ${maintenanceTitle}`,
  }[notificationType];

  // Send the email
  const result = await sendEmail({
    to: subscriberEmail,
    subject,
    react: emailComponent,
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to send subscriber email");
  }

  return { success: true, to: subscriberEmail };
}

// Process incident notification
async function processIncidentNotification(
  job: Job<IncidentNotificationJob>
): Promise<{ success: boolean; to: string }> {
  const {
    incidentTitle,
    status,
    severity,
    message,
    subscriberEmail,
    unsubscribeToken,
    statusPageName,
    statusPageSlug,
  } = job.data;

  const statusPageUrl = getStatusPageUrl(statusPageSlug);
  const unsubscribeUrl = getUnsubscribeUrl(statusPageSlug, unsubscribeToken);

  // Build the email component
  const emailComponent = React.createElement(SubscriberIncidentEmail, {
    statusPageName,
    incidentTitle,
    status,
    severity,
    message,
    statusPageUrl,
    unsubscribeUrl,
  });

  // Build subject line with severity indicator
  const severityPrefix = severity === "critical" ? "[CRITICAL]" : severity === "major" ? "[MAJOR]" : "";
  const subject = `[${statusPageName}] ${severityPrefix} Incident Update: ${incidentTitle}`.trim();

  // Send the email
  const result = await sendEmail({
    to: subscriberEmail,
    subject,
    react: emailComponent,
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to send subscriber email");
  }

  return { success: true, to: subscriberEmail };
}

// Main processor function
export async function processSubscriberNotification(
  job: Job<SubscriberNotificationJob>
): Promise<{ success: boolean; to: string }> {
  const { type } = job.data;
  const attemptsMade = job.attemptsMade;

  log.info(
    `[Subscriber] Processing ${type} notification (attempt ${attemptsMade + 1})`
  );

  try {
    switch (type) {
      case "maintenance":
        return await processMaintenanceNotification(
          job as Job<MaintenanceNotificationJob>
        );

      case "incident":
        return await processIncidentNotification(
          job as Job<IncidentNotificationJob>
        );

      default:
        throw new Error(`Unknown subscriber notification type: ${type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(
      `[Subscriber] Error processing ${type} notification (attempt ${attemptsMade + 1}):`,
      errorMessage
    );
    throw error;
  }
}

// Export types for use elsewhere
export type {
  SubscriberNotificationJob,
  MaintenanceNotificationJob,
  IncidentNotificationJob,
  MaintenanceNotificationType,
};
