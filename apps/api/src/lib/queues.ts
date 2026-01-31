import { Queue } from "bullmq";
import { redis, queuePrefix } from "./redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import { getAppUrl } from "@uni-status/shared/config";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";

const queueOpts = { connection: redis, prefix: queuePrefix };

// Create queue instances using existing Redis connection
const queues = {
  http: new Queue(QUEUE_NAMES.MONITOR_HTTP, queueOpts),
  dns: new Queue(QUEUE_NAMES.MONITOR_DNS, queueOpts),
  ssl: new Queue(QUEUE_NAMES.MONITOR_SSL, queueOpts),
  tcp: new Queue(QUEUE_NAMES.MONITOR_TCP, queueOpts),
  ping: new Queue(QUEUE_NAMES.MONITOR_PING, queueOpts),
  heartbeat: new Queue(QUEUE_NAMES.MONITOR_HEARTBEAT, queueOpts),
  databasePostgres: new Queue(QUEUE_NAMES.MONITOR_DATABASE_POSTGRES, queueOpts),
  databaseMysql: new Queue(QUEUE_NAMES.MONITOR_DATABASE_MYSQL, queueOpts),
  databaseMongodb: new Queue(QUEUE_NAMES.MONITOR_DATABASE_MONGODB, queueOpts),
  databaseRedis: new Queue(QUEUE_NAMES.MONITOR_DATABASE_REDIS, queueOpts),
  databaseElasticsearch: new Queue(QUEUE_NAMES.MONITOR_DATABASE_ELASTICSEARCH, queueOpts),
  grpc: new Queue(QUEUE_NAMES.MONITOR_GRPC, queueOpts),
  websocket: new Queue(QUEUE_NAMES.MONITOR_WEBSOCKET, queueOpts),
  smtp: new Queue(QUEUE_NAMES.MONITOR_SMTP, queueOpts),
  imap: new Queue(QUEUE_NAMES.MONITOR_IMAP, queueOpts),
  pop3: new Queue(QUEUE_NAMES.MONITOR_POP3, queueOpts),
  ssh: new Queue(QUEUE_NAMES.MONITOR_SSH, queueOpts),
  ldap: new Queue(QUEUE_NAMES.MONITOR_LDAP, queueOpts),
  rdp: new Queue(QUEUE_NAMES.MONITOR_RDP, queueOpts),
  mqtt: new Queue(QUEUE_NAMES.MONITOR_MQTT, queueOpts),
  amqp: new Queue(QUEUE_NAMES.MONITOR_AMQP, queueOpts),
  traceroute: new Queue(QUEUE_NAMES.MONITOR_TRACEROUTE, queueOpts),
  emailAuth: new Queue(QUEUE_NAMES.MONITOR_EMAIL_AUTH, queueOpts),
  prometheusBlackbox: new Queue(QUEUE_NAMES.MONITOR_PROMETHEUS_BLACKBOX, queueOpts),
  prometheusPromql: new Queue(QUEUE_NAMES.MONITOR_PROMETHEUS_PROMQL, queueOpts),
  aggregate: new Queue(QUEUE_NAMES.MONITOR_AGGREGATE, queueOpts),
};

export function getQueueForType(type: string): Queue | null {
  switch (type) {
    case "http":
    case "https":
      return queues.http;
    case "dns":
      return queues.dns;
    case "ssl":
      return queues.ssl;
    case "tcp":
      return queues.tcp;
    case "ping":
      return queues.ping;
    case "heartbeat":
      return queues.heartbeat;
    case "database_postgres":
      return queues.databasePostgres;
    case "database_mysql":
      return queues.databaseMysql;
    case "database_mongodb":
      return queues.databaseMongodb;
    case "database_redis":
      return queues.databaseRedis;
    case "database_elasticsearch":
      return queues.databaseElasticsearch;
    case "grpc":
      return queues.grpc;
    case "websocket":
      return queues.websocket;
    case "smtp":
      return queues.smtp;
    case "imap":
      return queues.imap;
    case "pop3":
      return queues.pop3;
    case "ssh":
      return queues.ssh;
    case "ldap":
      return queues.ldap;
    case "rdp":
      return queues.rdp;
    case "mqtt":
      return queues.mqtt;
    case "amqp":
      return queues.amqp;
    case "traceroute":
      return queues.traceroute;
    case "email_auth":
      return queues.emailAuth;
    case "prometheus_blackbox":
      return queues.prometheusBlackbox;
    case "prometheus_promql":
      return queues.prometheusPromql;
    case "aggregate":
      return queues.aggregate;
    default:
      return null;
  }
}

export interface QueueMonitorCheckInput {
  monitor: {
    id: string;
    type: string;
    url: string;
    method?: string | null;
    headers?: Record<string, string> | null;
    body?: string | null;
    timeoutMs: number;
    assertions?: Record<string, unknown> | null;
    regions: string[];
    degradedThresholdMs?: number | null;
    config?: Record<string, unknown> | null;
  };
}

