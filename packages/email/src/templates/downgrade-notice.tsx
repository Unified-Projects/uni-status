import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { BaseEmail } from "./base";

interface DowngradeNoticeEmailProps {
  organizationName: string;
  previousPlan: string;
  freeEntitlements: {
    monitors: number;
    statusPages: number;
    teamMembers: number;
    regions: number;
  };
  portalUrl: string;
}

const defaultDowngradeNoticeProps: DowngradeNoticeEmailProps = {
  organizationName: "Acme Co",
  previousPlan: "Enterprise",
  freeEntitlements: {
    monitors: 10,
    statusPages: 2,
    teamMembers: 1,
    regions: 1,
  },
  portalUrl: "https://status.example.com/billing",
};

export function DowngradeNoticeEmail(
  props: DowngradeNoticeEmailProps = defaultDowngradeNoticeProps
) {
  const {
    organizationName,
    previousPlan,
    freeEntitlements,
    portalUrl,
  } = { ...defaultDowngradeNoticeProps, ...props };
  return (
    <BaseEmail preview={`${organizationName} has been downgraded to the free tier`}>
      <Section style={content}>
        <Section style={alertBanner}>
          <Text style={alertText}>Account Downgraded</Text>
        </Section>

        <Text style={heading}>
          Your account has been downgraded to the free tier
        </Text>

        <Text style={paragraph}>
          The grace period for <strong>{organizationName}</strong> has expired.
          Your account has been downgraded from the <strong>{previousPlan}</strong>{" "}
          plan to the free tier.
        </Text>

        <Section style={limitsBox}>
          <Text style={limitsTitle}>Your New Limits</Text>
          <Section style={limitsGrid}>
            <Text style={limitItem}>
              <strong>{freeEntitlements.monitors}</strong> monitors
            </Text>
            <Text style={limitItem}>
              <strong>{freeEntitlements.statusPages}</strong> status page
            </Text>
            <Text style={limitItem}>
              <strong>{freeEntitlements.teamMembers}</strong> team member
            </Text>
            <Text style={limitItem}>
              <strong>{freeEntitlements.regions}</strong> monitoring region
            </Text>
          </Section>
        </Section>

        <Section style={impactBox}>
          <Text style={impactTitle}>What This Means</Text>
          <Text style={impactItem}>
            - Resources exceeding limits have been paused or made read-only
          </Text>
          <Text style={impactItem}>
            - Enterprise features (SSO, audit logs, reports) are now disabled
          </Text>
          <Text style={impactItem}>
            - Team members exceeding the limit have lost access
          </Text>
          <Text style={impactItem}>
            - Your data is still safe and will be restored when you upgrade
          </Text>
        </Section>

        <Section style={ctaBox}>
          <Text style={ctaTitle}>Ready to upgrade?</Text>
          <Text style={ctaText}>
            Restore full access to all your monitors, status pages, and team
            members by upgrading your plan.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={portalUrl}>
              Upgrade Now
            </Button>
          </Section>
        </Section>

        <Text style={helpText}>
          Have questions? Contact our support team for assistance.
        </Text>
      </Section>
    </BaseEmail>
  );
}

const content = {
  padding: "0 24px",
};

const alertBanner = {
  backgroundColor: "#fecaca",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "24px",
  textAlign: "center" as const,
};

const alertText = {
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

const limitsBox = {
  backgroundColor: "#f3f4f6",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
};

const limitsTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#374151",
  margin: "0 0 12px",
};

const limitsGrid = {
  display: "flex",
  flexWrap: "wrap" as const,
};

const limitItem = {
  fontSize: "13px",
  color: "#6b7280",
  margin: "0 16px 8px 0",
  lineHeight: "1.5",
};

const impactBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #f59e0b",
};

const impactTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#92400e",
  margin: "0 0 12px",
};

const impactItem = {
  fontSize: "12px",
  color: "#78350f",
  margin: "0 0 4px",
  lineHeight: "1.5",
};

const ctaBox = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #10b981",
};

const ctaTitle = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#065f46",
  margin: "0 0 8px",
};

const ctaText = {
  fontSize: "13px",
  color: "#047857",
  margin: "0 0 16px",
  lineHeight: "1.5",
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

const helpText = {
  fontSize: "12px",
  color: "#6b7280",
  textAlign: "center" as const,
  margin: "0",
};

export default DowngradeNoticeEmail;
