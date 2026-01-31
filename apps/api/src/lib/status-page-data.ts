import { db } from "@uni-status/database";
import {
  checkResults,
  crowdsourcedReports,
  crowdsourcedSettings,
  heartbeatPings,
  incidentUpdates,
  incidents,
  monitors,
  organizations,
  statusPageMonitors,
  statusPages,
  checkResultsHourly,
  checkResultsDaily,
} from "@uni-status/database/schema";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import type { StatusPage, Organization } from "@uni-status/database/schema";

export interface PublicStatusPagePayload {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  favicon: string | null;
  orgLogo?: string | null;
  theme: {
    name: string;
    useCustomTheme?: boolean;
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    customCss?: string;
    colorMode?: "system" | "light" | "dark";
  };
  settings: StatusPage["settings"] & {
    showUptimePercentage: boolean;
    showResponseTime: boolean;
    showIncidentHistory: boolean;
    showServicesPage: boolean;
    showGeoMap: boolean;
    uptimeDays: number;
    hideBranding: boolean;
    defaultTimezone?: string;
    displayMode?: "bars" | "graph" | "both";
    graphTooltipMetrics?: {
      avg?: boolean;
      min?: boolean;
      max?: boolean;
      p50?: boolean;
      p90?: boolean;
      p99?: boolean;
    };
  };
  template?: StatusPage["template"];
  seo: StatusPage["seo"];
  monitors: Array<{
    id: string;
    name: string;
    description?: string;
    type: typeof monitors.$inferSelect.type;
    group?: string | null;
    order: number;
    status: typeof monitors.$inferSelect.status;
    regions?: string[];
    uptimePercentage: number | null;
    responseTimeMs: number | null;
    uptimeData: Array<{
      date: string;
      timestamp?: string;
      uptimePercentage: number | null;
      status: "success" | "degraded" | "down" | "unknown";
      successCount: number;
      degradedCount: number;
      failureCount: number;
      totalCount: number;
      incidents?: Array<{ id: string; title: string; severity: "minor" | "major" | "critical" }>;
    }>;
    uptimeGranularity: "minute" | "hour" | "day";
    responseTimeData?: Array<{
      timestamp: string;
      avg: number | null;
      min: number | null;
      max: number | null;
      p50: number | null;
      p90: number | null;
      p99: number | null;
      status?: "success" | "degraded" | "down" | "incident";
    }>;
    certificateInfo?: {
      issuer?: string;
      subject?: string;
      validFrom?: string;
      validTo?: string;
      daysUntilExpiry?: number;
    };
    emailAuthInfo?: {
      overallScore: number;
      spfStatus: "pass" | "fail" | "none" | "error";
      dkimStatus: "pass" | "partial" | "fail" | "none" | "error";
      dmarcStatus: "pass" | "fail" | "none" | "error";
    };
    heartbeatInfo?: {
      lastPingAt: string | null;
      expectedIntervalSeconds: number;
      missedBeats: number;
    };
  }>;
  activeIncidents: Array<{
    id: string;
    title: string;
    status: string;
    severity: "minor" | "major" | "critical";
    message?: string;
    affectedMonitors: string[];
    startedAt: string;
    updates: Array<{
      id: string;
      status: string;
      message: string;
      createdAt: string;
    }>;
  }>;
  recentIncidents: Array<{
    id: string;
    title: string;
    status: string;
    severity: "minor" | "major" | "critical";
    message?: string;
    affectedMonitors: string[];
    startedAt: string;
    resolvedAt?: string;
    updates: Array<{
      id: string;
      status: string;
      message: string;
      createdAt: string;
    }>;
  }>;
  crowdsourced: {
    enabled: boolean;
    threshold?: number;
    reportCounts?: Record<string, number>;
  };
  lastUpdatedAt: string;
}

export async function findStatusPageBySlug(slug: string): Promise<{
  page: StatusPage;
  organization: Organization | null;
} | null> {
  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page) return null;

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, page.organizationId),
  });

  return { page, organization: organization ?? null };
}