export async function queueMonitorCheck(
  input: QueueMonitorCheckInput
): Promise<string> {
  const { monitor } = input;
  const queue = getQueueForType(monitor.type);

  if (!queue) {
    throw new Error(`Unknown monitor type: ${monitor.type}`);
  }

  const jobId = `${monitor.id}-${Date.now()}-immediate`;

  await queue.add(
    `check-${monitor.id}`,
    {
      monitorId: monitor.id,
      url: monitor.url,
      method: monitor.method,
      headers: monitor.headers,
      body: monitor.body,
      timeoutMs: monitor.timeoutMs,
      assertions: monitor.assertions,
      regions: monitor.regions,
      degradedThresholdMs: monitor.degradedThresholdMs,
      config: monitor.config,
    },
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 1, // Higher priority than scheduled checks
    }
  );

  return jobId;
}

// Queue SSL certificate check for HTTPS monitors
export interface QueueSslCheckInput {
  monitorId: string;
  organizationId: string;
  url: string;
  timeoutMs?: number;
  regions?: string[];
}

export async function queueSslCheck(input: QueueSslCheckInput): Promise<string> {
  const { monitorId, organizationId, url, timeoutMs = 30000, regions = ["uk"] } = input;
  const jobId = `cert-${monitorId}-${Date.now()}-immediate`;

  await queues.ssl.add(
    `cert-check-${monitorId}`,
    {
      monitorId,
      organizationId,
      url,
      timeoutMs,
      regions,
      config: {
        expiryWarningDays: 30,
        expiryErrorDays: 7,
        checkChain: true,
        checkHostname: true,
      },
    },
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 1,
    }
  );

  return jobId;
}

// ============ Notification Queues ============

const notifyQueues = {
  email: new Queue(QUEUE_NAMES.NOTIFY_EMAIL, queueOpts),
  slack: new Queue(QUEUE_NAMES.NOTIFY_SLACK, queueOpts),
  discord: new Queue(QUEUE_NAMES.NOTIFY_DISCORD, queueOpts),
  webhook: new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts),
  teams: new Queue(QUEUE_NAMES.NOTIFY_TEAMS, queueOpts),
  pagerduty: new Queue(QUEUE_NAMES.NOTIFY_PAGERDUTY, queueOpts),
  sms: new Queue(QUEUE_NAMES.NOTIFY_SMS, queueOpts),
  ntfy: new Queue(QUEUE_NAMES.NOTIFY_NTFY, queueOpts),
  googleChat: new Queue(QUEUE_NAMES.NOTIFY_GOOGLE_CHAT, queueOpts),
  irc: new Queue(QUEUE_NAMES.NOTIFY_IRC, queueOpts),
  twitter: new Queue(QUEUE_NAMES.NOTIFY_TWITTER, queueOpts),
};

export function getNotifyQueueForType(type: string): Queue {
  switch (type) {
    case "email":
      return notifyQueues.email;
    case "slack":
      return notifyQueues.slack;
    case "discord":
      return notifyQueues.discord;
    case "teams":
      return notifyQueues.teams;
    case "pagerduty":
      return notifyQueues.pagerduty;
    case "sms":
      return notifyQueues.sms;
    case "ntfy":
      return notifyQueues.ntfy;
    case "irc":
      return notifyQueues.irc;
    case "twitter":
      return notifyQueues.twitter;
    case "webhook":
    default:
      return notifyQueues.webhook;
  }
}

