import { Queue } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  alertPolicies,
  alertHistory,
  alertChannels,
  monitorAlertPolicies,
  monitors,
  checkResults,
  organizations,
} from "@uni-status/database/schema";
import { eq, and, gte, desc, inArray, asc, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { connection, queuePrefix, publishEvent } from "./redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import type { AlertChannelType, CheckStatus } from "@uni-status/shared/types";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";
import { decryptConfigSecrets } from "@uni-status/shared/lib/crypto";
import { getAppUrl } from "@uni-status/shared/config";
import {
  buildNotificationJobData,
  getQueueForChannelType,
  mapCheckStatusToAlertStatus,
} from "./notification-builder";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "lib-alert-evaluator" });


const queueOpts = { connection, prefix: queuePrefix };

const emailQueue = new Queue(QUEUE_NAMES.NOTIFY_EMAIL, queueOpts);
const slackQueue = new Queue(QUEUE_NAMES.NOTIFY_SLACK, queueOpts);
const discordQueue = new Queue(QUEUE_NAMES.NOTIFY_DISCORD, queueOpts);
const webhookQueue = new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts);
const ircQueue = new Queue(QUEUE_NAMES.NOTIFY_IRC, queueOpts);
const twitterQueue = new Queue(QUEUE_NAMES.NOTIFY_TWITTER, queueOpts);
const escalationQueue = new Queue(QUEUE_NAMES.ALERT_ESCALATION, queueOpts);
const notificationQueues = {
  email: emailQueue,
  slack: slackQueue,
  discord: discordQueue,
  webhook: webhookQueue,
  sms: emailQueue,
  irc: ircQueue,
  twitter: twitterQueue,
};

interface PageSpeedScores {
  [key: string]: number | undefined;
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
}

interface PageSpeedViolation {
  category: string;
  score: number;
  threshold: number;
}

interface EvaluateAlertInput {
  monitorId: string;
  organizationId: string;
  checkResultId: string;
  checkStatus: CheckStatus;
  errorMessage?: string;
  responseTimeMs?: number;
  statusCode?: number;
  pagespeedScores?: PageSpeedScores | null;
  pagespeedViolations?: PageSpeedViolation[] | null;
}

interface AlertPolicyWithConditions {
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  escalationPolicyId?: string | null;
  oncallRotationId?: string | null;
  conditions: {
    consecutiveFailures?: number;
    failuresInWindow?: {
      count: number;
      windowMinutes: number;
    };
    degradedDuration?: number;
    consecutiveSuccesses?: number;
  };
  channels: string[];
  cooldownMinutes: number;
}

export async function evaluateAlerts(input: EvaluateAlertInput): Promise<void> {
  const { monitorId, organizationId, checkStatus } = input;

  try {
    // 1. Get all alert policies linked to this monitor
    const policies = await getLinkedPolicies(monitorId, organizationId);

    if (policies.length === 0) {
      return; // No policies linked, nothing to evaluate
    }

    // 2. Handle failure/degraded scenarios - check trigger conditions
    const isFailure =
      checkStatus === "failure" ||
      checkStatus === "timeout" ||
      checkStatus === "error";
    const isDegraded = checkStatus === "degraded";
    const isSuccess = checkStatus === "success";

    for (const policy of policies) {
      if (!policy.enabled) continue;

      if (isFailure || isDegraded) {
        const conditionMet = await evaluateConditions(policy, input);

        if (!conditionMet) continue;

        const unresolvedAlert = await getUnresolvedAlert(policy.id, monitorId);

        if (unresolvedAlert) {
          await updateExistingAlert(
            unresolvedAlert.id,
            unresolvedAlert.metadata,
            input.checkResultId,
            input.errorMessage,
            input.responseTimeMs,
            input.statusCode
          );
          continue;
        }

        const inCooldown = await isInCooldown(
          policy.id,
          monitorId,
          policy.cooldownMinutes
        );

        if (inCooldown) {
          log.info(
            `[Alert] Skipping alert for monitor ${monitorId} - policy ${policy.id} is in cooldown`
          );
          continue;
        }

        const alertRecord = await createAlertHistory({
          organizationId,
          monitorId,
          policyId: policy.id,
          checkResultId: input.checkResultId,
          errorMessage: input.errorMessage,
          pagespeedScores: input.pagespeedScores,
          pagespeedViolations: input.pagespeedViolations,
        });

        await queueNotifications(policy, alertRecord, input);

        if (policy.escalationPolicyId) {
          await scheduleEscalations({
            escalationPolicyId: policy.escalationPolicyId,
            alertHistoryId: alertRecord.id,
            organizationId,
            monitorId,
            checkStatus: input.checkStatus,
          });
        }

        await publishAlertEvent(alertRecord, organizationId);

        log.info(
          `[Alert] Triggered alert ${alertRecord.id} for monitor ${monitorId}`
        );
      } else if (isSuccess) {
        // Check for recovery - auto-resolve triggered alerts
        await checkRecovery(policy, input);
      }
    }
  } catch (error) {
    log.error(`[Alert] Error evaluating alerts for ${monitorId}:`, error);
  }
}

