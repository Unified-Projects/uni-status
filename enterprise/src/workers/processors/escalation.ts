import { Job } from "bullmq";
import { nanoid } from "nanoid";
import {
  alertHistory,
  alertChannels,
  monitors,
  organizations,
} from "@uni-status/database/schema";
import { enterpriseDb as db } from "../../database";
import { escalationPolicies, escalationSteps } from "../../database/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { Queue } from "bullmq";
import { getConnection, getPrefix } from "../lib/redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import type { AlertChannelType } from "@uni-status/shared/types";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";
import { decryptConfigSecrets } from "@uni-status/shared/lib/crypto";
import { getAppUrl } from "@uni-status/shared/config";
import { buildNotificationJobData, getQueueForChannelType } from "../lib/notification-builder";

function getNotificationQueues() {
  const connection = getConnection();
  const prefix = getPrefix();
  const queueOpts = { connection, prefix };
  return {
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
}

interface EscalationJobData {
  alertHistoryId: string;
  organizationId: string;
  monitorId: string;
  escalationPolicyId: string;
  stepNumber: number;
}

async function getOrgCredentials(organizationId: string): Promise<OrganizationCredentials | null> {
  const org = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org[0]?.settings?.credentials) {
    return null;
  }

  try {
    return await decryptConfigSecrets(org[0].settings.credentials);
  } catch (error) {
    console.error(`[Escalation] Error decrypting org credentials:`, error);
    return null;
  }
}

export async function processAlertEscalation(job: Job<EscalationJobData>) {
  const { alertHistoryId, organizationId, monitorId, escalationPolicyId, stepNumber } = job.data;

  const alert = await db.query.alertHistory.findFirst({
    where: and(eq(alertHistory.id, alertHistoryId), eq(alertHistory.organizationId, organizationId)),
  });

  if (!alert) {
    console.log(`[Escalation] Alert ${alertHistoryId} not found`);
    return;
  }

  if (alert.status === "resolved") {
    console.log(`[Escalation] Alert ${alertHistoryId} resolved, skipping escalation`);
    return;
  }

  if (alert.status === "acknowledged") {
    console.log(`[Escalation] Alert ${alertHistoryId} acknowledged, skipping escalation`);
    return;
  }

  const policy = await db.query.escalationPolicies.findFirst({
    where: and(eq(escalationPolicies.id, escalationPolicyId), eq(escalationPolicies.organizationId, organizationId)),
    with: {
      steps: {
        orderBy: [asc(escalationSteps.stepNumber)],
      },
    },
  });

  if (!policy) {
    console.log(`[Escalation] Policy ${escalationPolicyId} not found`);
    return;
  }

  const step = policy.steps.find((s) => s.stepNumber === stepNumber);
  if (!step) {
    console.log(`[Escalation] Step ${stepNumber} missing for policy ${escalationPolicyId}`);
    return;
  }


  const monitor = await db
    .select({ name: monitors.name, url: monitors.url })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  if (!monitor[0]) {
    console.log(`[Escalation] Monitor ${monitorId} not found`);
    return;
  }

  const channels = await db
    .select()
    .from(alertChannels)
    .where(
      and(
        eq(alertChannels.organizationId, organizationId),
        inArray(alertChannels.id, step.channels),
        eq(alertChannels.enabled, true)
      )
    );

  if (channels.length === 0) {
    console.log(`[Escalation] No channels enabled for step ${stepNumber}`);
    return;
  }

  const orgCredentials = await getOrgCredentials(organizationId);
  const APP_URL = getAppUrl();

  for (const channel of channels) {
    const queue = getQueueForChannelType(channel.type as AlertChannelType, getNotificationQueues());

    const jobData = await buildNotificationJobData(
      channel,
      {
        alertHistoryId: alertHistoryId,
        monitorName: monitor[0].name,
        monitorUrl: monitor[0].url,
        status: "down",
        message: alert.metadata?.errorMessage,
        responseTime: alert.metadata?.responseTimeMs,
        statusCode: alert.metadata?.statusCode,
        dashboardUrl: `${APP_URL}/monitors/${monitorId}`,
        timestamp: new Date().toISOString(),
      },
      orgCredentials
    );

    await queue.add(`escalation-${alertHistoryId}-${channel.id}-s${stepNumber}`, jobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  await db
    .update(alertHistory)
    .set({
      escalationStep: stepNumber,
      escalatedAt: new Date(),
      escalationPolicyId,
    })
    .where(eq(alertHistory.id, alertHistoryId));

  console.log(`[Escalation] Step ${stepNumber} dispatched for alert ${alertHistoryId}`);
}
