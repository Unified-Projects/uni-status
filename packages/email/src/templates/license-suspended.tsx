import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

interface LicenseSuspendedEmailProps {
  organizationName: string;
  plan: string;
  reason: string;
  gracePeriodDays: number;
  gracePeriodEndsAt: string;
  portalUrl: string;
}

const defaultLicenseSuspendedProps: LicenseSuspendedEmailProps = {
  organizationName: "Acme Co",
  plan: "Enterprise",
  reason: "Payment failed",
  gracePeriodDays: 5,
  gracePeriodEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  portalUrl: "https://status.example.com/billing",
};

export function LicenseSuspendedEmail(
  props: LicenseSuspendedEmailProps = defaultLicenseSuspendedProps
) {
  const {
    organizationName,
    plan,
    reason,
    gracePeriodDays,
    gracePeriodEndsAt,
    portalUrl,
  } = { ...defaultLicenseSuspendedProps, ...props };
  return (
    <BaseEmail preview={`License suspended for ${organizationName}`}>
      <Section style={content}>
        <Section style={warningBanner}>
          <Text style={warningText}>License Suspended</Text>
        </Section>

        <Text style={heading}>
          Your {plan} license has been suspended
        </Text>

        <Text style={paragraph}>
          The license for <strong>{organizationName}</strong> has been suspended
          due to: <strong>{reason}</strong>.
        </Text>

        <Section style={infoBox}>
          <Text style={infoTitle}>Grace Period Active</Text>
          <Text style={infoText}>
            You have <strong>{gracePeriodDays} days</strong> to resolve this issue.
            Your grace period ends on <strong>{gracePeriodEndsAt}</strong>.
          </Text>
          <Text style={infoText}>
            During this time, your service will continue to work normally.
            After the grace period expires, your account will be downgraded to
            the free tier with limited features.
          </Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={portalUrl}>
            Manage License
          </Button>
        </Section>

        <Text style={helpText}>
          Need help? Contact our support team if you believe this is an error
          or need assistance resolving the issue.
        </Text>
      </Section>
    </BaseEmail>
  );
}

const content = {
  padding: "0 24px",
};

const warningBanner = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const warningText = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#92400e",
  margin: "0",
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
};

const infoBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #f59e0b",
};

const infoTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#92400e",
  margin: "0 0 8px",
};

const infoText = {
  fontSize: "13px",
  color: "#78350f",
  margin: "0 0 8px",
  lineHeight: "1.5",
};

const buttonContainer = {
  textAlign: "center" as const,
  marginBottom: "24px",
};

const button = {
  backgroundColor: "#f59e0b",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
};

const helpText = {
  fontSize: "12px",
  color: "#6b7280",
  textAlign: "center" as const,
  margin: "0",
};

export default LicenseSuspendedEmail;
