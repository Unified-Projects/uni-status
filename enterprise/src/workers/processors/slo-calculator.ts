import { Job, Queue } from "bullmq";
import { nanoid } from "nanoid";
import { checkResults, alertChannels, organizations } from "@uni-status/database/schema";
import { enterpriseDb as db } from "../../database";
import { sloTargets, errorBudgets, sloBreaches } from "../../database/schema";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { buildNotificationJobData, getQueueForChannelType } from "../lib/notification-builder";
import type { AlertChannelType } from "@uni-status/shared/types";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";
import { decryptConfigSecrets } from "@uni-status/shared/lib/crypto";
import { getAppUrl } from "@uni-status/shared/config";
import { getConnection, getPrefix } from "../lib/redis";

interface SloCalculateJobData {
  sloTargetId?: string; // Calculate for specific SLO
  organizationId?: string; // Calculate for all SLOs in org
  full?: boolean; // Force full recalculation
}

interface SloAlertJobData {
  sloTargetId: string;
  organizationId: string;
  threshold: number;
  percentRemaining: number;
  breached: boolean;
}

// Get period dates based on window type
function getPeriodDates(window: "daily" | "weekly" | "monthly" | "quarterly" | "annually"): {
  periodStart: Date;
  periodEnd: Date;
  totalMinutes: number;
} {
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  switch (window) {
    case "daily":
      // Today from midnight to 23:59:59
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case "weekly":
      // Week starting from Monday (ISO week)
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0);
      periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 6, 23, 59, 59);
      break;
    case "monthly":
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case "quarterly":
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1);
      periodEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
      break;
    case "annually":
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
  }

  const totalMinutes = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60);

  return { periodStart, periodEnd, totalMinutes };
}

// Calculate downtime from check results
async function calculateDowntimeMinutes(
  monitorId: string,
  periodStart: Date,
  periodEnd: Date,
  gracePeriodMinutes: number
): Promise<number> {
  // Get all check results for the period
  const results = await db
    .select({
      status: checkResults.status,
      createdAt: checkResults.createdAt,
    })
    .from(checkResults)
    .where(
      and(
        eq(checkResults.monitorId, monitorId),
        gte(checkResults.createdAt, periodStart),
        lte(checkResults.createdAt, periodEnd),
        sql`COALESCE(${checkResults.metadata} ->> 'checkType', '') <> 'certificate_transparency'`
      )
    )
    .orderBy(checkResults.createdAt);

  if (results.length === 0) {
    return 0;
  }

  let downtimeMinutes = 0;
  let consecutiveFailures = 0;
  let failureStartTime: Date | null = null;

  for (const result of results) {
    const isFailure = result.status === "failure" || result.status === "error" || result.status === "timeout";

    if (isFailure) {
      if (consecutiveFailures === 0) {
        failureStartTime = result.createdAt;
      }
      consecutiveFailures++;
    } else {
      if (failureStartTime && consecutiveFailures > 0) {
        // Calculate downtime duration
        const duration = (result.createdAt.getTime() - failureStartTime.getTime()) / (1000 * 60);

        // Only count if longer than grace period
        if (duration > gracePeriodMinutes) {
          downtimeMinutes += duration - gracePeriodMinutes;
        }
      }
      consecutiveFailures = 0;
      failureStartTime = null;
    }
  }

  // Handle ongoing downtime
  if (failureStartTime) {
    const now = new Date();
    const endTime = now < periodEnd ? now : periodEnd;
    const duration = (endTime.getTime() - failureStartTime.getTime()) / (1000 * 60);

    if (duration > gracePeriodMinutes) {
      downtimeMinutes += duration - gracePeriodMinutes;
    }
  }

  return Math.max(0, downtimeMinutes);
}

