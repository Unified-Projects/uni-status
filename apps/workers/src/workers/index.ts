import { Queue, Worker } from "bullmq";
import { connection, queuePrefix } from "../lib/redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import { processHttpCheck } from "../processors/http-check";
import { processDnsCheck } from "../processors/dns-check";
import { processSslCheck } from "../processors/ssl-check";
import { processCertificateTransparencyCheck } from "../processors/certificate-transparency-check";
import { processTcpCheck } from "../processors/tcp-check";
import { processPingCheck } from "../processors/ping-check";
import { processHeartbeatCheck } from "../processors/heartbeat-check";
import {
  processPostgresCheck,
  processMysqlCheck,
  processRedisCheck,
  processMongodbCheck,
  processElasticsearchCheck,
} from "../processors/database";
import { processWebSocketCheck } from "../processors/websocket-check";
import { processGrpcCheck } from "../processors/grpc-check";
import { processSmtpCheck, processImapCheck, processPop3Check } from "../processors/email";
import { processSshCheck, processLdapCheck, processRdpCheck } from "../processors/protocol";
import { processMqttCheck, processAmqpCheck } from "../processors/broker";
import { processTracerouteCheck } from "../processors/traceroute-check";
import { processEmailAuthCheck } from "../processors/email-auth-check";
import { processPrometheusBlackboxCheck } from "../processors/prometheus-blackbox-check";
import { processPrometheusPromqlCheck } from "../processors/prometheus-promql-check";
import { processAggregateCheck } from "../processors/aggregate-check";
import { processEmailNotification } from "../processors/notifications/email";
import { processSlackNotification } from "../processors/notifications/slack";
import { processDiscordNotification } from "../processors/notifications/discord";
import { processWebhookNotification } from "../processors/notifications/webhook";
import { processTeamsNotification } from "../processors/notifications/teams";
import { processPagerDutyNotification } from "../processors/notifications/pagerduty";
import { processSmsNotification } from "../processors/notifications/sms";
import { processNtfyNotification } from "../processors/notifications/ntfy";
import { processGoogleChatNotification } from "../processors/notifications/google-chat";
import { processIrcNotification } from "../processors/notifications/irc";
import { processTwitterNotification } from "../processors/notifications/twitter";
import { processSubscriberNotification } from "../processors/notifications/subscriber";
import { processEventSubscriptionNotification } from "../processors/notifications/event-subscriber";
import { processComponentSubscriptionNotification } from "../processors/notifications/component-subscriber";
import { processAggregation } from "../processors/aggregation";
import { processDailyAggregation } from "../processors/daily-aggregation";
import { processCleanup } from "../processors/cleanup";
import { processDeploymentCorrelation } from "../processors/deployment-correlator";
import { processProbeJobDispatch, processProbeHealthCheck, processProbeResult } from "../processors/probe-dispatcher";
import type { Queues } from "../queues";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "workers-index" });


const notificationWorkerOpts = {
  connection,
  prefix: queuePrefix,
  concurrency: 10,
  settings: {
    backoffStrategy: (attemptsMade: number) => {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      return Math.min(Math.pow(2, attemptsMade - 1) * 1000, 16000);
    },
  },
};

