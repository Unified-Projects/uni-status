import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

export interface VerificationEmailProps {
  verificationUrl: string;
  expiresIn: string;
}

const defaultVerificationProps: VerificationEmailProps = {
  verificationUrl: "https://status.example.com/verify",
  expiresIn: "24 hours",
};

export const VerificationEmail: React.FC<VerificationEmailProps> = (
  props = defaultVerificationProps
) => {
  const { verificationUrl, expiresIn } = { ...defaultVerificationProps, ...props };
  return (
    <BaseEmail preview="Verify your email address">
      <Section style={content}>
        <Text style={heading}>Verify your email address</Text>

        <Text style={paragraph}>
          Thanks for signing up for Uni-Status! Please verify your email address
          by clicking the button below.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={verificationUrl}>
            Verify Email Address
          </Button>
        </Section>

        <Text style={expiryText}>
          This link will expire in {expiresIn}.
        </Text>

        <Text style={altText}>
          If you didn&apos;t create an account on Uni-Status, you can safely ignore
          this email.
        </Text>
      </Section>
    </BaseEmail>
  );
};

const content = {
  padding: "0 24px",
};

const heading = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#1f2937",
  margin: "0 0 16px",
  textAlign: "center" as const,
};

const paragraph = {
  fontSize: "14px",
  color: "#374151",
  lineHeight: "1.6",
  margin: "0 0 24px",
  textAlign: "center" as const,
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

const expiryText = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: "0 0 24px",
};

const altText = {
  fontSize: "12px",
  color: "#6b7280",
  textAlign: "center" as const,
  margin: "0",
};

export default VerificationEmail;
