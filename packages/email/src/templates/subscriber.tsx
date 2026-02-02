import {
  Section,
  Text,
  Button,
  Link,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

interface SubscriberVerificationEmailProps {
  statusPageName: string;
  verificationUrl: string;
  statusPageUrl: string;
}

export function SubscriberVerificationEmail({
  statusPageName,
  verificationUrl,
  statusPageUrl,
}: SubscriberVerificationEmailProps) {
  return (
    <BaseEmail preview={`Confirm your subscription to ${statusPageName}`}>
      <Section style={content}>
        <Text style={heading}>Confirm your subscription</Text>

        <Text style={paragraph}>
          You&apos;ve requested to receive status updates from{" "}
          <Link href={statusPageUrl} style={link}>
            {statusPageName}
          </Link>
          . Please confirm your subscription by clicking the button below.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={verificationUrl}>
            Confirm Subscription
          </Button>
        </Section>

        <Text style={altText}>
          If you didn&apos;t request this subscription, you can safely ignore this
          email.
        </Text>
      </Section>
    </BaseEmail>
  );
}

interface SubscriberMaintenanceEmailProps {
  statusPageName: string;
  maintenanceTitle: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  statusPageUrl: string;
  unsubscribeUrl: string;
}

export function SubscriberMaintenanceEmail({
  statusPageName,
  maintenanceTitle,
  startsAt,
  endsAt,
  description,
  statusPageUrl,
  unsubscribeUrl,
}: SubscriberMaintenanceEmailProps) {
  return (
    <BaseEmail preview={`Scheduled maintenance: ${maintenanceTitle}`}>
      <Section style={content}>
        <Text style={typeLabel}>Scheduled Maintenance</Text>
        <Text style={heading}>{maintenanceTitle}</Text>

        <Section style={detailsBox}>
          <Text style={detailLabel}>Service</Text>
          <Text style={detailValue}>{statusPageName}</Text>

          <Text style={detailLabel}>Start Time</Text>
          <Text style={detailValue}>{startsAt}</Text>

          <Text style={detailLabel}>End Time</Text>
          <Text style={detailValue}>{endsAt}</Text>

          {description && (
            <>
              <Text style={detailLabel}>Details</Text>
              <Text style={detailValue}>{description}</Text>
            </>
          )}
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={statusPageUrl}>
            View Status Page
          </Button>
        </Section>

        <Text style={unsubscribeText}>
          <Link href={unsubscribeUrl} style={unsubscribeLink}>
            Unsubscribe
          </Link>{" "}
          from status updates
        </Text>
      </Section>
    </BaseEmail>
  );
}

interface SubscriberIncidentEmailProps {
  statusPageName: string;
  incidentTitle: string;
  status: string;
  severity: string;
  message: string;
  statusPageUrl: string;
  unsubscribeUrl: string;
}

export function SubscriberIncidentEmail({
  statusPageName,
  incidentTitle,
  status,
  severity,
  message,
  statusPageUrl,
  unsubscribeUrl,
}: SubscriberIncidentEmailProps) {
  const severityColors: Record<string, string> = {
    critical: "#ef4444",
    major: "#f97316",
    minor: "#eab308",
    maintenance: "#3b82f6",
  };

  const statusColors: Record<string, string> = {
    investigating: "#eab308",
    identified: "#f97316",
    monitoring: "#3b82f6",
    resolved: "#22c55e",
  };

  const severityColor = severityColors[severity] || "#6b7280";
  const statusColor = statusColors[status] || "#6b7280";

  const statusLabel: Record<string, string> = {
    investigating: "Investigating",
    identified: "Identified",
    monitoring: "Monitoring",
    resolved: "Resolved",
  };

  return (
    <BaseEmail preview={`Incident: ${incidentTitle}`}>
      <Section style={content}>
        <Text style={typeLabel}>Service Incident</Text>
        <Text style={heading}>{incidentTitle}</Text>

        <Section style={detailsBox}>
          <Text style={detailLabel}>Service</Text>
          <Text style={detailValue}>{statusPageName}</Text>

          <Text style={detailLabel}>Severity</Text>
          <Text style={{ ...detailValue, color: severityColor, fontWeight: "600" }}>
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
          </Text>

          <Text style={detailLabel}>Status</Text>
          <Text style={{ ...detailValue, color: statusColor, fontWeight: "600" }}>
            {statusLabel[status] || status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>

          <Text style={detailLabel}>Update</Text>
          <Text style={detailValue}>{message}</Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={statusPageUrl}>
            View Status Page
          </Button>
        </Section>

        <Text style={unsubscribeText}>
          <Link href={unsubscribeUrl} style={unsubscribeLink}>
            Unsubscribe
          </Link>{" "}
          from status updates
        </Text>
      </Section>
    </BaseEmail>
  );
}

const content = {
  padding: "0 24px",
};

const typeLabel = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#6b7280",
  textTransform: "uppercase" as const,
  margin: "0 0 8px",
};

const heading = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#1f2937",
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  color: "#374151",
  lineHeight: "1.6",
  margin: "0 0 24px",
  textAlign: "center" as const,
};