async function getLinkedPolicies(
  monitorId: string,
  organizationId: string
): Promise<AlertPolicyWithConditions[]> {
  const links = await db
    .select({
      policyId: monitorAlertPolicies.policyId,
    })
    .from(monitorAlertPolicies)
    .where(eq(monitorAlertPolicies.monitorId, monitorId));

  const policyIds = links.map((l) => l.policyId);

  const linkedPolicies = policyIds.length > 0
    ? await db
        .select()
        .from(alertPolicies)
        .where(inArray(alertPolicies.id, policyIds))
    : [];

  const globalPolicies = await db
    .select({
      policy: alertPolicies,
    })
    .from(alertPolicies)
    .leftJoin(
      monitorAlertPolicies,
      eq(alertPolicies.id, monitorAlertPolicies.policyId)
    )
    .where(
      and(
        eq(alertPolicies.organizationId, organizationId),
        isNull(monitorAlertPolicies.policyId)
      )
    );

  const merged = [
    ...linkedPolicies,
    ...globalPolicies.map((row) => row.policy),
  ];

  const uniquePolicies = new Map<string, AlertPolicyWithConditions>();
  for (const policy of merged) {
    uniquePolicies.set(policy.id, policy as AlertPolicyWithConditions);
  }

  return Array.from(uniquePolicies.values());
}

async function evaluateConditions(
  policy: AlertPolicyWithConditions,
  input: EvaluateAlertInput
): Promise<boolean> {
  const { monitorId, checkStatus } = input;
  const conditions = policy.conditions;

  if (conditions.consecutiveFailures) {
    const met = await checkConsecutiveFailures(
      monitorId,
      conditions.consecutiveFailures
    );
    if (met) return true;
  }

  if (conditions.failuresInWindow) {
    const met = await checkFailuresInWindow(
      monitorId,
      conditions.failuresInWindow.count,
      conditions.failuresInWindow.windowMinutes
    );
    if (met) return true;
  }

  if (conditions.degradedDuration && checkStatus === "degraded") {
    const met = await checkDegradedDuration(
      monitorId,
      conditions.degradedDuration
    );
    if (met) return true;
  }

  return false;
}

async function checkConsecutiveFailures(
  monitorId: string,
  threshold: number
): Promise<boolean> {
  const recentChecks = await db
    .select({ status: checkResults.status })
    .from(checkResults)
    .where(eq(checkResults.monitorId, monitorId))
    .orderBy(desc(checkResults.createdAt))
    .limit(threshold);

  if (recentChecks.length < threshold) return false;

  return recentChecks.every(
    (c) =>
      c.status === "failure" || c.status === "timeout" || c.status === "error"
  );
}