// Calculate or update error budget for an SLO
async function calculateSloErrorBudget(slo: typeof sloTargets.$inferSelect): Promise<void> {
  const { periodStart, periodEnd, totalMinutes } = getPeriodDates(slo.window);
  const now = new Date();

  // Get or create error budget record for this period
  let budget = await db.query.errorBudgets.findFirst({
    where: and(
      eq(errorBudgets.sloTargetId, slo.id),
      lte(errorBudgets.periodStart, now),
      gte(errorBudgets.periodEnd, now)
    ),
  });

  // Calculate budget based on target percentage
  const targetPercentage = parseFloat(slo.targetPercentage);
  const allowedDowntimePercentage = 100 - targetPercentage;
  const budgetMinutes = (allowedDowntimePercentage / 100) * totalMinutes;

  // Calculate actual downtime
  const consumedMinutes = await calculateDowntimeMinutes(
    slo.monitorId,
    periodStart,
    periodEnd,
    slo.gracePeriodMinutes ?? 0
  );

  const remainingMinutes = Math.max(0, budgetMinutes - consumedMinutes);
  const percentConsumed = budgetMinutes > 0 ? (consumedMinutes / budgetMinutes) * 100 : 0;
  const percentRemaining = budgetMinutes > 0 ? (remainingMinutes / budgetMinutes) * 100 : 0;
  const breached = consumedMinutes >= budgetMinutes;

  if (budget) {
    // Update existing budget
    const wasBreached = budget.breached;
    const previousThreshold = budget.lastAlertThreshold ? parseFloat(budget.lastAlertThreshold) : null;

    await db
      .update(errorBudgets)
      .set({
        consumedMinutes: consumedMinutes.toFixed(2),
        remainingMinutes: remainingMinutes.toFixed(2),
        percentConsumed: percentConsumed.toFixed(2),
        percentRemaining: percentRemaining.toFixed(2),
        breached,
        breachedAt: breached && !wasBreached ? now : budget.breachedAt,
        updatedAt: now,
      })
      .where(eq(errorBudgets.id, budget.id));

    // Check if we need to send alerts for threshold crossings
    const alertThresholds = slo.alertThresholds as string[] | null;
    if (alertThresholds && alertThresholds.length > 0) {
      // Sort thresholds descending (100, 75, 50, 25, 10, 5...)
      const sortedThresholds = alertThresholds
        .map((t) => parseFloat(t))
        .sort((a, b) => b - a);

      // Find the current threshold we're at
      let currentThreshold: number | null = null;
      for (const threshold of sortedThresholds) {
        if (percentRemaining <= threshold) {
          currentThreshold = threshold;
        }
      }

      // Send alert if we crossed a new threshold
      if (currentThreshold !== null && currentThreshold !== previousThreshold) {
        await db
          .update(errorBudgets)
          .set({
            lastAlertThreshold: currentThreshold.toFixed(2),
          })
          .where(eq(errorBudgets.id, budget.id));

        // Queue alert notification
        console.log(`SLO ${slo.name}: Budget at ${percentRemaining.toFixed(1)}% remaining, threshold ${currentThreshold}% crossed`);

        try {
          const connection = getConnection();
          const prefix = getPrefix();
          const sloAlertQueue = new Queue(QUEUE_NAMES.SLO_ALERT, { connection, prefix });

          await sloAlertQueue.add(`slo-alert-${slo.id}-${currentThreshold}`, {
            sloTargetId: slo.id,
            organizationId: slo.organizationId,
            threshold: currentThreshold,
            percentRemaining,
            breached: false,
          }, {
            removeOnComplete: 100,
            removeOnFail: 100,
          });
        } catch (error) {
          console.error(`[SLO] Error queueing alert for ${slo.name}:`, error);
        }
      }
    }

    // Record breach if new
    if (breached && !wasBreached) {
      await recordSloBreach(slo, budget.id, consumedMinutes, budgetMinutes, percentRemaining, targetPercentage);
    }
  } else {
    // Create new budget record
    const budgetId = nanoid();
    await db.insert(errorBudgets).values({
      id: budgetId,
      sloTargetId: slo.id,
      periodStart,
      periodEnd,
      totalMinutes: totalMinutes.toFixed(2),
      budgetMinutes: budgetMinutes.toFixed(2),
      consumedMinutes: consumedMinutes.toFixed(2),
      remainingMinutes: remainingMinutes.toFixed(2),
      percentConsumed: percentConsumed.toFixed(2),
      percentRemaining: percentRemaining.toFixed(2),
      breached,
      breachedAt: breached ? now : null,
      createdAt: now,
      updatedAt: now,
    });

    // Record breach if starting breached
    if (breached) {
      await recordSloBreach(slo, budgetId, consumedMinutes, budgetMinutes, percentRemaining, targetPercentage);
    }
  }
}

