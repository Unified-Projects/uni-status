import { db } from "@uni-status/database";
import { monitors, maintenanceWindows, statusPageMonitors, subscribers, statusPages, probes } from "@uni-status/database/schema";
import { eq, lte, and, gte, or, inArray, isNull, lt, ne } from "drizzle-orm";
import { Queue } from "bullmq";
import { connection, queuePrefix } from "./lib/redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";
import { shouldQueueCertificateCheck } from "./lib/certificate-scheduling";

const POLL_INTERVAL = 10000; // 10 seconds
const MAINTENANCE_POLL_INTERVAL = 30000; // 30 seconds for maintenance notifications
const SLO_POLL_INTERVAL = 300000; // 5 minutes for SLO calculations
const PROBE_HEALTH_INTERVAL = 60000; // 1 minute for probe health checks
const REPORT_SCHEDULE_INTERVAL = 60000; // 1 minute for scheduled report checks
const AGGREGATION_POLL_INTERVAL = 300000; // 5 minutes for response time aggregation
const DAILY_AGGREGATION_POLL_INTERVAL = 3600000; // 1 hour for daily aggregation (catches up on missing days)
const CERT_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours for certificate checks on HTTPS monitors

let monitorIntervalId: ReturnType<typeof setInterval> | null = null;
let maintenanceIntervalId: ReturnType<typeof setInterval> | null = null;
let sloIntervalId: ReturnType<typeof setInterval> | null = null;
let probeHealthIntervalId: ReturnType<typeof setInterval> | null = null;
let reportScheduleIntervalId: ReturnType<typeof setInterval> | null = null;
let aggregationIntervalId: ReturnType<typeof setInterval> | null = null;
let dailyAggregationIntervalId: ReturnType<typeof setInterval> | null = null;
let certCheckIntervalId: ReturnType<typeof setInterval> | null = null;

const queueOpts = { connection, prefix: queuePrefix };

const httpQueue = new Queue(QUEUE_NAMES.MONITOR_HTTP, queueOpts);
const dnsQueue = new Queue(QUEUE_NAMES.MONITOR_DNS, queueOpts);
const sslQueue = new Queue(QUEUE_NAMES.MONITOR_SSL, queueOpts);
const ctQueue = new Queue(QUEUE_NAMES.MONITOR_CERTIFICATE_TRANSPARENCY, queueOpts);
const tcpQueue = new Queue(QUEUE_NAMES.MONITOR_TCP, queueOpts);
const pingQueue = new Queue(QUEUE_NAMES.MONITOR_PING, queueOpts);
// New monitor queues
const heartbeatQueue = new Queue(QUEUE_NAMES.MONITOR_HEARTBEAT, queueOpts);
const postgresQueue = new Queue(QUEUE_NAMES.MONITOR_DATABASE_POSTGRES, queueOpts);
const mysqlQueue = new Queue(QUEUE_NAMES.MONITOR_DATABASE_MYSQL, queueOpts);
const mongodbQueue = new Queue(QUEUE_NAMES.MONITOR_DATABASE_MONGODB, queueOpts);
const redisQueue = new Queue(QUEUE_NAMES.MONITOR_DATABASE_REDIS, queueOpts);
const elasticsearchQueue = new Queue(QUEUE_NAMES.MONITOR_DATABASE_ELASTICSEARCH, queueOpts);
const grpcQueue = new Queue(QUEUE_NAMES.MONITOR_GRPC, queueOpts);
const websocketQueue = new Queue(QUEUE_NAMES.MONITOR_WEBSOCKET, queueOpts);
const smtpQueue = new Queue(QUEUE_NAMES.MONITOR_SMTP, queueOpts);
const imapQueue = new Queue(QUEUE_NAMES.MONITOR_IMAP, queueOpts);
const pop3Queue = new Queue(QUEUE_NAMES.MONITOR_POP3, queueOpts);
const sshQueue = new Queue(QUEUE_NAMES.MONITOR_SSH, queueOpts);
const ldapQueue = new Queue(QUEUE_NAMES.MONITOR_LDAP, queueOpts);
const rdpQueue = new Queue(QUEUE_NAMES.MONITOR_RDP, queueOpts);
const mqttQueue = new Queue(QUEUE_NAMES.MONITOR_MQTT, queueOpts);
const amqpQueue = new Queue(QUEUE_NAMES.MONITOR_AMQP, queueOpts);
const tracerouteQueue = new Queue(QUEUE_NAMES.MONITOR_TRACEROUTE, queueOpts);
const emailAuthQueue = new Queue(QUEUE_NAMES.MONITOR_EMAIL_AUTH, queueOpts);
const prometheusBlackboxQueue = new Queue(QUEUE_NAMES.MONITOR_PROMETHEUS_BLACKBOX, queueOpts);
const prometheusPromqlQueue = new Queue(QUEUE_NAMES.MONITOR_PROMETHEUS_PROMQL, queueOpts);
const monitorAggregateQueue = new Queue(QUEUE_NAMES.MONITOR_AGGREGATE, queueOpts);
// Notification queue
const subscriberNotifyQueue = new Queue(QUEUE_NAMES.NOTIFY_SUBSCRIBER, queueOpts);
// Batch 7: Advanced Features queues
const sloCalculateQueue = new Queue(QUEUE_NAMES.SLO_CALCULATE, queueOpts);
const probeJobDispatchQueue = new Queue(QUEUE_NAMES.PROBE_JOB_DISPATCH, queueOpts);
const reportGenerateQueue = new Queue(QUEUE_NAMES.REPORT_GENERATE, queueOpts);
// Analytics aggregation queues
const aggregateQueue = new Queue(QUEUE_NAMES.ANALYTICS_AGGREGATE, queueOpts);
const dailyAggregateQueue = new Queue(QUEUE_NAMES.ANALYTICS_DAILY_AGGREGATE, queueOpts);