async function checkFailuresInWindow(
  monitorId: string,
  count: number,
  windowMinutes: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(checkResults)
    .where(
      and(
        eq(checkResults.monitorId, monitorId),
        gte(checkResults.createdAt, windowStart),
        inArray(checkResults.status, ["failure", "timeout", "error"])
      )
    );

  const total = result[0]?.count ?? 0;
  return total >= count;
}

async function checkDegradedDuration(
  monitorId: string,
  durationMinutes: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - durationMinutes * 60 * 1000);

  const checksInWindow = await db
    .select({ status: checkResults.status })
    .from(checkResults)
    .where(
      and(
        eq(checkResults.monitorId, monitorId),
        gte(checkResults.createdAt, windowStart)
      )
    )
    .orderBy(asc(checkResults.createdAt));

  if (checksInWindow.length === 0) return false;

  // All checks in the window must be degraded
  return checksInWindow.every((c) => c.status === "degraded");
}

async function isInCooldown(
  policyId: string,
  monitorId: string,
  cooldownMinutes: number
): Promise<boolean> {
  const cooldownStart = new Date(Date.now() - cooldownMinutes * 60 * 1000);

  const recentResolvedAlert = await db
    .select({ id: alertHistory.id })
    .from(alertHistory)
    .where(
      and(
        eq(alertHistory.policyId, policyId),
        eq(alertHistory.monitorId, monitorId),
        eq(alertHistory.status, "resolved"),
        gte(alertHistory.resolvedAt, cooldownStart)
      )
    )
    .limit(1);

  return recentResolvedAlert.length > 0;
}

async function getUnresolvedAlert(
  policyId: string,
  monitorId: string
): Promise<{ id: string; metadata: any } | null> {
  const unresolvedAlert = await db
    .select({ id: alertHistory.id, metadata: alertHistory.metadata })
    .from(alertHistory)
    .where(
      and(
        eq(alertHistory.policyId, policyId),
        eq(alertHistory.monitorId, monitorId),
        eq(alertHistory.status, "triggered")
      )
    )
    .orderBy(desc(alertHistory.triggeredAt))
    .limit(1);

  return unresolvedAlert[0] || null;
}

async function updateExistingAlert(
  alertId: string,
  currentMetadata: any,
  checkResultId: string,
  errorMessage?: string,
  responseTimeMs?: number,
  statusCode?: number
): Promise<void> {
  const failureCount = (currentMetadata.failureCount || 0) + 1;
  const failureTimestamps = currentMetadata.failureTimestamps || [];
  const now = new Date().toISOString();

  await db
    .update(alertHistory)
    .set({
      metadata: {
        ...currentMetadata,
        failureCount,
        lastFailureAt: now,
        failureTimestamps: [...failureTimestamps, now].slice(-20),
        checkResultId,
        errorMessage,
        responseTimeMs,
        statusCode,
      },
    })
    .where(eq(alertHistory.id, alertId));

  log.info(`[Alert] Updated alert ${alertId} - failure count: ${failureCount}`);
}

async function createAlertHistory(params: {
  organizationId: string;
  monitorId: string;
  policyId: string;
  checkResultId: string;
  errorMessage?: string;
  pagespeedScores?: PageSpeedScores | null;
  pagespeedViolations?: PageSpeedViolation[] | null;
}): Promise<{ id: string; organizationId: string; monitorId: string }> {
  const id = nanoid();
  const now = new Date().toISOString();

  await db.insert(alertHistory).values({
    id,
    organizationId: params.organizationId,
    monitorId: params.monitorId,
    policyId: params.policyId,
    status: "triggered",
    triggeredAt: new Date(),
    metadata: {
      checkResultId: params.checkResultId,
      errorMessage: params.errorMessage,
      failureCount: 1,
      lastFailureAt: now,
      failureTimestamps: [now],
      ...(params.pagespeedScores && { pagespeedScores: params.pagespeedScores }),
      ...(params.pagespeedViolations && { pagespeedViolations: params.pagespeedViolations }),
    },
    createdAt: new Date(),
  });

  return {
    id,
    organizationId: params.organizationId,
    monitorId: params.monitorId,
  };
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
    log.error(`[Alert] Error decrypting org credentials:`, error);
    return null;
  }
}