export function createWorkers(queues: Queues) {
  const workers: Worker[] = [];

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_HTTP, processHttpCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 50,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_DNS, processDnsCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_SSL, processSslCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_CERTIFICATE_TRANSPARENCY, processCertificateTransparencyCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_TCP, processTcpCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 30,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_PING, processPingCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_HEARTBEAT, processHeartbeatCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_DATABASE_POSTGRES, processPostgresCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_DATABASE_MYSQL, processMysqlCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_DATABASE_REDIS, processRedisCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_DATABASE_MONGODB, processMongodbCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_DATABASE_ELASTICSEARCH, processElasticsearchCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_WEBSOCKET, processWebSocketCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_GRPC, processGrpcCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_SMTP, processSmtpCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_IMAP, processImapCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_POP3, processPop3Check, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_SSH, processSshCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_LDAP, processLdapCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_RDP, processRdpCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_MQTT, processMqttCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_AMQP, processAmqpCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  // Lower concurrency as traceroute is resource-intensive
  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_TRACEROUTE, processTracerouteCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 5,
    })
  );

  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_EMAIL_AUTH, processEmailAuthCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  // Prometheus Blackbox Check Worker
  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_PROMETHEUS_BLACKBOX, processPrometheusBlackboxCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  // Prometheus PromQL Check Worker
  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_PROMETHEUS_PROMQL, processPrometheusPromqlCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  // Aggregate Monitor Check Worker
  workers.push(
    new Worker(QUEUE_NAMES.MONITOR_AGGREGATE, processAggregateCheck, {
      connection,
      prefix: queuePrefix,
      concurrency: 20, // Higher concurrency since it's just DB queries
    })
  );

  // Email Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_EMAIL, processEmailNotification, notificationWorkerOpts)
  );

  // Slack Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_SLACK, processSlackNotification, notificationWorkerOpts)
  );

  // Discord Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_DISCORD, processDiscordNotification, notificationWorkerOpts)
  );

  // Webhook Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_WEBHOOK, processWebhookNotification, notificationWorkerOpts)
  );

  // Microsoft Teams Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_TEAMS, processTeamsNotification, notificationWorkerOpts)
  );

  // PagerDuty Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_PAGERDUTY, processPagerDutyNotification, notificationWorkerOpts)
  );

  // SMS Notification Worker (Twilio, with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_SMS, processSmsNotification, notificationWorkerOpts)
  );

  // Ntfy Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_NTFY, processNtfyNotification, notificationWorkerOpts)
  );

  // Google Chat Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_GOOGLE_CHAT, processGoogleChatNotification, notificationWorkerOpts)
  );

  // IRC Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_IRC, processIrcNotification, notificationWorkerOpts)
  );

  // Twitter/X Notification Worker (with retry)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_TWITTER, processTwitterNotification, notificationWorkerOpts)
  );

  // Subscriber Notification Worker (for status page subscribers - maintenance, incidents)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_SUBSCRIBER, processSubscriberNotification, notificationWorkerOpts)
  );

  // Event Subscription Notification Worker (for per-event email subscriptions)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_EVENT_SUBSCRIBER, processEventSubscriptionNotification, notificationWorkerOpts)
  );

  // Component Subscription Notification Worker (for per-component email subscriptions)
  workers.push(
    new Worker(QUEUE_NAMES.NOTIFY_COMPONENT_SUBSCRIBERS, processComponentSubscriptionNotification, notificationWorkerOpts)
  );

  // Aggregation Worker (hourly)
  workers.push(
    new Worker(QUEUE_NAMES.ANALYTICS_AGGREGATE, processAggregation, {
      connection,
      prefix: queuePrefix,
      concurrency: 1,
    })
  );

  // Daily Aggregation Worker
  workers.push(
    new Worker(QUEUE_NAMES.ANALYTICS_DAILY_AGGREGATE, processDailyAggregation, {
      connection,
      prefix: queuePrefix,
      concurrency: 1,
    })
  );

  // Cleanup Worker
  workers.push(
    new Worker(QUEUE_NAMES.CLEANUP_RESULTS, processCleanup, {
      connection,
      prefix: queuePrefix,
      concurrency: 1,
    })
  );

  // Deployment Correlator Worker
  workers.push(
    new Worker(QUEUE_NAMES.DEPLOYMENT_CORRELATE, processDeploymentCorrelation, {
      connection,
      prefix: queuePrefix,
      concurrency: 5,
    })
  );

  // Probe Job Dispatcher Worker
  workers.push(
    new Worker(QUEUE_NAMES.PROBE_JOB_DISPATCH, processProbeJobDispatch, {
      connection,
      prefix: queuePrefix,
      concurrency: 10,
    })
  );

  // Probe Result Processor Worker
  workers.push(
    new Worker(QUEUE_NAMES.PROBE_RESULT_PROCESS, processProbeResult, {
      connection,
      prefix: queuePrefix,
      concurrency: 20,
    })
  );

  // Add error handlers
  workers.forEach((worker) => {
    worker.on("failed", (job, err) => {
      log.error(`Job ${job?.id} in ${worker.name} failed:`, err);
    });

    worker.on("completed", (job) => {
      log.info(`Job ${job.id} in ${worker.name} completed`);
    });
  });

  return workers;
}

// Enterprise workers (conditionally loaded)
export async function loadEnterpriseWorkers(): Promise<Worker[]> {
  const workers: Worker[] = [];

  try {
    const {
      configureEnterpriseWorkers,
      processAlertEscalation,
      processSloCalculation,
      processSloAlert,
      processReportGeneration,
    } = await import("@uni-status/enterprise/workers");
    const { buildNotificationJobData, getQueueForChannelType } = await import("../lib/notification-builder");
    const getQueueForChannelTypeCompat = (
      type: Parameters<typeof getQueueForChannelType>[0],
      queues: Record<string, Queue>
    ) => getQueueForChannelType(type, queues as Parameters<typeof getQueueForChannelType>[1]);

    configureEnterpriseWorkers({
      redis: { connection, prefix: queuePrefix },
      notifications: { buildNotificationJobData, getQueueForChannelType: getQueueForChannelTypeCompat },
    });

    // Alert escalation Worker
    workers.push(
      new Worker(QUEUE_NAMES.ALERT_ESCALATION, processAlertEscalation, {
        connection,
        prefix: queuePrefix,
        concurrency: 10,
      })
    );

    // SLO Calculator Worker
    workers.push(
      new Worker(QUEUE_NAMES.SLO_CALCULATE, processSloCalculation, {
        connection,
        prefix: queuePrefix,
        concurrency: 5,
      })
    );

    // SLO Alert Worker
    workers.push(
      new Worker(QUEUE_NAMES.SLO_ALERT, processSloAlert, {
        connection,
        prefix: queuePrefix,
        concurrency: 10,
      })
    );

    // Report Generator Worker
    workers.push(
      new Worker(QUEUE_NAMES.REPORT_GENERATE, processReportGeneration, {
        connection,
        prefix: queuePrefix,
        concurrency: 2,
      })
    );

    // Add error handlers
    workers.forEach((worker) => {
      worker.on("failed", (job, err) => {
        log.error(`[Enterprise] Job ${job?.id} in ${worker.name} failed:`, err);
      });

      worker.on("completed", (job) => {
        log.info(`[Enterprise] Job ${job.id} in ${worker.name} completed`);
      });
    });

    log.info("[Enterprise] Workers loaded successfully");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      log.info("[Enterprise] Package not installed, skipping enterprise workers");
    } else {
      log.error("[Enterprise] Failed to load workers:", error);
    }
  }

  return workers;
}
