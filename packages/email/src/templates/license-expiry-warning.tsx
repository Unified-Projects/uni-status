import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

interface LicenseExpiryWarningEmailProps {
  organizationName: string;
  plan: string;
  daysUntilExpiry: number;
  expiresAt: string;
  portalUrl: string;
}

const defaultLicenseExpiryWarningProps: LicenseExpiryWarningEmailProps = {
  organizationName: "Acme Co",
  plan: "Enterprise",
  daysUntilExpiry: 14,
  expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  portalUrl: "https://status.example.com/billing",
};

export function LicenseExpiryWarningEmail(
  props: LicenseExpiryWarningEmailProps = defaultLicenseExpiryWarningProps
) {
  const {
    organizationName,
    plan,
    daysUntilExpiry,
    expiresAt,
    portalUrl,
  } = { ...defaultLicenseExpiryWarningProps, ...props };
  const isUrgent = daysUntilExpiry <= 7;
  const bannerStyle = isUrgent ? urgentBanner : infoBanner;
  const bannerTextStyle = isUrgent ? urgentBannerText : infoBannerText;
  const buttonStyle = isUrgent ? urgentButton : primaryButton;

  return (
    <BaseEmail
      preview={`Your ${plan} license expires in ${daysUntilExpiry} days`}
    >
      <Section style={content}>
        <Section style={bannerStyle}>
          <Text style={bannerTextStyle}>
            {daysUntilExpiry <= 1
              ? "License Expires Tomorrow"
              : `License Expires in ${daysUntilExpiry} Days`}
          </Text>
        </Section>

        <Text style={heading}>
          Your {plan} license is expiring soon
        </Text>

        <Text style={paragraph}>
          The license for <strong>{organizationName}</strong> will expire on{" "}
          <strong>{expiresAt}</strong>.
        </Text>

        <Section style={infoBox}>
          <Text style={infoTitle}>What happens when your license expires?</Text>
          <Text style={infoText}>
            When your license expires, a 5-day grace period will begin. During
            this time, your service will continue to work normally. After the
            grace period, your account will be downgraded to the free tier.
          </Text>
        </Section>

        <Section style={benefitsBox}>
          <Text style={benefitsTitle}>Keep your {plan} features</Text>
          <Text style={benefitItem}>
            - All your monitors, status pages, and team members
          </Text>
          <Text style={benefitItem}>
            - Enterprise features like SSO and audit logs
          </Text>
          <Text style={benefitItem}>
            - Priority support and faster check intervals
          </Text>
          <Text style={benefitItem}>
            - Multi-region monitoring and advanced reporting
          </Text>
        </Section>

        <Section style={buttonContainer}>
          <Button style={buttonStyle} href={portalUrl}>
            Renew License
          </Button>
        </Section>

        <Text style={helpText}>
          Need to make changes to your plan? Visit the billing portal to
          upgrade, downgrade, or cancel your subscription.
        </Text>
      </Section>
    </BaseEmail>
  );
}

const content = {
  padding: "0 24px",
};

const infoBanner = {
  backgroundColor: "#dbeafe",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const infoBannerText = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#1e40af",
  margin: "0",
};

const urgentBanner = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const urgentBannerText = {
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
  backgroundColor: "#f3f4f6",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
};

const infoTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#374151",
  margin: "0 0 8px",
};

const infoText = {
  fontSize: "13px",
  color: "#6b7280",
  margin: "0",
  lineHeight: "1.5",
};

const benefitsBox = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #10b981",
};

const benefitsTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#065f46",
  margin: "0 0 12px",
};

const benefitItem = {
  fontSize: "12px",
  color: "#047857",
  margin: "0 0 4px",
  lineHeight: "1.5",
};

const buttonContainer = {
  textAlign: "center" as const,
  marginBottom: "24px",
};

const primaryButton = {
  backgroundColor: "#10b981",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
};

const urgentButton = {
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

export default LicenseExpiryWarningEmail;