async function queueNotifications(
  policy: AlertPolicyWithConditions,
  alertRecord: { id: string; organizationId: string; monitorId: string },
  input: EvaluateAlertInput
): Promise<void> {
  const monitor = await db
    .select({ name: monitors.name, url: monitors.url })
    .from(monitors)
    .where(eq(monitors.id, input.monitorId))
    .limit(1);

  if (!monitor[0]) return;

  // Get channel IDs from policy, ensuring we have an array
  let channelIds = [...(policy.channels || [])];

  // Resolve on-call user's email if oncallRotationId is configured
  let oncallEmail: string | null = null;
  if (policy.oncallRotationId) {
    oncallEmail = await resolveOncallUserEmail(
      policy.oncallRotationId,
      input.organizationId
    );
  }

  // Get channels from the database
  const channels = channelIds.length > 0
    ? await db
        .select()
        .from(alertChannels)
        .where(
          and(
            eq(alertChannels.organizationId, input.organizationId),
            inArray(alertChannels.id, channelIds),
            eq(alertChannels.enabled, true)
          )
        )
    : [];

  const orgCredentials = await getOrgCredentials(input.organizationId);

  const APP_URL = getAppUrl();
  const alertStatus = mapCheckStatusToAlertStatus(input.checkStatus);

  // Queue notifications for regular channels
  for (const channel of channels) {
    const queue = getQueueForChannelType(channel.type as AlertChannelType, notificationQueues);

    const jobData = await buildNotificationJobData(channel, {
      alertHistoryId: alertRecord.id,
      monitorName: monitor[0].name,
      monitorUrl: monitor[0].url,
      status: alertStatus,
      message: input.errorMessage,
      responseTime: input.responseTimeMs,
      statusCode: input.statusCode,
      dashboardUrl: `${APP_URL}/monitors/${input.monitorId}`,
      timestamp: new Date().toISOString(),
      pagespeedScores: input.pagespeedScores,
      pagespeedViolations: input.pagespeedViolations,
    }, orgCredentials);

    await queue.add(`alert-${alertRecord.id}-${channel.id}`, jobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });

    log.info(
      `[Alert] Queued ${channel.type} notification for alert ${alertRecord.id}`
    );
  }

  // Queue direct email notification to on-call user
  if (oncallEmail) {
    const oncallJobData = {
      alertHistoryId: alertRecord.id,
      to: oncallEmail,
      subject: `[On-Call Alert] ${monitor[0].name} is ${alertStatus}`,
      emailType: "alert",
      data: {
        monitorName: monitor[0].name,
        monitorUrl: monitor[0].url,
        status: alertStatus,
        message: input.errorMessage,
        responseTime: input.responseTimeMs,
        statusCode: input.statusCode,
        dashboardUrl: `${APP_URL}/monitors/${input.monitorId}`,
        timestamp: new Date().toISOString(),
      },
      orgSmtpCredentials: orgCredentials?.smtp,
      orgResendCredentials: orgCredentials?.resend,
    };

    await emailQueue.add(`alert-${alertRecord.id}-oncall`, oncallJobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });

    log.info(
      `[Alert] Queued on-call email notification to ${oncallEmail} for alert ${alertRecord.id}`
    );
  }
}

async function publishAlertEvent(
  alertRecord: { id: string; organizationId: string; monitorId: string },
  organizationId: string
): Promise<void> {
  await publishEvent(`org:${organizationId}`, {
    type: "alert:triggered",
    data: {
      alertId: alertRecord.id,
      monitorId: alertRecord.monitorId,
      timestamp: new Date().toISOString(),
    },
  });
}