async function pollMonitors() {
  const now = new Date();

  try {
    // Get active maintenance windows
    const activeMaintenanceWindows = await db.query.maintenanceWindows.findMany({
      where: and(
        lte(maintenanceWindows.startsAt, now),
        gte(maintenanceWindows.endsAt, now)
      ),
    });

    // Collect all affected monitor IDs from active maintenance windows
    const monitorsInMaintenance = new Set<string>();
    for (const mw of activeMaintenanceWindows) {
      const affected = mw.affectedMonitors as string[];
      if (affected) {
        for (const monitorId of affected) {
          monitorsInMaintenance.add(monitorId);
        }
      }
    }

    if (monitorsInMaintenance.size > 0) {
      console.log(
        `${monitorsInMaintenance.size} monitor(s) in maintenance (${activeMaintenanceWindows.length} active window(s))`
      );
    }

    // Get monitors due for checking
    const allDueMonitors = await db.query.monitors.findMany({
      where: and(
        eq(monitors.paused, false),
        lte(monitors.nextCheckAt, now),
        ne(monitors.type, "ssl")
      ),
    });

    // Filter out monitors that are in maintenance
    const dueMonitors = allDueMonitors.filter(
      (monitor) => !monitorsInMaintenance.has(monitor.id)
    );

    const skippedCount = allDueMonitors.length - dueMonitors.length;
    console.log(
      `Found ${allDueMonitors.length} monitors due for checking` +
        (skippedCount > 0 ? ` (${skippedCount} skipped due to maintenance)` : "")
    );

    for (const monitor of dueMonitors) {
      // Queue the check based on monitor type
      const queue = getQueueForType(monitor.type);

      if (queue) {
        await queue.add(
          `check-${monitor.id}`,
          {
            monitorId: monitor.id,
            organizationId: monitor.organizationId,  // Organization ID for API key lookup
            url: monitor.url,
            method: monitor.method,
            headers: monitor.headers,
            body: monitor.body,
            timeoutMs: monitor.timeoutMs,
            assertions: monitor.assertions,
            regions: monitor.regions,
            config: monitor.config,  // Extended config for new monitor types
            degradedThresholdMs: monitor.degradedThresholdMs,  // Degraded threshold
          },
          {
            jobId: `${monitor.id}-${now.getTime()}`,
            removeOnComplete: 100,
            removeOnFail: 100,
          }
        );

        // Update next check time
        const nextCheckAt = new Date(
          now.getTime() + monitor.intervalSeconds * 1000
        );

        await db
          .update(monitors)
          .set({
            nextCheckAt,
            lastCheckedAt: now,
          })
          .where(eq(monitors.id, monitor.id));
      } else if (monitor.type === "prometheus_remote_write") {
        // Passive monitors are driven by remote write ingestion; just advance nextCheckAt to avoid tight loops
        const nextCheckAt = new Date(now.getTime() + monitor.intervalSeconds * 1000);
        await db
          .update(monitors)
          .set({
            nextCheckAt,
            lastCheckedAt: now,
          })
          .where(eq(monitors.id, monitor.id));
      }
    }
  } catch (error) {
    console.error("Error polling monitors:", error);
  }
}

