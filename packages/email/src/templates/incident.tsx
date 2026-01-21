import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

export interface IncidentEmailProps {
  type: "created" | "updated" | "resolved";
  incidentTitle: string;
  status: string;
  severity: "minor" | "major" | "critical";
  message: string;
  statusPageUrl: string;
  timestamp: string;
  affectedServices?: string[];
}

const defaultIncidentProps: IncidentEmailProps = {
  type: "created",
  incidentTitle: "Database connectivity issues",
  status: "investigating",
  severity: "major",
  message: "We are investigating intermittent connectivity failures.",
  statusPageUrl: "https://status.example.com",
  timestamp: new Date().toISOString(),
  affectedServices: ["API", "Dashboard"],
};

export const IncidentEmail: React.FC<IncidentEmailProps> = (
  props = defaultIncidentProps
) => {
  const {
    type,
    incidentTitle,
    status,
    severity,
    message,
    statusPageUrl,
    timestamp,
    affectedServices,
  } = { ...defaultIncidentProps, ...props };
  const severityColors = {
    minor: "#f59e0b",
    major: "#f97316",
    critical: "#ef4444",
  };

  const typeConfig = {
    created: {
      title: "New Incident Reported",
      preview: `New incident: ${incidentTitle}`,
    },
    updated: {
      title: "Incident Update",
      preview: `Update on: ${incidentTitle}`,
    },
    resolved: {
      title: "Incident Resolved",
      preview: `Resolved: ${incidentTitle}`,
    },
  };

  const config = typeConfig[type];

  return (
    <BaseEmail preview={config.preview}>
      <Section style={content}>
        <Text style={typeLabel}>{config.title}</Text>
        <Text style={heading}>{incidentTitle}</Text>

        <Section style={statusRow}>
          <span style={{ ...badge, backgroundColor: severityColors[severity] }}>
            {severity.toUpperCase()}
          </span>
          <span style={{ ...badge, backgroundColor: "#6b7280" }}>
            {status.toUpperCase()}
          </span>
        </Section>

        <Section style={messageBox}>
          <Text style={messageText}>{message}</Text>
          <Text style={timestampText}>{timestamp}</Text>
        </Section>

        {affectedServices && affectedServices.length > 0 && (
          <Section style={servicesBox}>
            <Text style={servicesLabel}>Affected Services</Text>
            <ul style={servicesList}>
              {affectedServices.map((service, index) => (
                <li key={index} style={serviceItem}>
                  {service}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section style={buttonContainer}>
          <Button style={button} href={statusPageUrl}>
            View Status Page
          </Button>
        </Section>
      </Section>
    </BaseEmail>
  );
};

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

const statusRow = {
  marginBottom: "24px",
};

const badge = {
  borderRadius: "4px",
  padding: "4px 8px",
  fontSize: "11px",
  fontWeight: "600",
  color: "#ffffff",
  marginRight: "8px",
  display: "inline-block",
};

const messageBox = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "16px",
};

const messageText = {
  fontSize: "14px",
  color: "#374151",
  margin: "0 0 8px",
  lineHeight: "1.5",
};

const timestampText = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: "0",
};

const servicesBox = {
  marginBottom: "24px",
};

const servicesLabel = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#374151",
  margin: "0 0 8px",
};

const servicesList = {
  margin: "0",
  padding: "0 0 0 20px",
};

const serviceItem = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "4px",
};

const buttonContainer = {
  textAlign: "center" as const,
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

export default IncidentEmail;
