import * as React from "react";
import {
  sendEmail,
  InvitationEmail,
  SubscriberVerificationEmail,
  ComponentSubscriptionVerificationEmail,
  EventSubscriptionVerificationEmail,
} from "@uni-status/email";
import { getAppUrl } from "@uni-status/shared/config";

const APP_URL = getAppUrl();

/**
 * Send a subscriber verification email
 */
export async function sendSubscriberVerificationEmail({
  email,
  statusPageName,
  statusPageSlug,
  verificationToken,
}: {
  email: string;
  statusPageName: string;
  statusPageSlug: string;
  verificationToken: string;
}) {
  const verificationUrl = `${APP_URL}/status/${statusPageSlug}/subscribe/verify?token=${verificationToken}`;
  const statusPageUrl = `${APP_URL}/status/${statusPageSlug}`;

  const result = await sendEmail({
    to: email,
    subject: `Confirm your subscription to ${statusPageName}`,
    react: React.createElement(SubscriberVerificationEmail, {
      statusPageName,
      verificationUrl,
      statusPageUrl,
    }),
  });

  if (!result.success) {
    console.error(
      `[Email] Failed to send subscriber verification email to ${email}:`,
      result.error
    );
  } else {
    console.log(
      `[Email] Sent subscriber verification email to ${email} for ${statusPageName}`
    );
  }

  return result;
}

/**
 * Send an organization invitation email
 */
export async function sendInvitationEmail({
  email,
  inviterName,
  organizationName,
  role,
  inviteToken,
  expiresAt,
}: {
  email: string;
  inviterName: string;
  organizationName: string;
  role: string;
  inviteToken: string;
  expiresAt: Date;
}) {
  const inviteUrl = `${APP_URL}/invite/${inviteToken}`;
  const formattedExpiry = expiresAt.toLocaleDateString("en-GB", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const result = await sendEmail({
    to: email,
    subject: `You've been invited to join ${organizationName}`,
    react: React.createElement(InvitationEmail, {
      inviterName,
      organizationName,
      role,
      inviteUrl,
      expiresAt: formattedExpiry,
    }),
  });

  if (!result.success) {
    console.error(
      `[Email] Failed to send invitation email to ${email}:`,
      result.error
    );
  } else {
    console.log(
      `[Email] Sent invitation email to ${email} for ${organizationName}`
    );
  }

  return result;
}

/**
 * Send a component subscription verification email
 */
export async function sendComponentSubscriptionVerificationEmail({
  email,
  statusPageName,
  statusPageSlug,
  monitorName,
  verificationToken,
}: {
  email: string;
  statusPageName: string;
  statusPageSlug: string;
  monitorName: string;
  verificationToken: string;
}) {
  const verificationUrl = `${APP_URL}/api/public/status-pages/${statusPageSlug}/components/verify?token=${verificationToken}`;
  const statusPageUrl = `${APP_URL}/status/${statusPageSlug}`;

  const result = await sendEmail({
    to: email,
    subject: `Confirm your subscription to ${monitorName} on ${statusPageName}`,
    react: React.createElement(ComponentSubscriptionVerificationEmail, {
      statusPageName,
      monitorName,
      verificationUrl,
      statusPageUrl,
    }),
  });

  if (!result.success) {
    console.error(
      `[Email] Failed to send component subscription verification email to ${email}:`,
      result.error
    );
  } else {
    console.log(
      `[Email] Sent component subscription verification email to ${email} for ${monitorName} on ${statusPageName}`
    );
  }

  return result;
}

/**
 * Send an event subscription verification email
 */
export async function sendEventSubscriptionVerificationEmail({
  email,
  eventType,
  eventId,
  eventTitle,
  statusPageName,
  statusPageSlug,
  verificationToken,
}: {
  email: string;
  eventType: "incident" | "maintenance";
  eventId: string;
  eventTitle: string;
  statusPageName: string;
  statusPageSlug: string;
  verificationToken: string;
}) {
  const verificationUrl = `${APP_URL}/api/public/events/${eventType}/${eventId}/verify?token=${verificationToken}`;
  const statusPageUrl = `${APP_URL}/status/${statusPageSlug}`;

  const result = await sendEmail({
    to: email,
    subject: `Confirm your subscription to ${eventTitle}`,
    react: React.createElement(EventSubscriptionVerificationEmail, {
      eventType,
      eventTitle,
      statusPageName,
      verificationUrl,
      statusPageUrl,
    }),
  });

  if (!result.success) {
    console.error(
      `[Email] Failed to send event subscription verification email to ${email}:`,
      result.error
    );
  } else {
    console.log(
      `[Email] Sent event subscription verification email to ${email} for ${eventTitle}`
    );
  }

  return result;
}