function getQueueForType(type: string): Queue | null {
  switch (type) {
    case "http":
    case "https":
      return httpQueue;
    case "dns":
      return dnsQueue;
    case "ssl":
      return sslQueue;
    case "tcp":
      return tcpQueue;
    case "ping":
      return pingQueue;
    // New monitor types
    case "heartbeat":
      return heartbeatQueue;
    case "database_postgres":
      return postgresQueue;
    case "database_mysql":
      return mysqlQueue;
    case "database_mongodb":
      return mongodbQueue;
    case "database_redis":
      return redisQueue;
    case "database_elasticsearch":
      return elasticsearchQueue;
    case "grpc":
      return grpcQueue;
    case "websocket":
      return websocketQueue;
    case "smtp":
      return smtpQueue;
    case "imap":
      return imapQueue;
    case "pop3":
      return pop3Queue;
    case "ssh":
      return sshQueue;
    case "ldap":
      return ldapQueue;
    case "rdp":
      return rdpQueue;
    case "mqtt":
      return mqttQueue;
    case "amqp":
      return amqpQueue;
    case "traceroute":
      return tracerouteQueue;
    case "email_auth":
      return emailAuthQueue;
    case "prometheus_blackbox":
      return prometheusBlackboxQueue;
    case "prometheus_promql":
      return prometheusPromqlQueue;
    case "prometheus_remote_write":
      return null; // Passive monitors receive status via remote write ingestion
    case "aggregate":
      return monitorAggregateQueue;
    default:
      console.warn(`Unknown monitor type: ${type}`);
      return null;
  }
}

// Types for maintenance window notification tracking
interface NotifySubscribersConfig {
  beforeStart?: number; // minutes before
  onStart?: boolean;
  onEnd?: boolean;
}

interface NotificationsSent {
  beforeStartAt?: string;
  onStartAt?: string;
  onEndAt?: string;
}

type NotificationType = "beforeStart" | "onStart" | "onEnd";