async function checkRecovery(
  policy: AlertPolicyWithConditions,
  input: EvaluateAlertInput
): Promise<void> {
  const { monitorId, organizationId } = input;
  const consecutiveSuccesses = policy.conditions.consecutiveSuccesses || 1;

  // Check if there's an unresolved alert for this monitor/policy
  const unresolvedAlert = await db
    .select({ id: alertHistory.id })
    .from(alertHistory)
    .where(
      and(
        eq(alertHistory.monitorId, monitorId),
        eq(alertHistory.policyId, policy.id),
        eq(alertHistory.status, "triggered")
      )
    )
    .orderBy(desc(alertHistory.triggeredAt))
    .limit(1);

  const [openAlert] = unresolvedAlert;
  if (!openAlert) return;

  // Check if we have enough consecutive successes
  const recentChecks = await db
    .select({ status: checkResults.status })
    .from(checkResults)
    .where(eq(checkResults.monitorId, monitorId))
    .orderBy(desc(checkResults.createdAt))
    .limit(consecutiveSuccesses);

  if (recentChecks.length < consecutiveSuccesses) return;

  const allSuccess = recentChecks.every((c) => c.status === "success");

  if (!allSuccess) return;

  // Auto-resolve the alert
  await db
    .update(alertHistory)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: "system",
    })
    .where(eq(alertHistory.id, openAlert.id));

  log.info(
    `[Alert] Auto-resolved alert ${openAlert.id} for monitor ${monitorId}`
  );

  // Queue recovery notifications
  await queueRecoveryNotifications(policy, openAlert.id, input);

  // Publish recovery event
  await publishEvent(`org:${organizationId}`, {
    type: "alert:resolved",
    data: {
      alertId: openAlert.id,
      monitorId,
      resolvedBy: "system",
      timestamp: new Date().toISOString(),
    },
  });
}

async function scheduleEscalations(params: {
  escalationPolicyId: string;
  alertHistoryId: string;
  organizationId: string;
  monitorId: string;
  checkStatus: CheckStatus;
}) {
  const { escalationPolicyId, alertHistoryId, organizationId, monitorId, checkStatus } = params;

  try {
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const { escalationPolicies, escalationSteps } = await import(
      "@uni-status/enterprise/database/schema"
    );

    const policy = await enterpriseDb.query.escalationPolicies.findFirst({
      where: and(
        eq(escalationPolicies.id, escalationPolicyId),
        eq(escalationPolicies.organizationId, organizationId)
      ),
      with: {
        steps: {
          orderBy: [asc(escalationSteps.stepNumber)],
        },
      },
    });

    if (!policy?.steps?.length) {
      return;
    }

    const severity = mapCheckStatusToSeverity(checkStatus);
    const startStep = policy.severityOverrides?.[severity] || 1;
    let accumulatedDelayMs = 0;

    for (const step of policy.steps) {
      if (step.stepNumber < startStep) continue;
      accumulatedDelayMs += (step.delayMinutes || 0) * 60 * 1000;

      await escalationQueue.add(
        `escalation-${alertHistoryId}-step-${step.stepNumber}`,
        {
          alertHistoryId,
          organizationId,
          monitorId,
          escalationPolicyId,
          stepNumber: step.stepNumber,
        },
        {
          delay: accumulatedDelayMs,
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );
    }
  } catch {
    log.info("[Alert] Escalation scheduling skipped - enterprise package not available");
  }
}

function mapCheckStatusToSeverity(checkStatus: CheckStatus): "minor" | "major" | "critical" {
  switch (checkStatus) {
    case "degraded":
      return "major";
    case "failure":
    case "timeout":
    case "error":
      return "critical";
    default:
      return "minor";
  }
}

// Queue recovery notifications
async function queueRecoveryNotifications(
  policy: AlertPolicyWithConditions,
  alertId: string,
  input: EvaluateAlertInput
): Promise<void> {
  // Get monitor details
  const monitor = await db
    .select({ name: monitors.name, url: monitors.url })
    .from(monitors)
    .where(eq(monitors.id, input.monitorId))
    .limit(1);

  if (!monitor[0]) return;

  // Get channel IDs from policy
  const channelIds = policy.channels || [];

  // Resolve on-call user's email if oncallRotationId is configured
  let oncallEmail: string | null = null;
  if (policy.oncallRotationId) {
    oncallEmail = await resolveOncallUserEmail(
      policy.oncallRotationId,
      input.organizationId
    );
  }

  // Get enabled channels
  const channels = channelIds.length > 0
    ? await db
        .select()
        .from(alertChannels)
        .where(
          and(
            eq(alertChannels.organizationId, input.organizationId),
            inArray(alertChannels.id, channelIds),
            eq(alertChannels.enabled, true)
          )
        )
    : [];

  // Fetch org credentials for BYO integrations
  const orgCredentials = await getOrgCredentials(input.organizationId);

  const APP_URL = getAppUrl();

  for (const channel of channels) {
    const queue = getQueueForChannelType(channel.type as AlertChannelType, notificationQueues);

    const jobData = await buildNotificationJobData(channel, {
      alertHistoryId: alertId,
      monitorName: monitor[0].name,
      monitorUrl: monitor[0].url,
      status: "recovered",
      dashboardUrl: `${APP_URL}/monitors/${input.monitorId}`,
      timestamp: new Date().toISOString(),
    }, orgCredentials);

    await queue.add(`recovery-${alertId}-${channel.id}`, jobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });

    log.info(
      `[Alert] Queued recovery ${channel.type} notification for alert ${alertId}`
    );
  }

  // Queue recovery email to on-call user
  if (oncallEmail) {
    const oncallJobData = {
      alertHistoryId: alertId,
      to: oncallEmail,
      subject: `[On-Call Recovery] ${monitor[0].name} has recovered`,
      emailType: "alert",
      data: {
        monitorName: monitor[0].name,
        monitorUrl: monitor[0].url,
        status: "recovered",
        dashboardUrl: `${APP_URL}/monitors/${input.monitorId}`,
        timestamp: new Date().toISOString(),
      },
      orgSmtpCredentials: orgCredentials?.smtp,
      orgResendCredentials: orgCredentials?.resend,
    };

    await emailQueue.add(`recovery-${alertId}-oncall`, oncallJobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });

    log.info(
      `[Alert] Queued on-call recovery email notification to ${oncallEmail} for alert ${alertId}`
    );
  }
}

