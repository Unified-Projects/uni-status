import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { Client } from "irc-framework";
import { db } from "@uni-status/database";
import { notificationLogs } from "@uni-status/database/schema";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "notifications-irc" });


interface IrcNotificationJob {
  // IRC connection config
  ircServer: string;
  ircPort: number;
  ircChannel: string;
  ircNickname: string;
  ircPassword?: string;
  ircUseSsl?: boolean;
  // Message content
  monitorName: string;
  monitorUrl: string;
  status: "down" | "degraded" | "recovered";
  message?: string;
  dashboardUrl: string;
  timestamp: string;
  // Optional IDs for logging
  alertHistoryId?: string;
  channelId?: string;
}

async function logNotification(
  alertHistoryId: string,
  channelId: string,
  success: boolean,
  responseCode: number | null,
  errorMessage: string | null,
  retryCount: number
) {
  await db.insert(notificationLogs).values({
    id: nanoid(),
    alertHistoryId,
    channelId,
    success,
    responseCode,
    errorMessage,
    retryCount,
    sentAt: new Date(),
  });
}

function formatIrcMessage(data: IrcNotificationJob): string {
  const statusEmoji = {
    down: "[DOWN]",
    degraded: "[DEGRADED]",
    recovered: "[RECOVERED]",
  };

  const statusText = statusEmoji[data.status] || `[${data.status.toUpperCase()}]`;

  let msg = `${statusText} ${data.monitorName}`;

  if (data.monitorUrl) {
    msg += ` (${data.monitorUrl})`;
  }

  if (data.message) {
    msg += ` - ${data.message}`;
  }

  msg += ` | Dashboard: ${data.dashboardUrl}`;

  return msg;
}

export async function processIrcNotification(job: Job<IrcNotificationJob>) {
  const { data, attemptsMade } = job;
  const {
    ircServer,
    ircPort,
    ircChannel,
    ircNickname,
    ircPassword,
    ircUseSsl,
    alertHistoryId,
    channelId,
  } = data;

  log.info(`[IRC] Sending notification to ${ircChannel} on ${ircServer} (attempt ${attemptsMade + 1})`);

  return new Promise<{ success: boolean }>((resolve, reject) => {
    const client = new Client();
    let messageDelivered = false;
    let connectionTimeout: NodeJS.Timeout;

    // Set connection timeout
    connectionTimeout = setTimeout(() => {
      if (!messageDelivered) {
        client.quit("Connection timeout");
        const errorMsg = "IRC connection timeout after 30 seconds";
        log.error(`[IRC] ${errorMsg}`);

        if (alertHistoryId && channelId && attemptsMade >= 4) {
          logNotification(alertHistoryId, channelId, false, null, errorMsg, attemptsMade + 1);
        }
        reject(new Error(errorMsg));
      }
    }, 30000);

    client.on("registered", () => {
      log.info(`[IRC] Connected to ${ircServer}, joining ${ircChannel}`);
      client.join(ircChannel);
    });

    client.on("join", (event: { channel: string }) => {
      if (event.channel.toLowerCase() === ircChannel.toLowerCase()) {
        const message = formatIrcMessage(data);
        client.say(ircChannel, message);
        messageDelivered = true;

        // Give some time for the message to be sent before disconnecting
        setTimeout(() => {
          clearTimeout(connectionTimeout);
          client.quit("Message delivered");

          if (alertHistoryId && channelId) {
            logNotification(alertHistoryId, channelId, true, null, null, attemptsMade + 1);
          }

          log.info(`[IRC] Successfully sent notification to ${ircChannel}`);
          resolve({ success: true });
        }, 1000);
      }
    });

    client.on("close", () => {
      clearTimeout(connectionTimeout);
      if (!messageDelivered) {
        const errorMsg = "IRC connection closed before message was sent";
        log.error(`[IRC] ${errorMsg}`);

        if (alertHistoryId && channelId && attemptsMade >= 4) {
          logNotification(alertHistoryId, channelId, false, null, errorMsg, attemptsMade + 1);
        }
        reject(new Error(errorMsg));
      }
    });

    client.on("socket close", () => {
      clearTimeout(connectionTimeout);
      if (!messageDelivered) {
        const errorMsg = "IRC socket closed unexpectedly";

        if (alertHistoryId && channelId && attemptsMade >= 4) {
          logNotification(alertHistoryId, channelId, false, null, errorMsg, attemptsMade + 1);
        }
        reject(new Error(errorMsg));
      }
    });

    // Connect to IRC server
    client.connect({
      host: ircServer,
      port: ircPort,
      nick: ircNickname,
      password: ircPassword,
      tls: ircUseSsl ?? false,
    });
  });
}