// Poll for maintenance windows that need notifications sent
async function pollMaintenanceNotifications() {
  const now = new Date();

  try {
    // Get all active maintenance windows that might need notifications
    // Include windows that are:
    // 1. Starting soon (for beforeStart notifications)
    // 2. Just started (for onStart notifications)
    // 3. Just ended (for onEnd notifications)
    const lookAheadMinutes = 60; // Look ahead 1 hour for beforeStart notifications
    const lookBackMinutes = 5; // Look back 5 minutes to catch recently started/ended

    const lookAhead = new Date(now.getTime() + lookAheadMinutes * 60 * 1000);
    const lookBack = new Date(now.getTime() - lookBackMinutes * 60 * 1000);

    const windows = await db.query.maintenanceWindows.findMany({
      where: and(
        eq(maintenanceWindows.active, true),
        // Window starts within lookAhead or ends within lookBack to now
        or(
          // Window starts within the next hour (for beforeStart and onStart)
          and(
            lte(maintenanceWindows.startsAt, lookAhead),
            gte(maintenanceWindows.startsAt, lookBack)
          ),
          // Window ends within lookBack to now (for onEnd)
          and(
            lte(maintenanceWindows.endsAt, now),
            gte(maintenanceWindows.endsAt, lookBack)
          ),
          // Window is currently active (for onStart if missed)
          and(
            lte(maintenanceWindows.startsAt, now),
            gte(maintenanceWindows.endsAt, now)
          )
        )
      ),
    });

    if (windows.length === 0) {
      return;
    }

    console.log(`[Maintenance] Checking ${windows.length} maintenance window(s) for notifications`);

    for (const window of windows) {
      const notifyConfig = (window.notifySubscribers as NotifySubscribersConfig) || {};
      const sentNotifications = (window.notificationsSent as NotificationsSent) || {};

      // Check beforeStart notification
      if (notifyConfig.beforeStart && !sentNotifications.beforeStartAt) {
        const beforeStartTime = new Date(
          new Date(window.startsAt).getTime() - notifyConfig.beforeStart * 60 * 1000
        );
        if (now >= beforeStartTime && now < window.startsAt) {
          await queueMaintenanceNotification(window, "beforeStart", now);
        }
      }

      // Check onStart notification
      if (notifyConfig.onStart && !sentNotifications.onStartAt) {
        if (now >= window.startsAt && now < window.endsAt) {
          await queueMaintenanceNotification(window, "onStart", now);
        }
      }

      // Check onEnd notification
      if (notifyConfig.onEnd && !sentNotifications.onEndAt) {
        if (now >= window.endsAt) {
          await queueMaintenanceNotification(window, "onEnd", now);
        }
      }
    }
  } catch (error) {
    console.error("[Maintenance] Error polling maintenance notifications:", error);
  }
}

// Queue notifications for a maintenance window
async function queueMaintenanceNotification(
  window: typeof maintenanceWindows.$inferSelect,
  notificationType: NotificationType,
  now: Date
) {
  const affectedMonitorIds = (window.affectedMonitors as string[]) || [];

  if (affectedMonitorIds.length === 0) {
    console.log(`[Maintenance] No affected monitors for window ${window.id}, skipping notification`);
    return;
  }

  // Find all status pages that have any of the affected monitors
  const statusPageLinks = await db
    .select({
      statusPageId: statusPageMonitors.statusPageId,
    })
    .from(statusPageMonitors)
    .where(inArray(statusPageMonitors.monitorId, affectedMonitorIds))
    .groupBy(statusPageMonitors.statusPageId);

  const statusPageIds = statusPageLinks.map((link) => link.statusPageId);

  if (statusPageIds.length === 0) {
    console.log(`[Maintenance] No status pages found for affected monitors, skipping notification`);
    // Still mark as sent to avoid re-checking
    await markNotificationSent(window.id, notificationType, now);
    return;
  }

  // Get status pages with their subscribers
  const pages = await db.query.statusPages.findMany({
    where: and(
      inArray(statusPages.id, statusPageIds),
      eq(statusPages.published, true)
    ),
    with: {
      subscribers: {
        where: eq(subscribers.verified, true),
      },
    },
  });

  let totalSubscribers = 0;

  for (const page of pages) {
    const verifiedSubscribers = page.subscribers.filter((s) => s.verified);

    if (verifiedSubscribers.length === 0) {
      continue;
    }

    totalSubscribers += verifiedSubscribers.length;

    // Determine notification subject and type
    const subjectPrefix = {
      beforeStart: "Upcoming Scheduled Maintenance",
      onStart: "Scheduled Maintenance Started",
      onEnd: "Scheduled Maintenance Completed",
    }[notificationType];

    // Queue a job for each subscriber
    for (const subscriber of verifiedSubscribers) {
      const channels = (subscriber.channels as { email?: boolean }) || { email: true };

      if (channels.email !== false) {
        await subscriberNotifyQueue.add(
          `maintenance-${window.id}-${subscriber.id}-${notificationType}`,
          {
            type: "maintenance",
            notificationType,
            maintenanceWindowId: window.id,
            maintenanceTitle: window.name,
            maintenanceDescription: window.description,
            startsAt: window.startsAt.toISOString(),
            endsAt: window.endsAt.toISOString(),
            subscriberId: subscriber.id,
            subscriberEmail: subscriber.email,
            unsubscribeToken: subscriber.unsubscribeToken,
            statusPageId: page.id,
            statusPageName: page.name,
            statusPageSlug: page.slug,
            subject: `${subjectPrefix}: ${window.name}`,
          },
          {
            jobId: `maint-${window.id}-${subscriber.id}-${notificationType}-${now.getTime()}`,
            removeOnComplete: 100,
            removeOnFail: 100,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          }
        );
      }
    }
  }

  console.log(
    `[Maintenance] Queued ${notificationType} notifications for window "${window.name}" to ${totalSubscribers} subscriber(s)`
  );

  // Mark this notification type as sent
  await markNotificationSent(window.id, notificationType, now);
}

