import { Job } from "bullmq";
import * as React from "react";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";
import {
  sendEmail,
  AlertEmail,
  IncidentEmail,
  InvitationEmail,
  VerificationEmail,
  SubscriberVerificationEmail,
  SubscriberMaintenanceEmail,
} from "@uni-status/email";
import type { SmtpCredentials, ResendCredentials } from "@uni-status/shared/types/credentials";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-email" });


// Alert email data
interface AlertEmailData {
  monitorName: string;
  monitorUrl: string;
  status: "down" | "degraded" | "recovered";
  message?: string;
  responseTime?: number;
  statusCode?: number;
  dashboardUrl: string;
  timestamp: string;
}

// Incident email data
interface IncidentEmailData {
  type: "created" | "updated" | "resolved";
  incidentTitle: string;
  status: string;
  severity: "minor" | "major" | "critical";
  message: string;
  statusPageUrl: string;
  timestamp: string;
  affectedServices?: string[];
}

// Invitation email data
interface InvitationEmailData {
  inviterName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
}

// Verification email data
interface VerificationEmailData {
  verificationUrl: string;
  expiresIn: string;
}

// Subscriber verification email data
interface SubscriberVerificationEmailData {
  statusPageName: string;
  verificationUrl: string;
  statusPageUrl: string;
}

// Subscriber maintenance email data
interface SubscriberMaintenanceEmailData {
  statusPageName: string;
  maintenanceTitle: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  statusPageUrl: string;
  unsubscribeUrl: string;
}

interface EmailNotificationJobBase {
  to: string | string[];
  subject: string;
  // Optional IDs for logging (present when triggered by alerts, absent for test/other notifications)
  alertHistoryId?: string;
  channelId?: string;
  // BYO org credentials for email
  orgSmtpCredentials?: SmtpCredentials;
  orgResendCredentials?: ResendCredentials;
}

type EmailNotificationJob =
  | (EmailNotificationJobBase & { emailType: "alert"; data: AlertEmailData })
  | (EmailNotificationJobBase & { emailType: "incident"; data: IncidentEmailData })
  | (EmailNotificationJobBase & { emailType: "invitation"; data: InvitationEmailData })
  | (EmailNotificationJobBase & { emailType: "verification"; data: VerificationEmailData })
  | (EmailNotificationJobBase & { emailType: "subscriber_verification"; data: SubscriberVerificationEmailData })
  | (EmailNotificationJobBase & { emailType: "subscriber_maintenance"; data: SubscriberMaintenanceEmailData });

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

// Build the React email component based on type
function buildEmailComponent(job: EmailNotificationJob): React.ReactElement {
  switch (job.emailType) {
    case "alert":
      return React.createElement(AlertEmail, job.data);

    case "incident":
      return React.createElement(IncidentEmail, job.data);

    case "invitation":
      return React.createElement(InvitationEmail, job.data);

    case "verification":
      return React.createElement(
        VerificationEmail,
        job.data
      );

    case "subscriber_verification":
      return React.createElement(
        SubscriberVerificationEmail,
        job.data
      );

    case "subscriber_maintenance":
      return React.createElement(
        SubscriberMaintenanceEmail,
        job.data
      );

    default:
      throw new Error("Unknown email type");
  }
}

export async function processEmailNotification(
  job: Job<EmailNotificationJob>
): Promise<{ success: boolean; to: string | string[] }> {
  if (!job.data) {
    log.error({
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade
    }, `[Email] Job ${job.id} has no data`);
    throw new Error("Email job data is missing");
  }

  // Defensive destructuring with defaults
  const {
    to = '',
    subject = '',
    emailType,
    alertHistoryId,
    channelId,
    orgSmtpCredentials,
    orgResendCredentials,
  } = job.data || {};

  // Validate required fields
  if (!to || !subject || !emailType) {
    log.error({
      hasTo: !!to,
      hasSubject: !!subject,
      hasEmailType: !!emailType,
      jobData: JSON.stringify(job.data)
    }, `[Email] Job ${job.id} has invalid data`);
    throw new Error(`Email job missing required fields: ${!to ? 'to' : ''} ${!subject ? 'subject' : ''} ${!emailType ? 'emailType' : ''}`);
  }

  const attemptsMade = job.attemptsMade;

  log.info(`[Email] Processing ${emailType} email to ${to} (attempt ${attemptsMade + 1}): ${subject}`);

  try {
    // Build the email component
    let emailComponent;
    try {
      emailComponent = buildEmailComponent(job.data);
      if (!emailComponent) {
        throw new Error(`buildEmailComponent returned null for emailType: ${emailType}`);
      }
    } catch (err) {
      log.error({
        error: err instanceof Error ? err.message : String(err),
        emailType,
        to
      }, `[Email] Failed to build email component (attempt ${attemptsMade + 1})`);
      throw err;
    }

    // Send the email with org credentials if provided
    const result = await sendEmail({
      to,
      subject,
      react: emailComponent,
      smtpConfig: orgSmtpCredentials,
      resendConfig: orgResendCredentials,
    });

    if (!result.success) {
      const errorMsg = result.error || "Email send failed";
      log.error({
        error: errorMsg,
        to,
        subject,
        hasOrgSmtp: !!orgSmtpCredentials,
        hasOrgResend: !!orgResendCredentials,
        hasPlatformResend: !!process.env.RESEND_API_KEY
      }, `[Email] Failed to send ${emailType} email (attempt ${attemptsMade + 1})`);

      // Log failure on final attempt
      if (alertHistoryId && channelId && attemptsMade >= 4) {
        await logNotification(alertHistoryId, channelId, false, null, errorMsg, attemptsMade + 1);
      }

      // Throw to trigger retry
      throw new Error(errorMsg);
    }

    // Log success
    if (alertHistoryId && channelId) {
      await logNotification(alertHistoryId, channelId, true, null, null, attemptsMade + 1);
    }

    log.info(`[Email] Successfully sent ${emailType} email to ${to}`);
    return { success: true, to };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(`[Email] Error processing ${emailType} email (attempt ${attemptsMade + 1}):`, errorMessage);

    // Log failure on final attempt (5 total attempts = index 4)
    if (alertHistoryId && channelId && attemptsMade >= 4) {
      await logNotification(alertHistoryId, channelId, false, null, errorMessage, attemptsMade + 1);
    }

    throw error;
  }
}

// Export types for use in other parts of the application
export type {
  EmailNotificationJob,
  AlertEmailData,
  IncidentEmailData,
  InvitationEmailData,
  VerificationEmailData,
  SubscriberVerificationEmailData,
  SubscriberMaintenanceEmailData,
};