export interface TestNotificationChannel {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

function buildTestNotificationJobData(
  channel: TestNotificationChannel,
  orgCredentials?: OrganizationCredentials
): Record<string, unknown> {
  const testData = {
    monitorName: "Test Monitor",
    monitorUrl: "https://example.com",
    status: "down" as const,
    message: "This is a test notification from Uni-Status",
    responseTime: 1234,
    statusCode: 500,
    dashboardUrl: getAppUrl(),
    timestamp: new Date().toISOString(),
  };

  switch (channel.type) {
    case "email":
      return {
        to: channel.config.email,
        subject: "[Test] Uni-Status Alert Channel Test",
        emailType: "alert",
        data: testData,
        orgSmtpCredentials: orgCredentials?.smtp,
        orgResendCredentials: orgCredentials?.resend,
      };

    case "slack":
      return {
        webhookUrl: channel.config.webhookUrl,
        message: {
          text: `[Test] ${testData.message}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Test Alert*\n${testData.message}`,
              },
            },
          ],
        },
      };

    case "discord":
      return {
        webhookUrl: channel.config.webhookUrl,
        message: {
          embeds: [
            {
              title: "[Test] Uni-Status Alert",
              description: testData.message,
              color: 16711680, // Red
              fields: [
                { name: "Monitor", value: testData.monitorName, inline: true },
                { name: "Status", value: testData.status.toUpperCase(), inline: true },
                { name: "URL", value: testData.monitorUrl, inline: false },
              ],
              footer: { text: "Uni-Status" },
              timestamp: testData.timestamp,
            },
          ],
        },
      };

    case "teams":
      return {
        webhookUrl: channel.config.webhookUrl,
        message: {
          title: "[Test] Uni-Status Alert",
          text: testData.message,
          severity: "minor",
          monitorName: testData.monitorName,
          statusPageUrl: testData.dashboardUrl,
          timestamp: testData.timestamp,
        },
      };

    case "pagerduty":
      return {
        routingKey: channel.config.routingKey,
        message: {
          eventAction: "trigger" as const,
          dedupKey: `test-${channel.id}-${Date.now()}`,
          severity: "info" as const,
          summary: `[Test] ${testData.message}`,
          source: "Uni-Status Test",
          component: testData.monitorName,
          links: [{ href: testData.dashboardUrl, text: "View Dashboard" }],
        },
      };

    case "sms":
      return {
        to: channel.config.phoneNumber,
        message: `[Uni-Status Test] ${testData.message}`,
      };

    case "ntfy":
      return {
        topic: channel.config.topic,
        server: channel.config.server,
        message: {
          title: "[Test] Uni-Status Alert",
          body: testData.message,
          priority: 3,
          tags: ["test", "information_source"],
          click: testData.dashboardUrl,
        },
      };

    case "irc":
      return {
        server: channel.config.server,
        channel: channel.config.channel,
        message: `[Test] Uni-Status Alert: ${testData.message}`,
      };

    case "twitter":
      return {
        webhookUrl: channel.config.webhookUrl,
        message: {
          text: `[Test] Uni-Status Alert: ${testData.message}`,
          monitorName: testData.monitorName,
          timestamp: testData.timestamp,
        },
      };

    case "webhook":
    default:
      return {
        url: channel.config.url || channel.config.webhookUrl,
        method: channel.config.method || "POST",
        headers: channel.config.headers || {},
        body: { ...testData, isTest: true },
      };
  }
}

export async function queueTestNotification(
  channel: TestNotificationChannel,
  orgCredentials?: OrganizationCredentials
): Promise<string> {
  const queue = getNotifyQueueForType(channel.type);
  const jobData = buildTestNotificationJobData(channel, orgCredentials);
  const jobId = `test-${channel.id}-${Date.now()}`;

  await queue.add(`test-${channel.id}`, jobData, {
    jobId,
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 5, // Match retry configuration in workers
    backoff: {
      type: "exponential",
      delay: 1000, // Starting delay of 1s
    },
  });

  return jobId;
}

// ============ Event Subscription Notification Queue ============

const eventSubscriberQueue = new Queue(QUEUE_NAMES.NOTIFY_EVENT_SUBSCRIBER, queueOpts);

export interface EventSubscriptionNotificationInput {
  eventType: "incident" | "maintenance";
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  eventDescription: string | null;
  updateMessage?: string;
  statusPageSlug: string;
  statusPageName: string;
}

export async function queueEventSubscriptionNotification(
  input: EventSubscriptionNotificationInput
): Promise<string> {
  const jobId = `event-notify-${input.eventType}-${input.eventId}-${Date.now()}`;

  await eventSubscriberQueue.add(
    `event-subscriber-${input.eventId}`,
    input,
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    }
  );

  return jobId;
}

// ============ Component Subscription Notification Queue ============

const componentSubscriberQueue = new Queue(QUEUE_NAMES.NOTIFY_COMPONENT_SUBSCRIBERS, queueOpts);

export interface ComponentSubscriptionNotificationInput {
  notificationType: "incident_created" | "maintenance_scheduled" | "status_change";
  statusPageId: string;
  statusPageSlug: string;
  statusPageName: string;
  affectedMonitors: Array<{ id: string; name: string }>;
  // For incident/maintenance
  eventType?: "incident" | "maintenance";
  eventId?: string;
  eventTitle?: string;
  eventStatus?: string;
  eventSeverity?: string;
  eventDescription?: string;
  // For status change
  previousStatus?: string;
  newStatus?: string;
}

export async function queueComponentSubscriptionNotification(
  input: ComponentSubscriptionNotificationInput
): Promise<string> {
  const jobId = `component-notify-${input.notificationType}-${input.statusPageId}-${Date.now()}`;

  await componentSubscriberQueue.add(
    `component-subscriber-${input.statusPageId}`,
    input,
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    }
  );

  return jobId;
}

// ============ Generic Queue Access ============

const queueCache = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  if (!queueCache.has(name)) {
    queueCache.set(name, new Queue(name, queueOpts));
  }
  return queueCache.get(name)!;
}
