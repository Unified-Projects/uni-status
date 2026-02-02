import { Resend } from "resend";
import { render } from "@react-email/components";
import nodemailer from "nodemailer";
import type { SmtpCredentials, ResendCredentials } from "@uni-status/shared/types/credentials";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "email-index" });


// Initialize platform Resend client
const platformResend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const platformFrom = process.env.SMTP_FROM || "Uni-Status <noreply@status.unified.sh>";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  // Optional org credentials for BYO (Bring Your Own)
  smtpConfig?: SmtpCredentials;
  resendConfig?: ResendCredentials;
}

export interface SendEmailResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Send email via SMTP using nodemailer
 */
async function sendViaSMTP(
  to: string | string[],
  subject: string,
  react: React.ReactElement,
  config: SmtpCredentials
): Promise<SendEmailResult> {
  try {
    const html = await render(react);

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: config.username
        ? {
            user: config.username,
            pass: config.password,
          }
        : undefined,
    });

    const from = config.fromName
      ? `${config.fromName} <${config.fromAddress}>`
      : config.fromAddress;

    const result = await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
    });

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "SMTP error",
    };
  }
}

/**
 * Send email via Resend API with custom API key
 */
async function sendViaResend(
  to: string | string[],
  subject: string,
  react: React.ReactElement,
  config: ResendCredentials
): Promise<SendEmailResult> {
  try {
    const resend = new Resend(config.apiKey);
    const { data, error } = await resend.emails.send({
      from: config.fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      react,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Resend error",
    };
  }
}

/**
 * Send email using the priority order:
 * 1. Org SMTP credentials (if provided and enabled)
 * 2. Org Resend credentials (if provided and enabled)
 * 3. Platform Resend (default)
 */
export async function sendEmail({
  to,
  subject,
  react,
  smtpConfig,
  resendConfig,
}: SendEmailOptions): Promise<SendEmailResult> {
  // Priority 1: Org SMTP credentials
  if (smtpConfig?.enabled) {
    return sendViaSMTP(to, subject, react, smtpConfig);
  }

  // Priority 2: Org Resend credentials
  if (resendConfig?.enabled) {
    return sendViaResend(to, subject, react, resendConfig);
  }

  // Priority 3: Platform Resend
  if (!platformResend) {
    log.warn("Resend API key not configured, email not sent");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const { data, error } = await platformResend.emails.send({
      from: platformFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
      react,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Export templates
export * from "./templates/alert";
export * from "./templates/incident";
export * from "./templates/invitation";
export * from "./templates/verification";
export * from "./templates/subscriber";

// License notification templates
export * from "./templates/license-suspended";
export * from "./templates/grace-period-reminder";
export * from "./templates/downgrade-notice";
export * from "./templates/license-expiry-warning";
export * from "./templates/payment-failed";
