import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Link,
  Img,
} from "@react-email/components";
import * as React from "react";

interface BaseEmailProps {
  preview: string;
  children: React.ReactNode;
  logo?: string | null;
  primaryColor?: string;
  backgroundColor?: string;
}

export function BaseEmail({ preview, children, logo, primaryColor, backgroundColor }: BaseEmailProps) {
  const brandColor = primaryColor || "#10b981";
  const bgColor = backgroundColor || "#f6f9fc";

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ ...main, backgroundColor: bgColor }}>
        <Container style={{ ...container, backgroundColor: "#ffffff" }}>
          <Section style={header}>
            {logo ? (
              <Img
                src={logo}
                alt="Logo"
                width="120"
                style={{ maxWidth: "120px", height: "auto", margin: "0 auto" }}
              />
            ) : (
              <Text style={{ ...logoStyle, color: brandColor }}>Uni-Status</Text>
            )}
          </Section>
          {children}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              Sent by <Link href="https://status.unified.sh" style={{ ...linkStyle, color: brandColor }}>Uni-Status</Link>
            </Text>
            <Text style={footerText}>
              You received this email because you are subscribed to updates.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const header = {
  padding: "24px",
  textAlign: "center" as const,
};

const logoStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#10b981",
  margin: "0",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const footer = {
  padding: "0 24px",
};

const footerText = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  margin: "8px 0",
  textAlign: "center" as const,
};

const linkStyle = {
  color: "#10b981",
  textDecoration: "underline",
};