// Record an SLO breach
async function recordSloBreach(
  slo: typeof sloTargets.$inferSelect,
  errorBudgetId: string,
  downtimeMinutes: number,
  budgetMinutes: number,
  percentRemaining: number,
  targetPercentage: number
): Promise<void> {
  const now = new Date();

  // Calculate actual uptime percentage
  const { periodStart, periodEnd, totalMinutes } = getPeriodDates(slo.window);
  const effectiveMinutes = Math.min(totalMinutes, (now.getTime() - periodStart.getTime()) / (1000 * 60));
  const uptimePercentage = effectiveMinutes > 0
    ? ((effectiveMinutes - downtimeMinutes) / effectiveMinutes) * 100
    : 100;

  await db.insert(sloBreaches).values({
    id: nanoid(),
    sloTargetId: slo.id,
    errorBudgetId,
    breachStartedAt: now,
    downtimeMinutes: downtimeMinutes.toFixed(2),
    budgetMinutes: budgetMinutes.toFixed(2),
    uptimePercentage: uptimePercentage.toFixed(3),
    targetPercentage: targetPercentage.toFixed(3),
    createdAt: now,
  });

  console.log(`SLO BREACH: ${slo.name} - Target ${targetPercentage}%, Actual ${uptimePercentage.toFixed(3)}%`);

  // Queue breach alert
  try {
    const connection = getConnection();
    const prefix = getPrefix();
    const sloAlertQueue = new Queue(QUEUE_NAMES.SLO_ALERT, { connection, prefix });

    await sloAlertQueue.add(`slo-breach-${slo.id}`, {
      sloTargetId: slo.id,
      organizationId: slo.organizationId,
      threshold: 0,
      percentRemaining: 0,
      breached: true,
    }, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  } catch (error) {
    console.error(`[SLO] Error queueing breach alert for ${slo.name}:`, error);
  }
}

// Main processor for SLO calculations
export async function processSloCalculation(job: Job<SloCalculateJobData>): Promise<void> {
  const { sloTargetId, organizationId, full } = job.data;

  console.log(`Processing SLO calculation: ${sloTargetId || "all"} for org ${organizationId || "all"}`);

  let slosToProcess: (typeof sloTargets.$inferSelect)[] = [];

  if (sloTargetId) {
    // Calculate for specific SLO
    const slo = await db.query.sloTargets.findFirst({
      where: and(
        eq(sloTargets.id, sloTargetId),
        eq(sloTargets.active, true)
      ),
    });
    if (slo) {
      slosToProcess = [slo];
    }
  } else if (organizationId) {
    // Calculate for all active SLOs in organization
    slosToProcess = await db.query.sloTargets.findMany({
      where: and(
        eq(sloTargets.organizationId, organizationId),
        eq(sloTargets.active, true)
      ),
    });
  } else {
    // Calculate for all active SLOs (scheduled job)
    slosToProcess = await db.query.sloTargets.findMany({
      where: eq(sloTargets.active, true),
    });
  }

  console.log(`Processing ${slosToProcess.length} SLOs`);

  for (const slo of slosToProcess) {
    try {
      await calculateSloErrorBudget(slo);
    } catch (error) {
      console.error(`Error calculating SLO ${slo.id}:`, error);
    }
  }

  console.log(`SLO calculation complete`);
}

// Get organization credentials for BYO integrations
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
    console.error(`[SLO Alert] Error decrypting org credentials:`, error);
    return null;
  }
}

// Processor for SLO alerts
export async function processSloAlert(job: Job<SloAlertJobData>): Promise<void> {
  const { sloTargetId, organizationId, threshold, percentRemaining, breached } = job.data;

  const slo = await db.query.sloTargets.findFirst({
    where: eq(sloTargets.id, sloTargetId),
    with: {
      monitor: {
        columns: {
          id: true,
          name: true,
          url: true,
        },
      },
    },
  });

  if (!slo) {
    console.error(`[SLO Alert] SLO target ${sloTargetId} not found`);
    return;
  }

  const message = breached
    ? `SLO BREACH: ${slo.name} for ${slo.monitor.name} has exceeded its error budget`
    : `SLO WARNING: ${slo.name} for ${slo.monitor.name} error budget is at ${percentRemaining.toFixed(1)}% (threshold: ${threshold}%)`;

  console.log(`[SLO Alert] ${message}`);

  // Get all enabled alert channels for this organization
  const channels = await db
    .select()
    .from(alertChannels)
    .where(
      and(
        eq(alertChannels.organizationId, organizationId),
        eq(alertChannels.enabled, true)
      )
    );

  if (channels.length === 0) {
    console.log(`[SLO Alert] No alert channels configured for organization ${organizationId}`);
    return;
  }

  const orgCredentials = await getOrgCredentials(organizationId);
  const APP_URL = getAppUrl();

  const connection = getConnection();
  const prefix = getPrefix();
  const queueOpts = { connection, prefix };

  const queues: Record<string, Queue> = {
    email: new Queue(QUEUE_NAMES.NOTIFY_EMAIL, queueOpts),
    slack: new Queue(QUEUE_NAMES.NOTIFY_SLACK, queueOpts),
    discord: new Queue(QUEUE_NAMES.NOTIFY_DISCORD, queueOpts),
    webhook: new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts),
    teams: new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts),
    pagerduty: new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts),
    ntfy: new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts),
    sms: new Queue(QUEUE_NAMES.NOTIFY_EMAIL, queueOpts),
    irc: new Queue(QUEUE_NAMES.NOTIFY_IRC, queueOpts),
    twitter: new Queue(QUEUE_NAMES.NOTIFY_TWITTER, queueOpts),
  };

  const alertHistoryId = nanoid();
  const alertStatus = breached ? "down" : "degraded";

  for (const channel of channels) {
    try {
      const queue = getQueueForChannelType(channel.type as AlertChannelType, queues);

      const jobData = await buildNotificationJobData(channel, {
        alertHistoryId,
        monitorName: `SLO: ${slo.name} (${slo.monitor.name})`,
        monitorUrl: slo.monitor.url || "",
        status: alertStatus,
        message,
        dashboardUrl: `${APP_URL}/slos/${slo.id}`,
        timestamp: new Date().toISOString(),
      }, orgCredentials);

      await queue.add(`slo-alert-${sloTargetId}-${channel.id}`, jobData, {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      });

      console.log(`[SLO Alert] Queued ${channel.type} notification for SLO ${slo.name}`);
    } catch (error) {
      console.error(`[SLO Alert] Error queueing notification to ${channel.type}:`, error);
    }
  }
}