// Mark a notification as sent in the database
async function markNotificationSent(
  windowId: string,
  notificationType: NotificationType,
  sentAt: Date
) {
  const window = await db.query.maintenanceWindows.findFirst({
    where: eq(maintenanceWindows.id, windowId),
  });

  if (!window) return;

  const currentSent = (window.notificationsSent as NotificationsSent) || {};
  const field = `${notificationType}At` as keyof NotificationsSent;

  const updatedSent: NotificationsSent = {
    ...currentSent,
    [field]: sentAt.toISOString(),
  };

  await db
    .update(maintenanceWindows)
    .set({
      notificationsSent: updatedSent,
      updatedAt: sentAt,
    })
    .where(eq(maintenanceWindows.id, windowId));
}

// Poll for SLO calculations
async function pollSloCalculations() {
  try {
    console.log("[SLO] Running scheduled SLO calculations");

    // Queue a job to calculate all SLOs
    await sloCalculateQueue.add(
      "calculate-all",
      {}, // Empty data means calculate all active SLOs
      {
        jobId: `slo-calc-${Date.now()}`,
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    );
  } catch (error) {
    console.error("[SLO] Error polling SLO calculations:", error);
  }
}

// Poll for probe health and mark offline probes
async function pollProbeHealth() {
  const now = new Date();
  const offlineThreshold = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes

  try {
    // Find active probes that haven't sent heartbeat recently
    const staleProbes = await db.query.probes.findMany({
      where: and(
        eq(probes.status, "active"),
        lt(probes.lastHeartbeatAt, offlineThreshold)
      ),
    });

    if (staleProbes.length > 0) {
      console.log(`[Probes] Marking ${staleProbes.length} probes as offline`);

      for (const probe of staleProbes) {
        await db
          .update(probes)
          .set({
            status: "offline",
            updatedAt: now,
          })
          .where(eq(probes.id, probe.id));

        console.log(`[Probes] Probe ${probe.name} (${probe.id}) marked offline`);
      }
    }
  } catch (error) {
    console.error("[Probes] Error polling probe health:", error);
  }
}

// Poll for scheduled reports (enterprise feature)
async function pollScheduledReports() {
  const now = new Date();

  try {
    // Enterprise feature - check if reportSettings schema is available
    type EnterpriseSchema = typeof import("@uni-status/enterprise/database/schema");
    let reportSettings: EnterpriseSchema["reportSettings"];
    try {
      const enterpriseSchema = await import("@uni-status/enterprise/database/schema");
      reportSettings = enterpriseSchema.reportSettings;
    } catch {
      // Enterprise package not available, skip scheduled reports
      return;
    }

    // Find report settings that are due to run (using select instead of query since schema is dynamic)
    const dueReports = await db
      .select()
      .from(reportSettings)
      .where(
        and(
          eq(reportSettings.active, true),
          lte(reportSettings.nextScheduledAt, now)
        )
      );

    if (dueReports.length === 0) {
      return;
    }

    console.log(`[Reports] Found ${dueReports.length} scheduled report(s) due`);

    for (const settings of dueReports) {
      // Calculate period based on frequency
      const { periodStart, periodEnd } = calculateReportPeriod(settings.frequency);

      // Queue report generation
      await reportGenerateQueue.add(
        `scheduled-${settings.id}`,
        {
          reportId: `scheduled-${settings.id}-${now.getTime()}`,
          organizationId: settings.organizationId,
          reportType: settings.reportType,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          includedMonitors: (settings.monitorIds as string[]) || [],
          includedStatusPages: (settings.statusPageIds as string[]) || [],
          settings: {
            includeCharts: settings.includeCharts ?? true,
            includeIncidents: settings.includeIncidents ?? true,
            includeMaintenanceWindows: settings.includeMaintenanceWindows ?? true,
            includeResponseTimes: settings.includeResponseTimes ?? true,
            includeSloStatus: settings.includeSloStatus ?? true,
            customBranding: (settings.customBranding as Record<string, unknown>) || {},
          },
        },
        {
          jobId: `report-${settings.id}-${now.getTime()}`,
          removeOnComplete: 10,
          removeOnFail: 10,
        }
      );

      // Update next scheduled time
      const nextScheduledAt = calculateNextScheduledTime(
        settings.frequency,
        settings.dayOfWeek,
        settings.dayOfMonth
      );

      await db
        .update(reportSettings)
        .set({
          lastGeneratedAt: now,
          nextScheduledAt,
          updatedAt: now,
        })
        .where(eq(reportSettings.id, settings.id));

      console.log(`[Reports] Queued report for settings ${settings.id}, next run: ${nextScheduledAt?.toISOString()}`);
    }
  } catch (error) {
    console.error("[Reports] Error polling scheduled reports:", error);
  }
}

// Calculate report period based on frequency
function calculateReportPeriod(frequency: string): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date = now;

  switch (frequency) {
    case "weekly":
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case "quarterly":
      periodStart = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case "annually":
      periodStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    default:
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days
  }

  return { periodStart, periodEnd };
}

