import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

interface GracePeriodReminderEmailProps {
  organizationName: string;
  plan: string;
  daysRemaining: number;
  gracePeriodEndsAt: string;
  portalUrl: string;
  isUrgent: boolean;
}

const defaultGracePeriodReminderProps: GracePeriodReminderEmailProps = {
  organizationName: "Acme Co",
  plan: "Enterprise",
  daysRemaining: 3,
  gracePeriodEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  portalUrl: "https://status.example.com/billing",
  isUrgent: false,
};

export function GracePeriodReminderEmail(
  props: GracePeriodReminderEmailProps = defaultGracePeriodReminderProps
) {
  const {
    organizationName,
    plan,
    daysRemaining,
    gracePeriodEndsAt,
    portalUrl,
    isUrgent,
  } = { ...defaultGracePeriodReminderProps, ...props };
  const bannerStyle = isUrgent ? urgentBanner : warningBanner;
  const bannerTextStyle = isUrgent ? urgentBannerText : warningBannerText;
  const boxStyle = isUrgent ? urgentBox : warningBox;
  const boxTitleStyle = isUrgent ? urgentBoxTitle : warningBoxTitle;
  const boxTextStyle = isUrgent ? urgentBoxText : warningBoxText;
  const buttonStyle = isUrgent ? urgentButton : warningButton;

  return (
    <BaseEmail
      preview={`${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining in your grace period`}
    >
      <Section style={content}>
        <Section style={bannerStyle}>
          <Text style={bannerTextStyle}>
            {isUrgent ? "URGENT: " : ""}
            {daysRemaining} Day{daysRemaining === 1 ? "" : "s"} Remaining
          </Text>
        </Section>

        <Text style={heading}>
          Your {plan} license grace period is ending soon
        </Text>

        <Text style={paragraph}>
          The license for <strong>{organizationName}</strong> is in a grace period
          that will expire on <strong>{gracePeriodEndsAt}</strong>.
        </Text>

        <Section style={boxStyle}>
          <Text style={boxTitleStyle}>Action Required</Text>
          <Text style={boxTextStyle}>
            {isUrgent ? (
              <>
                <strong>This is your final notice.</strong> If you do not take
                action today, your account will be downgraded to the free tier
                tomorrow.
              </>
            ) : (
              <>
                Please resolve the issue with your license to avoid service
                interruption. After the grace period ends, your account will be
                downgraded to the free tier with limited features.
              </>
            )}
          </Text>
        </Section>

        <Section style={whatHappens}>
          <Text style={whatHappensTitle}>What happens after the grace period?</Text>
          <Text style={whatHappensItem}>
            - Monitors exceeding free tier limits will be paused
          </Text>
          <Text style={whatHappensItem}>
            - Status pages exceeding limits will become read-only
          </Text>
          <Text style={whatHappensItem}>
            - Team members exceeding limits will lose access
          </Text>
          <Text style={whatHappensItem}>
            - Enterprise features (SSO, audit logs, etc.) will be disabled
          </Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={buttonStyle} href={portalUrl}>
            Renew License Now
          </Button>
        </Section>

        <Text style={helpText}>
          Need help? Contact our support team for assistance.
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

const warningBannerText = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#92400e",
  margin: "0",
};

const urgentBanner = {
  backgroundColor: "#fecaca",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const urgentBannerText = {
  fontSize: "14px",
  fontWeight: "700",
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

const warningBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #f59e0b",
};

const warningBoxTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#92400e",
  margin: "0 0 8px",
};

const warningBoxText = {
  fontSize: "13px",
  color: "#78350f",
  margin: "0",
  lineHeight: "1.5",
};

const urgentBox = {
  backgroundColor: "#fecaca",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #ef4444",
};

const urgentBoxTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#991b1b",
  margin: "0 0 8px",
};

const urgentBoxText = {
  fontSize: "13px",
  color: "#7f1d1d",
  margin: "0",
  lineHeight: "1.5",
};

const whatHappens = {
  backgroundColor: "#f3f4f6",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
};

const whatHappensTitle = {
  fontSize: "13px",
  fontWeight: "600",
  color: "#374151",
  margin: "0 0 12px",
};

const whatHappensItem = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0 0 4px",
  lineHeight: "1.5",
};

const buttonContainer = {
  textAlign: "center" as const,
  marginBottom: "24px",
};

const warningButton = {
  backgroundColor: "#f59e0b",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
};

const urgentButton = {
  backgroundColor: "#ef4444",
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

export default GracePeriodReminderEmail;
