import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

export interface AlertEmailProps {
  monitorName: string;
  monitorUrl: string;
  status: "down" | "degraded" | "recovered";
  message?: string;
  responseTime?: number;
  statusCode?: number;
  dashboardUrl: string;
  timestamp: string;
  logo?: string | null;
  primaryColor?: string;
}

const defaultAlertProps: AlertEmailProps = {
  monitorName: "API Monitor",
  monitorUrl: "https://api.example.com/health",
  status: "down",
  message: "Timeout after 5 seconds",
  responseTime: 5123,
  statusCode: 504,
  dashboardUrl: "https://status.example.com/dashboard",
  timestamp: new Date().toISOString(),
};

export const AlertEmail: React.FC<AlertEmailProps> = (
  props = defaultAlertProps
) => {
  const {
    monitorName,
    monitorUrl,
    status,
    message,
    responseTime,
    statusCode,
    dashboardUrl,
    timestamp,
    logo,
    primaryColor,
  } = { ...defaultAlertProps, ...props };
  const statusConfig = {
    down: {
      color: "#ef4444",
      title: "Monitor Down",
      description: `${monitorName} is currently down`,
    },
    degraded: {
      color: "#f59e0b",
      title: "Monitor Degraded",
      description: `${monitorName} is experiencing degraded performance`,
    },
    recovered: {
      color: primaryColor || "#10b981",
      title: "Monitor Recovered",
      description: `${monitorName} is back online`,
    },
  };

  const config = statusConfig[status];

  return (
    <BaseEmail preview={config.description} logo={logo} primaryColor={primaryColor}>
      <Section style={content}>
        <div style={{ ...statusBadge, backgroundColor: config.color }}>
          <Text style={statusText}>{config.title}</Text>
        </div>

        <Text style={heading}>{config.description}</Text>

        <Section style={detailsBox}>
          <Text style={detailLabel}>Monitor</Text>
          <Text style={detailValue}>{monitorName}</Text>

          <Text style={detailLabel}>URL</Text>
          <Text style={detailValue}>{monitorUrl}</Text>

          {statusCode && (
            <>
              <Text style={detailLabel}>Status Code</Text>
              <Text style={detailValue}>{statusCode}</Text>
            </>
          )}

          {responseTime && (
            <>
              <Text style={detailLabel}>Response Time</Text>
              <Text style={detailValue}>{responseTime}ms</Text>
            </>
          )}

          {message && (
            <>
              <Text style={detailLabel}>Error</Text>
              <Text style={detailValue}>{message}</Text>
            </>
          )}

          <Text style={detailLabel}>Time</Text>
          <Text style={detailValue}>{timestamp}</Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={dashboardUrl}>
            View Dashboard
          </Button>
        </Section>
      </Section>
    </BaseEmail>
  );
};

const content = {
  padding: "0 24px",
};

const statusBadge = {
  borderRadius: "4px",
  padding: "8px 16px",
  display: "inline-block",
  marginBottom: "16px",
};

const statusText = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
};

const heading = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#1f2937",
  margin: "0 0 24px",
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

export default AlertEmail;
