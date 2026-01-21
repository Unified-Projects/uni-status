import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

export interface InvitationEmailProps {
  inviterName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
}

const defaultInvitationProps: InvitationEmailProps = {
  inviterName: "Alex Johnson",
  organizationName: "Acme Co",
  role: "Admin",
  inviteUrl: "https://status.example.com/invite",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
};

export const InvitationEmail: React.FC<InvitationEmailProps> = (
  props = defaultInvitationProps
) => {
  const {
    inviterName,
    organizationName,
    role,
    inviteUrl,
    expiresAt,
  } = { ...defaultInvitationProps, ...props };
  return (
    <BaseEmail preview={`${inviterName} invited you to join ${organizationName}`}>
      <Section style={content}>
        <Text style={heading}>
          You&apos;ve been invited to join {organizationName}
        </Text>

        <Text style={paragraph}>
          <strong>{inviterName}</strong> has invited you to join the{" "}
          <strong>{organizationName}</strong> team on Uni-Status as a{" "}
          <strong>{role}</strong>.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href={inviteUrl}>
            Accept Invitation
          </Button>
        </Section>

        <Text style={expiryText}>
          This invitation will expire on {expiresAt}
        </Text>

        <Section style={infoBox}>
          <Text style={infoTitle}>What is Uni-Status?</Text>
          <Text style={infoText}>
            Uni-Status is a comprehensive status monitoring platform that helps
            teams track uptime, manage incidents, and keep users informed through
            beautiful status pages.
          </Text>
        </Section>
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
};

const paragraph = {
  fontSize: "14px",
  color: "#374151",
  lineHeight: "1.6",
  margin: "0 0 24px",
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

const infoBox = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "16px",
  borderLeft: "4px solid #10b981",
};

const infoTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#065f46",
  margin: "0 0 8px",
};

const infoText = {
  fontSize: "13px",
  color: "#047857",
  margin: "0",
  lineHeight: "1.5",
};

export default InvitationEmail;