const link = {
  color: "#10b981",
  textDecoration: "underline",
};

const buttonContainer = {
  textAlign: "center" as const,
  marginBottom: "16px",
};

const button = {
  backgroundColor: "#10b981",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
};

const altText = {
  fontSize: "12px",
  color: "#6b7280",
  textAlign: "center" as const,
  margin: "0",
};

const detailsBox = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
};

const detailLabel = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#6b7280",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
};

const detailValue = {
  fontSize: "14px",
  color: "#1f2937",
  margin: "0 0 12px",
};

const unsubscribeText = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: "0",
};

const unsubscribeLink = {
  color: "#9ca3af",
  textDecoration: "underline",
};

interface EventSubscriptionVerificationEmailProps {
  eventType: "incident" | "maintenance";
  eventTitle: string;
  statusPageName: string;
  verificationUrl: string;
  statusPageUrl: string;
}

export function EventSubscriptionVerificationEmail({
  eventType,
  eventTitle,
  statusPageName,
  verificationUrl,
  statusPageUrl,
}: EventSubscriptionVerificationEmailProps) {
  const eventTypeLabel = eventType === "incident" ? "incident" : "maintenance window";

  return (
    <BaseEmail preview={`Confirm your subscription to ${eventTitle}`}>
      <Section style={content}>
        <Text style={heading}>Confirm your subscription</Text>

        <Text style={paragraph}>
          You&apos;ve requested to receive updates for the {eventTypeLabel}{" "}
          <strong>{eventTitle}</strong> on{" "}
          <Link href={statusPageUrl} style={link}>
            {statusPageName}
          </Link>
          . Please confirm your subscription by clicking the button below.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={verificationUrl}>
            Confirm Subscription
          </Button>
        </Section>

        <Text style={altText}>
          If you didn&apos;t request this subscription, you can safely ignore this
          email.
        </Text>
      </Section>
    </BaseEmail>
  );
}

interface EventUpdateEmailProps {
  eventType: "incident" | "maintenance";
  eventTitle: string;
  eventStatus: string;
  eventDescription?: string;
  statusPageName: string;
  statusPageSlug: string;
  eventUrl: string;
  unsubscribeUrl: string;
  updateMessage?: string;
}

// Component subscription verification email
interface ComponentSubscriptionVerificationEmailProps {
  statusPageName: string;
  monitorName: string;
  verificationUrl: string;
  statusPageUrl: string;
}

export function ComponentSubscriptionVerificationEmail({
  statusPageName,
  monitorName,
  verificationUrl,
  statusPageUrl,
}: ComponentSubscriptionVerificationEmailProps) {
  return (
    <BaseEmail preview={`Confirm your subscription to ${monitorName}`}>
      <Section style={content}>
        <Text style={heading}>Confirm your subscription</Text>

        <Text style={paragraph}>
          You&apos;ve requested to receive updates for{" "}
          <strong>{monitorName}</strong> on{" "}
          <Link href={statusPageUrl} style={link}>
            {statusPageName}
          </Link>
          . Please confirm your subscription by clicking the button below.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={verificationUrl}>
            Confirm Subscription
          </Button>
        </Section>

        <Text style={altText}>
          If you didn&apos;t request this subscription, you can safely ignore this
          email.
        </Text>
      </Section>
    </BaseEmail>
  );
}

// Component subscription notification email
interface ComponentNotificationEmailProps {
  notificationType: "incident" | "maintenance" | "status_change";
  statusPageName: string;
  statusPageUrl: string;
  affectedMonitors: Array<{ name: string }>;
  // For incident/maintenance
  eventTitle?: string;
  eventStatus?: string;
  eventDescription?: string;
  eventUrl?: string;
  // For status change
  previousStatus?: string;
  newStatus?: string;
  unsubscribeUrl: string;
}