// Calculate next scheduled time
function calculateNextScheduledTime(
  frequency: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date | null {
  if (frequency === "on_demand") {
    return null;
  }

  const now = new Date();
  let next = new Date(now);

  switch (frequency) {
    case "weekly":
      const targetDay = dayOfWeek ?? 1;
      const currentDay = next.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntilTarget);
      next.setHours(9, 0, 0, 0);
      break;
    case "monthly":
      const targetDate = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(targetDate, getDaysInMonth(next.getFullYear(), next.getMonth())));
      next.setHours(9, 0, 0, 0);
      break;
    case "quarterly":
      const quarter = Math.floor(next.getMonth() / 3);
      const nextQuarter = (quarter + 1) % 4;
      const nextYear = nextQuarter === 0 ? next.getFullYear() + 1 : next.getFullYear();
      next = new Date(nextYear, nextQuarter * 3, dayOfMonth ?? 1, 9, 0, 0, 0);
      break;
    case "annually":
      next = new Date(next.getFullYear() + 1, 0, dayOfMonth ?? 1, 9, 0, 0, 0);
      break;
  }

  return next;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

async function pollAggregation() {
  const now = new Date();

  try {
    // Get the previous complete hour
    const previousHour = new Date(now);
    previousHour.setMinutes(0, 0, 0);
    previousHour.setHours(previousHour.getHours() - 1);

    // Get all active monitors
    const allMonitors = await db.query.monitors.findMany({
      where: eq(monitors.paused, false),
    });

    if (allMonitors.length === 0) {
      return;
    }

    console.log(`[Aggregation] Queueing aggregation for ${allMonitors.length} monitors at ${previousHour.toISOString()}`);

    for (const monitor of allMonitors) {
      await aggregateQueue.add(
        `aggregate-${monitor.id}`,
        {
          monitorId: monitor.id,
          hour: previousHour.toISOString(),
        },
        {
          jobId: `agg-${monitor.id}-${previousHour.getTime()}`,
          removeOnComplete: 10,
          removeOnFail: 10,
        }
      );
    }

    console.log(`[Aggregation] Queued ${allMonitors.length} aggregation jobs`);
  } catch (error) {
    console.error("[Aggregation] Error polling aggregation:", error);
  }
}