export async function buildPublicStatusPagePayload(params: {
  page: StatusPage;
  organization?: Organization | null;
}): Promise<PublicStatusPagePayload> {
  const { page } = params;
  const organization =
    params.organization ??
    (await db.query.organizations.findFirst({
      where: eq(organizations.id, page.organizationId),
    })) ??
    null;

  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
    orderBy: [statusPageMonitors.order],
    with: {
      monitor: true,
    },
  });

  const uptimeDays = page.settings?.uptimeDays ?? 45;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - uptimeDays);

  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  // Adaptive granularity uptime data fetching
  // Try daily -> hourly -> minute until we have enough intervals to fill the requested segments
  type UptimeIntervalData = {
    monitorId: string;
    timestamp: Date;
    successCount: number;
    degradedCount: number;
    failureCount: number;
    totalCount: number;
    uptimePercentage: number | null;
  };

  let uptimeIntervals: UptimeIntervalData[] = [];
  let uptimeGranularity: "minute" | "hour" | "day" = "day";

  if (monitorIds.length > 0) {
    // Try daily aggregates first
    const dailyAggregates = await db.query.checkResultsDaily.findMany({
      where: and(
        inArray(checkResultsDaily.monitorId, monitorIds),
        gte(checkResultsDaily.date, startDate)
      ),
      orderBy: [desc(checkResultsDaily.date)],
    });

    // Count unique days with data
    const uniqueDays = new Set(dailyAggregates.map((d) => d.date.toISOString().split("T")[0])).size;

    if (uniqueDays >= uptimeDays / 3) {
      // Use daily data
      uptimeGranularity = "day";
      uptimeIntervals = dailyAggregates.map((day) => ({
        monitorId: day.monitorId,
        timestamp: day.date,
        successCount: Number(day.successCount || 0),
        degradedCount: Number(day.degradedCount || 0),
        failureCount: Number(day.failureCount || 0),
        totalCount: Number(day.totalCount || 0),
        uptimePercentage: day.uptimePercentage,
      }));
    } else {
      // Try hourly data
      const hourlyAggregates = await db.query.checkResultsHourly.findMany({
        where: and(
          inArray(checkResultsHourly.monitorId, monitorIds),
          gte(checkResultsHourly.hour, startDate)
        ),
        orderBy: [desc(checkResultsHourly.hour)],
      });

      if (hourlyAggregates.length >= uptimeDays) {
        // Use hourly data
        uptimeGranularity = "hour";
        uptimeIntervals = hourlyAggregates.map((hour) => ({
          monitorId: hour.monitorId,
          timestamp: hour.hour,
          successCount: Number(hour.successCount || 0),
          degradedCount: Number(hour.degradedCount || 0),
          failureCount: Number(hour.failureCount || 0),
          totalCount: Number(hour.totalCount || 0),
          uptimePercentage: hour.uptimePercentage,
        }));
      } else {
        // Try minute-level data from raw check results
        const minuteResults = await db
          .select({
            monitorId: checkResults.monitorId,
            minute: sql<Date>`DATE_TRUNC('minute', ${checkResults.createdAt})`.as("minute"),
            successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
            failureCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} IN ('failure', 'timeout', 'error'))`.as("failure_count"),
            degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
            totalCount: sql<number>`COUNT(*)`.as("total_count"),
          })
          .from(checkResults)
          .where(
            and(
              inArray(checkResults.monitorId, monitorIds),
              gte(checkResults.createdAt, startDate)
            )
          )
          .groupBy(checkResults.monitorId, sql`DATE_TRUNC('minute', ${checkResults.createdAt})`)
          .orderBy(sql`DATE_TRUNC('minute', ${checkResults.createdAt}) DESC`);

        if (minuteResults.length >= uptimeDays) {
          // Use minute data
          uptimeGranularity = "minute";
          uptimeIntervals = minuteResults.map((row) => {
            const success = Number(row.successCount) || 0;
            const failure = Number(row.failureCount) || 0;
            const degraded = Number(row.degradedCount) || 0;
            const total = Number(row.totalCount) || 0;
            return {
              monitorId: row.monitorId,
              timestamp: new Date(row.minute),
              successCount: success,
              degradedCount: degraded,
              failureCount: failure,
              totalCount: total,
              uptimePercentage: total > 0 ? ((success + degraded) / total) * 100 : null,
            };
          });
        } else if (hourlyAggregates.length > 0) {
          // Fall back to hourly if we have any
          uptimeGranularity = "hour";
          uptimeIntervals = hourlyAggregates.map((hour) => ({
            monitorId: hour.monitorId,
            timestamp: hour.hour,
            successCount: Number(hour.successCount || 0),
            degradedCount: Number(hour.degradedCount || 0),
            failureCount: Number(hour.failureCount || 0),
            totalCount: Number(hour.totalCount || 0),
            uptimePercentage: hour.uptimePercentage,
          }));
        } else if (minuteResults.length > 0) {
          // Use whatever minute data we have
          uptimeGranularity = "minute";
          uptimeIntervals = minuteResults.map((row) => {
            const success = Number(row.successCount) || 0;
            const failure = Number(row.failureCount) || 0;
            const degraded = Number(row.degradedCount) || 0;
            const total = Number(row.totalCount) || 0;
            return {
              monitorId: row.monitorId,
              timestamp: new Date(row.minute),
              successCount: success,
              degradedCount: degraded,
              failureCount: failure,
              totalCount: total,
              uptimePercentage: total > 0 ? ((success + degraded) / total) * 100 : null,
            };
          });
        } else {
          // No data at all, stay with daily granularity
          uptimeGranularity = "day";
          uptimeIntervals = dailyAggregates.map((day) => ({
            monitorId: day.monitorId,
            timestamp: day.date,
            successCount: Number(day.successCount || 0),
            degradedCount: Number(day.degradedCount || 0),
            failureCount: Number(day.failureCount || 0),
            totalCount: Number(day.totalCount || 0),
            uptimePercentage: day.uptimePercentage,
          }));
        }
      }
    }

    // Supplement aggregated data with recent raw check results for the current interval
    // This ensures that recent failures show up immediately even before aggregation runs
    if (uptimeIntervals.length > 0 && monitorIds.length > 0) {
      const now = new Date();
      let currentIntervalStart: Date;
      let currentIntervalEnd: Date;

      if (uptimeGranularity === "day") {
        currentIntervalStart = new Date(now);
        currentIntervalStart.setHours(0, 0, 0, 0);
        currentIntervalEnd = new Date(now);
        currentIntervalEnd.setHours(23, 59, 59, 999);
      } else if (uptimeGranularity === "hour") {
        currentIntervalStart = new Date(now);
        currentIntervalStart.setMinutes(0, 0, 0);
        currentIntervalEnd = new Date(now);
        currentIntervalEnd.setMinutes(59, 59, 999);
      } else {
        currentIntervalStart = new Date(now);
        currentIntervalStart.setSeconds(0, 0);
        currentIntervalEnd = new Date(now);
        currentIntervalEnd.setSeconds(59, 999);
      }

      // Fetch raw check results for the current interval
      const recentResults = await db
        .select({
          monitorId: checkResults.monitorId,
          successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
          failureCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} IN ('failure', 'timeout', 'error'))`.as("failure_count"),
          degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
          totalCount: sql<number>`COUNT(*)`.as("total_count"),
        })
        .from(checkResults)
        .where(
          and(
            inArray(checkResults.monitorId, monitorIds),
            gte(checkResults.createdAt, currentIntervalStart)
          )
        )
        .groupBy(checkResults.monitorId);

      // Update or add the current interval data for each monitor
      for (const result of recentResults) {
        const success = Number(result.successCount) || 0;
        const failure = Number(result.failureCount) || 0;
        const degraded = Number(result.degradedCount) || 0;
        const total = Number(result.totalCount) || 0;

        if (total > 0) {
          // Check if we already have an interval for the current period
          const currentIntervalKey = currentIntervalStart.toISOString();
          const existingCurrentIndex = uptimeIntervals.findIndex(
            (i) =>
              i.monitorId === result.monitorId &&
              i.timestamp.toISOString() === currentIntervalKey
          );

          const newInterval: typeof uptimeIntervals[0] = {
            monitorId: result.monitorId,
            timestamp: currentIntervalStart,
            successCount: success,
            degradedCount: degraded,
            failureCount: failure,
            totalCount: total,
            uptimePercentage: total > 0 ? ((success + degraded) / total) * 100 : null,
          };

          if (existingCurrentIndex >= 0) {
            // Update existing interval with merged data (prefer raw data for recency)
            const existing = uptimeIntervals[existingCurrentIndex];
            if (!existing) {
              uptimeIntervals.push(newInterval);
              continue;
            }
            uptimeIntervals[existingCurrentIndex] = {
              ...existing,
              successCount: Math.max(existing.successCount, success),
              degradedCount: Math.max(existing.degradedCount, degraded),
              failureCount: Math.max(existing.failureCount, failure),
              totalCount: Math.max(existing.totalCount, total),
              uptimePercentage:
                total > 0 ? ((success + degraded) / total) * 100 : existing.uptimePercentage,
            };
          } else {
            // Add new interval for current period
            uptimeIntervals.push(newInterval);
          }
        }
      }
    }
  }

  const allIncidents = monitorIds.length
    ? await db.query.incidents.findMany({
        where: and(eq(incidents.organizationId, page.organizationId), gte(incidents.startedAt, startDate)),
        orderBy: [desc(incidents.startedAt)],
      })
    : [];

  const incidentsByMonitor = new Map<
    string,
    Array<{
      id: string;
      title: string;
      severity: "minor" | "major" | "critical";
      startedAt: Date;
      resolvedAt: Date | null;
    }>
  >();

  for (const incident of allIncidents) {
    const affectedMonitors = incident.affectedMonitors || [];
    for (const monitorId of affectedMonitors) {
      if (monitorIds.includes(monitorId as string)) {
        const list = incidentsByMonitor.get(monitorId as string) || [];
        list.push({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          startedAt: incident.startedAt,
          resolvedAt: incident.resolvedAt,
        });
        incidentsByMonitor.set(monitorId as string, list);
      }
    }
  }

  // Get incidents for a specific timestamp based on granularity
  const getIncidentsForTimestamp = (monitorId: string, timestamp: Date) => {
    const monitorIncidents = incidentsByMonitor.get(monitorId) || [];

    let intervalStart: Date;
    let intervalEnd: Date;

    if (uptimeGranularity === "day") {
      intervalStart = new Date(timestamp);
      intervalStart.setHours(0, 0, 0, 0);
      intervalEnd = new Date(timestamp);
      intervalEnd.setHours(23, 59, 59, 999);
    } else if (uptimeGranularity === "hour") {
      intervalStart = new Date(timestamp);
      intervalStart.setMinutes(0, 0, 0);
      intervalEnd = new Date(timestamp);
      intervalEnd.setMinutes(59, 59, 999);
    } else {
      // minute
      intervalStart = new Date(timestamp);
      intervalStart.setSeconds(0, 0);
      intervalEnd = new Date(timestamp);
      intervalEnd.setSeconds(59, 999);
    }

    return monitorIncidents
      .filter((inc) => {
        const incStart = inc.startedAt;
        const incEnd = inc.resolvedAt || new Date();
        return incStart <= intervalEnd && incEnd >= intervalStart;
      })
      .map((inc) => ({
        id: inc.id,
        title: inc.title,
        severity: inc.severity,
      }));
  };

  const uptimeByMonitor = new Map<
    string,
    Array<{
      date: string;
      timestamp: string;
      uptimePercentage: number | null;
      status: "success" | "degraded" | "down" | "unknown";
      successCount: number;
      degradedCount: number;
      failureCount: number;
      totalCount: number;
      incidents?: Array<{ id: string; title: string; severity: "minor" | "major" | "critical" }>;
    }>
  >();

  for (const row of uptimeIntervals) {
    const monitorData = uptimeByMonitor.get(row.monitorId) || [];

    let status: "success" | "degraded" | "down" | "unknown" = "unknown";
    if (row.totalCount > 0) {
      if (row.failureCount > 0) status = "down";
      else if (row.degradedCount > 0) status = "degraded";
      else status = "success";
    }

    const intervalIncidents = getIncidentsForTimestamp(row.monitorId, row.timestamp);

    monitorData.push({
      date: row.timestamp.toISOString().slice(0, 10),
      timestamp: row.timestamp.toISOString(),
      uptimePercentage: row.uptimePercentage,
      status,
      successCount: row.successCount,
      degradedCount: row.degradedCount,
      failureCount: row.failureCount,
      totalCount: row.totalCount,
      incidents: intervalIncidents.length > 0 ? intervalIncidents : undefined,
    });
    uptimeByMonitor.set(row.monitorId, monitorData);
  }

  const responseTimeData = monitorIds.length
    ? await db
        .select({
          monitorId: checkResults.monitorId,
          avgResponseTime: sql<number>`AVG(${checkResults.responseTimeMs})`.as(
            "avg_response_time"
          ),
        })
        .from(checkResults)
        .where(
          and(
            inArray(checkResults.monitorId, monitorIds),
            gte(checkResults.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
          )
        )
        .groupBy(checkResults.monitorId)
    : [];

  const responseTimeByMonitor = new Map(
    responseTimeData.map((r) => [r.monitorId, r.avgResponseTime])
  );

  const overallUptimeByMonitor = new Map<string, number | null>();
  const uptimeTotals = new Map<
    string,
    { successCount: number; degradedCount: number; totalCount: number }
  >();

  for (const row of uptimeIntervals) {
    const current = uptimeTotals.get(row.monitorId);
    if (!current) {
      uptimeTotals.set(row.monitorId, {
        successCount: row.successCount,
        degradedCount: row.degradedCount,
        totalCount: row.totalCount,
      });
    } else {
      uptimeTotals.set(row.monitorId, {
        successCount: current.successCount + row.successCount,
        degradedCount: current.degradedCount + row.degradedCount,
        totalCount: current.totalCount + row.totalCount,
      });
    }
  }

  for (const [monitorId, totals] of uptimeTotals.entries()) {
    overallUptimeByMonitor.set(
      monitorId,
      totals.totalCount > 0
        ? ((totals.successCount + totals.degradedCount) / totals.totalCount) * 100
        : null
    );
  }

  const sslMonitorIds = linkedMonitors
    .filter((lm) => lm.monitor.type === "ssl" || lm.monitor.type === "https")
    .map((lm) => lm.monitorId);

  const certificateInfoByMonitor = new Map<
    string,
    {
      issuer?: string;
      subject?: string;
      validFrom?: string;
      validTo?: string;
      daysUntilExpiry?: number;
    }
  >();

  if (sslMonitorIds.length > 0) {
    for (const monitorId of sslMonitorIds) {
      const latestResult = await db.query.checkResults.findFirst({
        where: and(
          eq(checkResults.monitorId, monitorId),
          sql`${checkResults.certificateInfo} IS NOT NULL`
        ),
        orderBy: [desc(checkResults.createdAt)],
      });
      if (latestResult?.certificateInfo) {
        certificateInfoByMonitor.set(monitorId, latestResult.certificateInfo);
      }
    }
  }

  const emailAuthMonitorIds = linkedMonitors
    .filter((lm) => lm.monitor.type === "email_auth")
    .map((lm) => lm.monitorId);

  const emailAuthInfoByMonitor = new Map<
    string,
    {
      overallScore: number;
      spfStatus: "pass" | "fail" | "none" | "error";
      dkimStatus: "pass" | "partial" | "fail" | "none" | "error";
      dmarcStatus: "pass" | "fail" | "none" | "error";
    }
  >();

  if (emailAuthMonitorIds.length > 0) {
    for (const monitorId of emailAuthMonitorIds) {
      const latestResult = await db.query.checkResults.findFirst({
        where: and(
          eq(checkResults.monitorId, monitorId),
          sql`${checkResults.emailAuthDetails} IS NOT NULL`
        ),
        orderBy: [desc(checkResults.createdAt)],
      });
      if (latestResult?.emailAuthDetails) {
        const details = latestResult.emailAuthDetails as {
          overallScore?: number;
          spf?: { status?: string };
          dkim?: { status?: string };
          dmarc?: { status?: string };
        };
        emailAuthInfoByMonitor.set(monitorId, {
          overallScore: details.overallScore ?? 0,
          spfStatus: (details.spf?.status || "none") as "pass" | "fail" | "none" | "error",
          dkimStatus: (details.dkim?.status || "none") as "pass" | "partial" | "fail" | "none" | "error",
          dmarcStatus: (details.dmarc?.status || "none") as "pass" | "fail" | "none" | "error",
        });
      }
    }
  }

  const heartbeatMonitorIds = linkedMonitors
    .filter((lm) => lm.monitor.type === "heartbeat")
    .map((lm) => lm.monitorId);

  const heartbeatInfoByMonitor = new Map<
    string,
    {
      lastPingAt: string | null;
      expectedIntervalSeconds: number;
      missedBeats: number;
    }
  >();

  if (heartbeatMonitorIds.length > 0) {
    for (const monitorId of heartbeatMonitorIds) {
      const latestPing = await db.query.heartbeatPings.findFirst({
        where: eq(heartbeatPings.monitorId, monitorId),
        orderBy: [desc(heartbeatPings.createdAt)],
      });

      const monitorData = linkedMonitors.find((lm) => lm.monitorId === monitorId)?.monitor;
      const heartbeatConfig = monitorData?.config as
        | { heartbeat?: { expectedIntervalSeconds?: number } }
        | null;
      const expectedInterval = heartbeatConfig?.heartbeat?.expectedIntervalSeconds ?? 60;

      const missedBeats =
        latestPing && monitorData?.lastCheckedAt
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(latestPing.createdAt).getTime()) /
                  (expectedInterval * 1000)
              ) - 1
            )
          : 0;

      heartbeatInfoByMonitor.set(monitorId, {
        lastPingAt: latestPing?.createdAt.toISOString() || null,
        expectedIntervalSeconds: expectedInterval,
        missedBeats,
      });
    }
  }

  // Fetch response time chart data if graph display mode is enabled
  const displayMode = page.settings?.displayMode ?? "bars";
  const responseTimeChartDataByMonitor = new Map<
    string,
    Array<{
      timestamp: string;
      avg: number | null;
      min: number | null;
      max: number | null;
      p50: number | null;
      p90: number | null;
      p99: number | null;
      status?: "success" | "degraded" | "down" | "incident";
    }>
  >();

  if ((displayMode === "graph" || displayMode === "both") && monitorIds.length > 0) {
    // Helper functions for percentile calculation
    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      const boundedIndex = Math.max(0, Math.min(index, sorted.length - 1));
      return sorted[boundedIndex] ?? null;
    };

    const average = (arr: number[]): number | null =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    // Fetch response time data for charts (last uptimeDays in hours)
    const hoursToFetch = Math.min(uptimeDays * 24, 720); // Max 30 days of data
    const chartStartDate = new Date();
    chartStartDate.setHours(chartStartDate.getHours() - hoursToFetch);

    // Determine bucket size based on time range to maximize data points
    // <= 6 hours: 5-minute buckets (~72 points)
    // 6-24 hours: 15-minute buckets (~96 points)
    // 24-72 hours: 30-minute buckets (~144 points)
    // 72-168 hours: hourly buckets (~168 points)
    // > 168 hours: 4-hour buckets
    const bucketMinutes =
      hoursToFetch <= 6 ? 5 :
      hoursToFetch <= 24 ? 15 :
      hoursToFetch <= 72 ? 30 :
      hoursToFetch <= 168 ? 60 :
      240;

    for (const monitorId of monitorIds) {
      const rawResults = await db.query.checkResults.findMany({
        where: and(
          eq(checkResults.monitorId, monitorId),
          gte(checkResults.createdAt, chartStartDate)
        ),
        orderBy: [checkResults.createdAt],
      });

      if (rawResults.length === 0) continue;

      // If we have fewer data points than typical bucket count, use raw data
      const expectedBuckets = (hoursToFetch * 60) / bucketMinutes;
      if (rawResults.length <= expectedBuckets * 0.8) {
        // Use raw data points for sparse data
        responseTimeChartDataByMonitor.set(
          monitorId,
          rawResults
            .filter((r) => r.responseTimeMs != null)
            .map((r) => ({
              timestamp: r.createdAt.toISOString(),
              avg: r.responseTimeMs!,
              min: r.responseTimeMs!,
              max: r.responseTimeMs!,
              p50: r.responseTimeMs!,
              p90: r.responseTimeMs!,
              p99: r.responseTimeMs!,
              status: r.status === "success" ? "success" : r.status === "degraded" ? "degraded" : "down",
            }))
        );
      } else {
        // Aggregate into time buckets based on calculated bucket size
        const bucketMap = new Map<string, { responseTimes: number[]; status: string }>();

        for (const result of rawResults) {
          const resultDate = new Date(result.createdAt);

          // Calculate bucket boundary
          let bucketDate: Date;
          if (bucketMinutes < 60) {
            // Sub-hour buckets - round to nearest bucket within the hour
            const minutes = resultDate.getUTCMinutes();
            const bucketMinute = Math.floor(minutes / bucketMinutes) * bucketMinutes;
            bucketDate = new Date(resultDate);
            bucketDate.setUTCMinutes(bucketMinute, 0, 0);
          } else {
            // Hour or multi-hour buckets
            const bucketHours = bucketMinutes / 60;
            const bucketHour = Math.floor(resultDate.getUTCHours() / bucketHours) * bucketHours;
            bucketDate = new Date(resultDate);
            bucketDate.setUTCHours(bucketHour, 0, 0, 0);
          }

          const bucketKey = bucketDate.toISOString();

          const existing = bucketMap.get(bucketKey) || { responseTimes: [], status: "success" };

          if (result.responseTimeMs != null) {
            existing.responseTimes.push(result.responseTimeMs);
          }
          // Track worst status in bucket
          if (result.status === "failure" || result.status === "timeout" || result.status === "error") {
            existing.status = "down";
          } else if (result.status === "degraded" && existing.status !== "down") {
            existing.status = "degraded";
          }

          bucketMap.set(bucketKey, existing);
        }

        const chartData = Array.from(bucketMap.entries())
          .filter(([, data]) => data.responseTimes.length > 0)
          .map(([bucketKey, data]) => ({
            timestamp: bucketKey,
            avg: average(data.responseTimes),
            min: Math.min(...data.responseTimes),
            max: Math.max(...data.responseTimes),
            p50: percentile(data.responseTimes, 50),
            p90: percentile(data.responseTimes, 90),
            p99: percentile(data.responseTimes, 99),
            status: data.status as "success" | "degraded" | "down",
          }))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        responseTimeChartDataByMonitor.set(monitorId, chartData);
      }
    }
  }

  const publicMonitorsBase = linkedMonitors.map((lm) => ({
    id: lm.monitorId,
    name: lm.displayName || lm.monitor.name,
    description: lm.description ?? lm.monitor.description ?? undefined,
    type: lm.monitor.type,
    group: lm.group,
    order: lm.order,
    status: lm.monitor.status,
    regions: lm.monitor.regions || [],
    uptimePercentage: (overallUptimeByMonitor.get(lm.monitorId) as number | null) ?? null,
    responseTimeMs: responseTimeByMonitor.get(lm.monitorId) ?? null,
    uptimeData: uptimeByMonitor.get(lm.monitorId) || [],
    uptimeGranularity,
    responseTimeData: responseTimeChartDataByMonitor.get(lm.monitorId) || undefined,
    certificateInfo: certificateInfoByMonitor.get(lm.monitorId) || undefined,
    emailAuthInfo: emailAuthInfoByMonitor.get(lm.monitorId) || undefined,
    heartbeatInfo: heartbeatInfoByMonitor.get(lm.monitorId) || undefined,
  }));
  const publicMonitors = publicMonitorsBase;

  const activeIncidents = await db.query.incidents.findMany({
    where: and(eq(incidents.organizationId, page.organizationId), ne(incidents.status, "resolved")),
    orderBy: [desc(incidents.severity), desc(incidents.startedAt)],
    with: {
      updates: {
        orderBy: [desc(incidentUpdates.createdAt)],
      },
    },
  });

  const filteredActiveIncidents = activeIncidents
    .filter((incident) => {
      const affectedMonitors = incident.affectedMonitors || [];
      return affectedMonitors.some((mid: string) => monitorIds.includes(mid));
    })
    .map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      message: incident.message ?? undefined,
      affectedMonitors: (incident.affectedMonitors || []).filter((mid: string) =>
        monitorIds.includes(mid)
      ),
      startedAt: incident.startedAt.toISOString(),
      updates: incident.updates.map((u) => ({
        id: u.id,
        status: u.status,
        message: u.message,
        createdAt: u.createdAt.toISOString(),
      })),
    }));

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentIncidents =
    page.settings?.showIncidentHistory !== false
      ? await db.query.incidents.findMany({
          where: and(
            eq(incidents.organizationId, page.organizationId),
            eq(incidents.status, "resolved"),
            gte(incidents.resolvedAt, fourteenDaysAgo)
          ),
          orderBy: [desc(incidents.resolvedAt)],
          limit: 10,
          with: {
            updates: {
              orderBy: [desc(incidentUpdates.createdAt)],
            },
          },
        })
      : [];

  const filteredRecentIncidents = recentIncidents
    .filter((incident) => {
      const affectedMonitors = incident.affectedMonitors || [];
      return affectedMonitors.some((mid: string) => monitorIds.includes(mid));
    })
    .map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      message: incident.message ?? undefined,
      affectedMonitors: (incident.affectedMonitors || []).filter((mid: string) =>
        monitorIds.includes(mid)
      ),
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString(),
      updates: incident.updates.map((u) => ({
        id: u.id,
        status: u.status,
        message: u.message,
        createdAt: u.createdAt.toISOString(),
      })),
    }));

  const crowdsourcedSettingsData = await db.query.crowdsourcedSettings.findFirst({
    where: eq(crowdsourcedSettings.statusPageId, page.id),
  });

  let reportCounts: Record<string, number> = {};
  if (crowdsourcedSettingsData?.enabled && monitorIds.length > 0) {
    const now = new Date();
    const counts = await db
      .select({
        monitorId: crowdsourcedReports.monitorId,
        count: sql<number>`count(*)::int`,
      })
      .from(crowdsourcedReports)
      .where(
        and(eq(crowdsourcedReports.statusPageId, page.id), gte(crowdsourcedReports.expiresAt, now))
      )
      .groupBy(crowdsourcedReports.monitorId);

    for (const row of counts) {
      reportCounts[row.monitorId] = row.count;
    }
  }

  const localization = page.settings?.localization || {
    defaultLocale: "en",
    supportedLocales: ["en", "es", "fr", "ar"],
    rtlLocales: ["ar"],
    translations: {},
  };

  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    logo: page.logo,
    favicon: page.favicon,
    orgLogo: organization?.logo ?? null,
    theme: page.theme ?? { name: "default" },
    settings: {
      showUptimePercentage: page.settings?.showUptimePercentage ?? true,
      showResponseTime: page.settings?.showResponseTime ?? true,
      showIncidentHistory: page.settings?.showIncidentHistory ?? true,
      showServicesPage: page.settings?.showServicesPage ?? false,
      showGeoMap: page.settings?.showGeoMap ?? true,
      uptimeDays: page.settings?.uptimeDays ?? 45,
      headerText: page.settings?.headerText,
      footerText: page.settings?.footerText,
      supportUrl: page.settings?.supportUrl,
      hideBranding: page.settings?.hideBranding ?? false,
      defaultTimezone: page.settings?.defaultTimezone ?? "local",
      localization,
      displayMode: page.settings?.displayMode ?? "bars",
      graphTooltipMetrics: page.settings?.graphTooltipMetrics ?? {
        avg: true,
        min: false,
        max: false,
        p50: false,
        p90: false,
        p99: false,
      },
    },
    template: page.template ?? null,
    seo: {
      title: page.seo?.title,
      description: page.seo?.description,
      ogImage: page.seo?.ogImage,
    },
    monitors: publicMonitors,
    activeIncidents: filteredActiveIncidents,
    recentIncidents: filteredRecentIncidents,
    crowdsourced: crowdsourcedSettingsData?.enabled
      ? {
          enabled: true,
          threshold: crowdsourcedSettingsData.reportThreshold,
          reportCounts,
        }
      : { enabled: false },
    lastUpdatedAt: page.updatedAt.toISOString(),
  };
}