export function ComponentNotificationEmail({
  notificationType,
  statusPageName,
  statusPageUrl,
  affectedMonitors,
  eventTitle,
  eventStatus,
  eventDescription,
  eventUrl,
  previousStatus,
  newStatus,
  unsubscribeUrl,
}: ComponentNotificationEmailProps) {
  const typeLabels = {
    incident: "New Incident",
    maintenance: "Scheduled Maintenance",
    status_change: "Status Change",
  };

  const statusColors: Record<string, string> = {
    investigating: "#eab308",
    identified: "#f97316",
    monitoring: "#3b82f6",
    resolved: "#22c55e",
    scheduled: "#a855f7",
    active: "#3b82f6",
    completed: "#22c55e",
    up: "#22c55e",
    degraded: "#eab308",
    down: "#ef4444",
  };

  return (
    <BaseEmail preview={eventTitle || `${typeLabels[notificationType]} - ${affectedMonitors.map(m => m.name).join(", ")}`}>
      <Section style={content}>
        <Text style={typeLabel}>{typeLabels[notificationType]}</Text>
        {eventTitle && <Text style={heading}>{eventTitle}</Text>}

        <Section style={detailsBox}>
          <Text style={detailLabel}>Service</Text>
          <Text style={detailValue}>{statusPageName}</Text>

          <Text style={detailLabel}>Affected Components</Text>
          <Text style={detailValue}>
            {affectedMonitors.map((m) => m.name).join(", ")}
          </Text>

          {eventStatus && (
            <>
              <Text style={detailLabel}>Status</Text>
              <Text style={{ ...detailValue, color: statusColors[eventStatus] || "#6b7280", fontWeight: "600" }}>
                {eventStatus.charAt(0).toUpperCase() + eventStatus.slice(1)}
              </Text>
            </>
          )}

          {notificationType === "status_change" && previousStatus && newStatus && (
            <>
              <Text style={detailLabel}>Status Change</Text>
              <Text style={detailValue}>
                <span style={{ color: statusColors[previousStatus] || "#6b7280" }}>
                  {previousStatus.charAt(0).toUpperCase() + previousStatus.slice(1)}
                </span>
                {" -> "}
                <span style={{ color: statusColors[newStatus] || "#6b7280", fontWeight: "600" }}>
                  {newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}
                </span>
              </Text>
            </>
          )}

          {eventDescription && (
            <>
              <Text style={detailLabel}>Details</Text>
              <Text style={detailValue}>{eventDescription}</Text>
            </>
          )}
        </Section>

        {eventUrl && (
          <Section style={buttonContainer}>
            <Button style={button} href={eventUrl}>
              View Details
            </Button>
          </Section>
        )}

        {!eventUrl && (
          <Section style={buttonContainer}>
            <Button style={button} href={statusPageUrl}>
              View Status Page
            </Button>
          </Section>
        )}

        <Text style={unsubscribeText}>
          <Link href={unsubscribeUrl} style={unsubscribeLink}>
            Unsubscribe
          </Link>{" "}
          from component updates
        </Text>
      </Section>
    </BaseEmail>
  );
}

export function EventUpdateEmail({
  eventType,
  eventTitle,
  eventStatus,
  eventDescription,
  statusPageName,
  statusPageSlug,
  eventUrl,
  unsubscribeUrl,
  updateMessage,
}: EventUpdateEmailProps) {
  const isIncident = eventType === "incident";
  const statusColors: Record<string, string> = {
    investigating: "#eab308",
    identified: "#f97316",
    monitoring: "#3b82f6",
    resolved: "#22c55e",
    scheduled: "#a855f7",
    active: "#3b82f6",
    completed: "#22c55e",
  };
  const statusColor = statusColors[eventStatus] || "#6b7280";

  const statusLabel: Record<string, string> = {
    investigating: "Investigating",
    identified: "Identified",
    monitoring: "Monitoring",
    resolved: "Resolved",
    scheduled: "Scheduled",
    active: "In Progress",
    completed: "Completed",
  };

  return (
    <BaseEmail preview={`${eventTitle} - ${statusLabel[eventStatus] || eventStatus}`}>
      <Section style={content}>
        <Text style={typeLabel}>{isIncident ? "Incident Update" : "Maintenance Update"}</Text>
        <Text style={heading}>{eventTitle}</Text>

        <Section style={detailsBox}>
          <Text style={detailLabel}>Service</Text>
          <Text style={detailValue}>{statusPageName}</Text>

          <Text style={detailLabel}>Status</Text>
          <Text style={{ ...detailValue, color: statusColor, fontWeight: "600" }}>
            {statusLabel[eventStatus] || eventStatus}
          </Text>

          {updateMessage && (
            <>
              <Text style={detailLabel}>Latest Update</Text>
              <Text style={detailValue}>{updateMessage}</Text>
            </>
          )}

          {eventDescription && !updateMessage && (
            <>
              <Text style={detailLabel}>Details</Text>
              <Text style={detailValue}>{eventDescription}</Text>
            </>
          )}
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={eventUrl}>
            View {isIncident ? "Incident" : "Maintenance"} Details
          </Button>
        </Section>

        <Text style={unsubscribeText}>
          <Link href={unsubscribeUrl} style={unsubscribeLink}>
            Unsubscribe
          </Link>{" "}
          from this {isIncident ? "incident" : "maintenance"}'s updates
        </Text>
      </Section>
    </BaseEmail>
  );
}