async function pollDailyAggregation() {
  const now = new Date();

  try {
    // Get yesterday's date (the most recent complete day)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    // Get all active monitors
    const allMonitors = await db.query.monitors.findMany({
      where: eq(monitors.paused, false),
    });

    if (allMonitors.length === 0) {
      return;
    }

    console.log(`[Daily Aggregation] Queueing daily aggregation for ${allMonitors.length} monitors for ${dateStr}`);

    for (const monitor of allMonitors) {
      await dailyAggregateQueue.add(
        `daily-aggregate-${monitor.id}`,
        {
          monitorId: monitor.id,
          date: dateStr,
        },
        {
          jobId: `daily-agg-${monitor.id}-${dateStr}`,
          removeOnComplete: 10,
          removeOnFail: 10,
        }
      );
    }

    console.log(`[Daily Aggregation] Queued ${allMonitors.length} daily aggregation jobs`);
  } catch (error) {
    console.error("[Daily Aggregation] Error polling daily aggregation:", error);
  }
}

async function pollCertificateChecks() {
  const now = new Date();

  try {
    // Get all HTTPS monitors that are not paused
    const httpsMonitors = await db.query.monitors.findMany({
      where: and(
        eq(monitors.paused, false),
        inArray(monitors.type, ["https", "ssl"])
      ),
    });

    const eligibleMonitors = httpsMonitors.filter((monitor) => shouldQueueCertificateCheck(monitor));

    if (eligibleMonitors.length === 0) {
      return;
    }

    console.log(`[Certificates] Checking ${eligibleMonitors.length} HTTPS/SSL monitors for certificate updates`);

    for (const monitor of eligibleMonitors) {
      const sslConfig = (monitor.config as { ssl?: Record<string, unknown>; certificateTransparency?: Record<string, unknown> } | null)?.ssl || {};

      // Queue an SSL check job for this HTTPS monitor
      await sslQueue.add(
        `cert-check-${monitor.id}`,
        {
          monitorId: monitor.id,
          organizationId: monitor.organizationId,
          url: monitor.url,
          timeoutMs: monitor.timeoutMs || 30000,
          regions: monitor.regions || ["uk"],
          config: {
            ssl: {
              expiryWarningDays: (sslConfig as { expiryWarningDays?: number }).expiryWarningDays ?? 30,
              expiryErrorDays: (sslConfig as { expiryErrorDays?: number }).expiryErrorDays ?? 7,
              checkChain: (sslConfig as { checkChain?: boolean }).checkChain ?? true,
              checkHostname: (sslConfig as { checkHostname?: boolean }).checkHostname ?? true,
            },
          },
        },
        {
          jobId: `cert-${monitor.id}-${now.getTime()}`,
          removeOnComplete: 100,
          removeOnFail: 100,
        }
      );

      const ctConfig = (monitor.config as { certificateTransparency?: Record<string, unknown> } | null)?.certificateTransparency;
      const ctEnabled = ctConfig?.enabled !== false;

      if (ctEnabled) {
        await ctQueue.add(
          `ct-check-${monitor.id}`,
          {
            monitorId: monitor.id,
            organizationId: monitor.organizationId,
            url: monitor.url,
            config: {
              certificateTransparency: ctConfig,
            },
          },
          {
            jobId: `ct-${monitor.id}-${now.getTime()}`,
            removeOnComplete: 100,
            removeOnFail: 100,
          }
        );
      }
    }

    console.log(`[Certificates] Queued ${httpsMonitors.length} certificate check jobs`);
  } catch (error) {
    console.error("[Certificates] Error polling certificate checks:", error);
  }
}


