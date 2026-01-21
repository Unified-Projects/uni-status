/**
 * Grace Period Processor
 *
 * Handles license grace periods:
 * - Sends reminder emails at configured intervals
 * - Downgrades to free tier after grace period expires
 * - Records billing events for auditing
 */

import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { eq, and, lte } from "drizzle-orm";
import { enterpriseDb as db } from "../../database";
import {
  licenses,
  billingEvents,
  DEFAULT_FREE_ENTITLEMENTS,
} from "../../database/schema/licensing";
import { organizations, users, organizationMembers } from "@uni-status/database";
import { clearLicenseCache } from "../../api/middleware/license";
import { getQueue } from "../../api/lib/queues";
import { QUEUE_NAMES } from "@uni-status/shared/constants";

export interface GracePeriodJobData {
  organizationId?: string; // Process specific org
  dryRun?: boolean; // Log but don't execute changes
}

// Grace period email schedule (days before end)
const EMAIL_SCHEDULE = [5, 3, 1, 0]; // Day 5, Day 3, Day 1, Final day

interface ProcessingResult {
  organizationId: string;
  licenseId: string;
  action: "reminder_sent" | "downgraded" | "skipped";
  daysRemaining?: number;
  reason?: string;
}

/**
 * Process grace period jobs.
 * Checks all licenses in grace period and takes appropriate action.
 */
