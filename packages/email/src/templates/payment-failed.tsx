import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

interface PaymentFailedEmailProps {
  organizationName: string;
  plan: string;
  gracePeriodDays: number;
  gracePeriodEndsAt: string;
  updatePaymentUrl: string;
}

const defaultPaymentFailedProps: PaymentFailedEmailProps = {
  organizationName: "Acme Co",
  plan: "Enterprise",
  gracePeriodDays: 5,
  gracePeriodEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  updatePaymentUrl: "https://status.example.com/billing",
};

export function PaymentFailedEmail(
  props: PaymentFailedEmailProps = defaultPaymentFailedProps
) {
  const {
    organizationName,
    plan,
    gracePeriodDays,
    gracePeriodEndsAt,
    updatePaymentUrl,
  } = { ...defaultPaymentFailedProps, ...props };
  return (
    <BaseEmail preview={`Payment failed for ${organizationName}`}>
      <Section style={content}>
        <Section style={errorBanner}>
          <Text style={errorText}>Payment Failed</Text>
        </Section>

        <Text style={heading}>
          We couldn't process your payment
        </Text>

        <Text style={paragraph}>
          The payment for your <strong>{plan}</strong> subscription for{" "}
          <strong>{organizationName}</strong> has failed. Please update your
          payment method to avoid service interruption.
        </Text>

        <Section style={infoBox}>
          <Text style={infoTitle}>Grace Period Active</Text>
          <Text style={infoText}>
            You have <strong>{gracePeriodDays} days</strong> to update your payment method.
            Your grace period ends on <strong>{gracePeriodEndsAt}</strong>.
          </Text>
          <Text style={infoText}>
            During this time, your service will continue to work normally.
            After the grace period expires, your account will be downgraded to
            the free tier with limited features.
          </Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={button} href={updatePaymentUrl}>
            Update Payment Method
          </Button>
        </Section>

        <Text style={helpText}>
          If you believe this is an error or need assistance, please contact our
          support team.
        </Text>
      </Section>
    </BaseEmail>
  );
}

const content = {
  padding: "0 24px",
};

const errorBanner = {
  backgroundColor: "#fee2e2",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const errorText = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#991b1b",
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
  backgroundColor: "#dc2626",
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

export default PaymentFailedEmail;