export const scheduler = {
  start: () => {
    console.log("Starting schedulers...");

    // Monitor polling
    monitorIntervalId = setInterval(pollMonitors, POLL_INTERVAL);
    pollMonitors();

    // Maintenance notification polling
    maintenanceIntervalId = setInterval(pollMaintenanceNotifications, MAINTENANCE_POLL_INTERVAL);
    pollMaintenanceNotifications();

    // SLO calculation polling
    sloIntervalId = setInterval(pollSloCalculations, SLO_POLL_INTERVAL);
    // Delay initial SLO calculation to avoid startup burst
    setTimeout(pollSloCalculations, 30000);

    // Probe health polling
    probeHealthIntervalId = setInterval(pollProbeHealth, PROBE_HEALTH_INTERVAL);
    pollProbeHealth();

    // Scheduled reports polling
    reportScheduleIntervalId = setInterval(pollScheduledReports, REPORT_SCHEDULE_INTERVAL);
    pollScheduledReports();

    // Aggregation polling (hourly)
    aggregationIntervalId = setInterval(pollAggregation, AGGREGATION_POLL_INTERVAL);
    // Delay initial aggregation to avoid startup burst
    setTimeout(pollAggregation, 30000);

    // Daily aggregation polling
    dailyAggregationIntervalId = setInterval(pollDailyAggregation, DAILY_AGGREGATION_POLL_INTERVAL);
    // Run initial daily aggregation after startup settles
    setTimeout(pollDailyAggregation, 60000);

    // Certificate check polling for HTTPS monitors
    certCheckIntervalId = setInterval(pollCertificateChecks, CERT_CHECK_INTERVAL);
    // Run initial certificate check immediately
    pollCertificateChecks();

    console.log("Monitor scheduler started (10s interval)");
    console.log("Maintenance notification scheduler started (30s interval)");
    console.log("SLO calculation scheduler started (5m interval)");
    console.log("Probe health scheduler started (1m interval)");
    console.log("Report schedule scheduler started (1m interval)");
    console.log("Aggregation scheduler started (5m interval)");
    console.log("Daily aggregation scheduler started (1h interval)");
    console.log("Certificate check scheduler started (24h interval)");
  },

  stop: () => {
    if (monitorIntervalId) {
      clearInterval(monitorIntervalId);
      monitorIntervalId = null;
    }
    if (maintenanceIntervalId) {
      clearInterval(maintenanceIntervalId);
      maintenanceIntervalId = null;
    }
    if (sloIntervalId) {
      clearInterval(sloIntervalId);
      sloIntervalId = null;
    }
    if (probeHealthIntervalId) {
      clearInterval(probeHealthIntervalId);
      probeHealthIntervalId = null;
    }
    if (reportScheduleIntervalId) {
      clearInterval(reportScheduleIntervalId);
      reportScheduleIntervalId = null;
    }
    if (aggregationIntervalId) {
      clearInterval(aggregationIntervalId);
      aggregationIntervalId = null;
    }
    if (dailyAggregationIntervalId) {
      clearInterval(dailyAggregationIntervalId);
      dailyAggregationIntervalId = null;
    }
    if (certCheckIntervalId) {
      clearInterval(certCheckIntervalId);
      certCheckIntervalId = null;
    }
    console.log("All schedulers stopped");
  },
};