export async function processGracePeriod(
  job: Job<GracePeriodJobData>
): Promise<{ processed: number; results: ProcessingResult[] }> {
  const { organizationId, dryRun } = job.data;

  console.log(`[GracePeriod] Starting job ${job.id}`, { organizationId, dryRun });

  // Build query conditions
  const conditions = [eq(licenses.gracePeriodStatus, "active")];

  if (organizationId) {
    conditions.push(eq(licenses.organizationId, organizationId));
  }

  // Get licenses in grace period
  const gracePeriodLicenses = await db.query.licenses.findMany({
    where: and(...conditions),
  });

  console.log(
    `[GracePeriod] Found ${gracePeriodLicenses.length} licenses in grace period`
  );

  const results: ProcessingResult[] = [];
  const now = new Date();

  for (const license of gracePeriodLicenses) {
    try {
      const result = await processLicenseGracePeriod(license, now, dryRun);
      results.push(result);

      await job.updateProgress(
        Math.round((results.length / gracePeriodLicenses.length) * 100)
      );
    } catch (error) {
      console.error(
        `[GracePeriod] Error processing license ${license.id}:`,
        error
      );
      results.push({
        organizationId: license.organizationId,
        licenseId: license.id,
        action: "skipped",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const actioned = results.filter((r) => r.action !== "skipped").length;
  console.log(
    `[GracePeriod] Completed: ${actioned}/${results.length} actioned`
  );

  return { processed: results.length, results };
}

/**
 * Process grace period for a single license.
 */
async function processLicenseGracePeriod(
  license: typeof licenses.$inferSelect,
  now: Date,
  dryRun?: boolean
): Promise<ProcessingResult> {
  if (!license.gracePeriodEndsAt) {
    return {
      organizationId: license.organizationId,
      licenseId: license.id,
      action: "skipped",
      reason: "No grace period end date",
    };
  }

  const daysRemaining = Math.ceil(
    (license.gracePeriodEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );

  // Check if grace period has expired
  if (daysRemaining <= 0) {
    if (!dryRun) {
      await downgradeLicense(license, now);
    }
    return {
      organizationId: license.organizationId,
      licenseId: license.id,
      action: "downgraded",
      daysRemaining: 0,
    };
  }

  // Check if we need to send a reminder
  const emailsSent = (license.gracePeriodEmailsSent as number[]) || [];
  const shouldSendEmail = EMAIL_SCHEDULE.includes(daysRemaining) &&
    !emailsSent.includes(daysRemaining);

  if (shouldSendEmail) {
    if (!dryRun) {
      await sendGracePeriodReminder(license, daysRemaining);

      // Update emails sent record
      await db
        .update(licenses)
        .set({
          gracePeriodEmailsSent: [...emailsSent, daysRemaining],
          updatedAt: now,
        })
        .where(eq(licenses.id, license.id));

      await db.insert(billingEvents).values({
        id: nanoid(),
        organizationId: license.organizationId,
        licenseId: license.id,
        eventType: "grace_period_reminder",
        source: "system",
        metadata: { daysRemaining },
        createdAt: now,
      });
    }

    return {
      organizationId: license.organizationId,
      licenseId: license.id,
      action: "reminder_sent",
      daysRemaining,
    };
  }

  return {
    organizationId: license.organizationId,
    licenseId: license.id,
    action: "skipped",
    daysRemaining,
    reason: `No action needed (${daysRemaining} days remaining)`,
  };
}

/**
 * Downgrade a license to free tier after grace period expires.
 */
async function downgradeLicense(
  license: typeof licenses.$inferSelect,
  now: Date
): Promise<void> {
  console.log(`[GracePeriod] Downgrading license ${license.id}`);

  const previousState = {
    plan: license.plan,
    status: license.status,
    entitlements: license.entitlements,
    gracePeriodStatus: license.gracePeriodStatus,
  };

  // Update license to downgraded state
  await db
    .update(licenses)
    .set({
      gracePeriodStatus: "expired",
      entitlements: DEFAULT_FREE_ENTITLEMENTS,
      updatedAt: now,
    })
    .where(eq(licenses.id, license.id));

  // Clear license cache
  clearLicenseCache(license.organizationId);

  // Record billing events
  await db.insert(billingEvents).values([
    {
      id: nanoid(),
      organizationId: license.organizationId,
      licenseId: license.id,
      eventType: "grace_period_ended",
      source: "system",
      previousState,
      newState: {
        gracePeriodStatus: "expired",
        entitlements: DEFAULT_FREE_ENTITLEMENTS,
      },
      createdAt: now,
    },
    {
      id: nanoid(),
      organizationId: license.organizationId,
      licenseId: license.id,
      eventType: "downgraded",
      source: "system",
      previousState: { plan: license.plan },
      newState: { plan: "free", reason: "grace_period_expired" },
      createdAt: now,
    },
  ]);

  // Send downgrade notification email
  await sendDowngradeNotification(license);
}

/**
 * Send grace period reminder email to organization admins.
 */
async function sendGracePeriodReminder(
  license: typeof licenses.$inferSelect,
  daysRemaining: number
): Promise<void> {
  // Get organization admins/owners
  const recipients = await getOrganizationAdminEmails(license.organizationId);

  if (recipients.length === 0) {
    console.warn(
      `[GracePeriod] No recipients found for org ${license.organizationId}`
    );
    return;
  }

  // Get organization name
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, license.organizationId),
    columns: { name: true },
  });

  // Queue email job
  const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
  if (emailQueue) {
    await emailQueue.add(
      "grace-period-reminder",
      {
        template: "grace-period-reminder",
        to: recipients,
        data: {
          organizationName: org?.name || "Your Organization",
          plan: license.plan,
          daysRemaining,
          gracePeriodEndsAt: license.gracePeriodEndsAt?.toISOString(),
          isUrgent: daysRemaining <= 1,
          portalUrl: getPortalUrl(license.organizationId),
        },
      },
      {
        priority: daysRemaining <= 1 ? 1 : 2,
      }
    );
  } else {
    console.warn("[GracePeriod] Email queue not available");
  }
}

/**
 * Send downgrade notification email to organization admins.
 */
async function sendDowngradeNotification(
  license: typeof licenses.$inferSelect
): Promise<void> {
  const recipients = await getOrganizationAdminEmails(license.organizationId);

  if (recipients.length === 0) {
    return;
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, license.organizationId),
    columns: { name: true },
  });

  const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
  if (emailQueue) {
    await emailQueue.add(
      "downgrade-notice",
      {
        template: "downgrade-notice",
        to: recipients,
        data: {
          organizationName: org?.name || "Your Organization",
          previousPlan: license.plan,
          freeEntitlements: DEFAULT_FREE_ENTITLEMENTS,
          portalUrl: getPortalUrl(license.organizationId),
        },
      },
      {
        priority: 1,
      }
    );
  }
}

/**
 * Get email addresses of organization admins and owners.
 */
async function getOrganizationAdminEmails(
  organizationId: string
): Promise<string[]> {
  const members = await db
    .select({
      email: users.email,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        // Filter for admin/owner roles would go here
        // For now, get all members
      )
    );

  return members
    .map((m) => m.email)
    .filter((email): email is string => email !== null);
}

/**
 * Get portal URL for license management.
 */
function getPortalUrl(organizationId: string): string {
  const webUrl = process.env.UNI_STATUS_WEB_URL || "http://localhost:3000";
  return `${webUrl}/settings?tab=billing`;
}