// Resolve current on-call user and get their email for direct notification
async function resolveOncallUserEmail(
  rotationId: string,
  orgId: string
): Promise<string | null> {
  try {
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const { oncallRotations } = await import(
      "@uni-status/enterprise/database/schema"
    );

    const rotation = await enterpriseDb.query.oncallRotations.findFirst({
      where: and(
        eq(oncallRotations.id, rotationId),
        eq(oncallRotations.organizationId, orgId),
        eq(oncallRotations.active, true)
      ),
      with: { overrides: true },
    });

    if (!rotation || rotation.participants.length === 0) {
      log.info("[Alert] On-call rotation has no participants");
      return null;
    }

    const now = new Date();
    const shiftMs = rotation.shiftDurationMinutes * 60 * 1000;

    // Check for active override first
    const activeOverride = rotation.overrides.find(
      (o: { startAt: Date; endAt: Date }) => o.startAt <= now && o.endAt >= now
    );

    let currentUserId: string;
    if (activeOverride) {
      currentUserId = activeOverride.userId;
    } else {
      const elapsedMs = now.getTime() - rotation.rotationStart.getTime();
      const currentShiftIndex = Math.floor(elapsedMs / shiftMs);
      const participantIndex = currentShiftIndex % rotation.participants.length;
      currentUserId = rotation.participants[participantIndex];
    }

    if (!currentUserId) {
      log.info("[Alert] No current on-call user found");
      return null;
    }

    // Get user's email from the users table
    const { users } = await import("@uni-status/database/schema");
    const user = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);

    if (user[0]?.email) {
      log.info(`[Alert] Resolved on-call user: ${user[0].email}`);
      return user[0].email;
    }

    return null;
  } catch (error) {
    log.info("[Alert] On-call resolution skipped - enterprise unavailable or error:", error);
    return null;
  }
}
