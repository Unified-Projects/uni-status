import { Queue } from "bullmq";
import type { AlertChannelType, CheckStatus } from "@uni-status/shared/types";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import { decrypt } from "@uni-status/shared/lib/crypto";
import { signWebhookPayload } from "@uni-status/shared/lib/webhook-signing";

// Map check status to alert status
export function mapCheckStatusToAlertStatus(
  checkStatus: CheckStatus
): "down" | "degraded" | "recovered" {
  switch (checkStatus) {
    case "success":
      return "recovered";
    case "degraded":
      return "degraded";
    default:
      return "down";
  }
}

type ChannelQueues = {
  email: Queue;
  slack: Queue;
  discord: Queue;
  webhook: Queue;
  sms?: Queue;
  irc?: Queue;
  twitter?: Queue;
};

export function getQueueForChannelType(type: AlertChannelType, queues: ChannelQueues): Queue {
  switch (type) {
    case "email":
      return queues.email;
    case "slack":
      return queues.slack;
    case "discord":
      return queues.discord;
    case "webhook":
    case "teams":
    case "pagerduty":
    case "ntfy":
      return queues.webhook;
    case "sms":
      return queues.sms ?? queues.email;
    case "irc":
      return queues.irc ?? queues.webhook;
    case "twitter":
      return queues.twitter ?? queues.webhook;
    default:
      return queues.webhook;
  }
}

export async function buildNotificationJobData(
  channel: {
    id: string;
    type: string;
    config: Record<string, unknown>;
  },
  alertData: {
    alertHistoryId: string;
    monitorName: string;
    monitorUrl: string;
    status: "down" | "degraded" | "recovered";
    message?: string;
    responseTime?: number;
    statusCode?: number;
    dashboardUrl: string;
    timestamp: string;
    pagespeedScores?: Record<string, unknown> | null;
    pagespeedViolations?: Array<unknown> | null;
  },
  orgCredentials: OrganizationCredentials | null
): Promise<Record<string, unknown>> {
  const channelType = channel.type as AlertChannelType;

  // Common IDs for notification logging (included in all job types)
  const loggingIds = {
    alertHistoryId: alertData.alertHistoryId,
    channelId: channel.id,
  };

  switch (channelType) {
    case "email": {
      return {
        ...loggingIds,
        to: (channel.config.email as string) || "",
        subject: `[Alert] ${alertData.monitorName} is ${alertData.status}`,
        emailType: "alert",
        data: {
          monitorName: alertData.monitorName,
          monitorUrl: alertData.monitorUrl,
          status: alertData.status,
          message: alertData.message,
          responseTime: alertData.responseTime,
          statusCode: alertData.statusCode,
          dashboardUrl: alertData.dashboardUrl,
          timestamp: alertData.timestamp,
        },
        orgSmtpCredentials: orgCredentials?.smtp,
        orgResendCredentials: orgCredentials?.resend,
      };
    }
    case "slack":
    case "discord":
    case "teams": {
      return {
        ...loggingIds,
        webhookUrl: channel.config.webhookUrl,
        status: alertData.status,
        message: alertData.message,
        monitorName: alertData.monitorName,
        monitorUrl: alertData.monitorUrl,
        dashboardUrl: alertData.dashboardUrl,
        timestamp: alertData.timestamp,
        responseTime: alertData.responseTime,
        statusCode: alertData.statusCode,
      };
    }
    case "pagerduty": {
      return {
        ...loggingIds,
        routingKey: channel.config.routingKey,
        eventAction: alertData.status === "recovered" ? "resolve" : "trigger",
        dedupKey: `monitor-${alertData.alertHistoryId}`,
        payload: {
          summary: `Monitor ${alertData.monitorName} is ${alertData.status}`,
          severity: alertData.status === "recovered" ? "info" : "error",
          source: alertData.monitorUrl,
          timestamp: alertData.timestamp,
          custom_details: {
            message: alertData.message,
            responseTime: alertData.responseTime,
            statusCode: alertData.statusCode,
            dashboardUrl: alertData.dashboardUrl,
          },
        },
      };
    }
    case "webhook":
    case "ntfy":
    case "sms":
    case "irc":
    case "twitter":
    default: {
      const signingKey = channel.config.signingKey as string | undefined;
      const method = (channel.config.method as "GET" | "POST") || "POST";

      const body: Record<string, unknown> = {
        alertId: alertData.alertHistoryId,
        monitorName: alertData.monitorName,
        monitorUrl: alertData.monitorUrl,
        status: alertData.status,
        message: alertData.message,
        responseTime: alertData.responseTime,
        statusCode: alertData.statusCode,
        dashboardUrl: alertData.dashboardUrl,
        timestamp: alertData.timestamp,
      };

      // Sign body if signingKey set
      if (signingKey) {
        try {
          const decryptedKey = await decrypt(signingKey);
          const payload = JSON.stringify(body);
          const ts = Math.floor(Date.now() / 1000);
          const signature = signWebhookPayload(payload, decryptedKey, ts);
          body["signature"] = signature;
          body["signedAt"] = ts;
        } catch (error) {
          // Best-effort signing
          console.error("[Notification] Failed to sign webhook payload", error);
        }
      }

      return {
        ...loggingIds,
        url: (channel.config.url as string) || channel.config.webhookUrl,
        method,
        headers: channel.config.headers as Record<string, string> | undefined,
        body,
        signingKey,
      };
    }
  }
}
