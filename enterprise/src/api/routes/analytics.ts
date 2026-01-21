import { OpenAPIHono } from "@hono/zod-openapi";
import { monitors, checkResults, checkResultsHourly, checkResultsDaily, incidents } from "@uni-status/database/schema";
import { enterpriseDb as db } from "../../database";
import { requireOrganization } from "../middleware/auth";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";

export const analyticsRoutes = new OpenAPIHono();

// Uptime statistics with configurable or adaptive granularity
analyticsRoutes.get("/uptime", async (c) => {
  const organizationId = await requireOrganization(c);
  const monitorId = c.req.query("monitorId");
  const days = parseInt(c.req.query("days") || "30");
  const requestedGranularity = c.req.query("granularity") as "minute" | "hour" | "day" | "auto" | undefined;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Define interval data structure
  type IntervalData = {
    timestamp: Date;
    successCount: number;
    degradedCount: number;
    failureCount: number;
    totalCount: number;
    uptimePercentage: number | null;
  };

  let intervals: IntervalData[] = [];
  let granularity: "minute" | "hour" | "day" = "day";

  // If a specific granularity is requested (not "auto"), try to honor it
  const forceGranularity = requestedGranularity && requestedGranularity !== "auto" ? requestedGranularity : null;

  // Try daily aggregates first
  const dailyAggregates = await db.query.checkResultsDaily.findMany({
    where: monitorId
      ? and(
          eq(checkResultsDaily.monitorId, monitorId),
          gte(checkResultsDaily.date, startDate)
        )
      : gte(checkResultsDaily.date, startDate),
    orderBy: [desc(checkResultsDaily.date)],
  });

  const daysWithDailyData = dailyAggregates.length;

  // If force granularity is "day", use daily data
  // Else if adaptive: if we have less than 1/3 of requested days, try finer granularity
  if (forceGranularity === "day" || (!forceGranularity && daysWithDailyData >= days / 3)) {
    // Use daily data
    granularity = "day";
    intervals = dailyAggregates.map((day) => ({
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
      where: monitorId
        ? and(
            eq(checkResultsHourly.monitorId, monitorId),
            gte(checkResultsHourly.hour, startDate)
          )
        : gte(checkResultsHourly.hour, startDate),
      orderBy: [desc(checkResultsHourly.hour)],
    });

    // If force granularity is "hour", use hourly data
    // Else if adaptive: if we have enough hourly intervals, use hourly
    if (forceGranularity === "hour" || (!forceGranularity && hourlyAggregates.length >= days)) {
      // Use hourly data
      granularity = "hour";
      intervals = hourlyAggregates.map((hour) => ({
        timestamp: hour.hour,
        successCount: Number(hour.successCount || 0),
        degradedCount: Number(hour.degradedCount || 0),
        failureCount: Number(hour.failureCount || 0),
        totalCount: Number(hour.totalCount || 0),
        uptimePercentage: hour.uptimePercentage,
      }));
    } else if (monitorId) {
      // Try minute-level data from raw check results
      const minuteResults = await db
        .select({
          minute: sql<Date>`DATE_TRUNC('minute', ${checkResults.createdAt})`.as("minute"),
          successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
          failureCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} IN ('failure', 'timeout', 'error'))`.as("failure_count"),
          degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
          totalCount: sql<number>`COUNT(*)`.as("total_count"),
        })
        .from(checkResults)
        .where(
          and(
            eq(checkResults.monitorId, monitorId),
            gte(checkResults.createdAt, startDate)
          )
        )
        .groupBy(sql`DATE_TRUNC('minute', ${checkResults.createdAt})`)
        .orderBy(sql`DATE_TRUNC('minute', ${checkResults.createdAt}) DESC`);

      // If force granularity is "minute", use minute data
      // Else if adaptive: if we have enough minute intervals, use minute
      if (forceGranularity === "minute" || (!forceGranularity && minuteResults.length >= days)) {
        // Use minute data
        granularity = "minute";
        intervals = minuteResults.map((row) => {
          const success = Number(row.successCount) || 0;
          const failure = Number(row.failureCount) || 0;
          const degraded = Number(row.degradedCount) || 0;
          const total = Number(row.totalCount) || 0;
          return {
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
        granularity = "hour";
        intervals = hourlyAggregates.map((hour) => ({
          timestamp: hour.hour,
          successCount: Number(hour.successCount || 0),
          degradedCount: Number(hour.degradedCount || 0),
          failureCount: Number(hour.failureCount || 0),
          totalCount: Number(hour.totalCount || 0),
          uptimePercentage: hour.uptimePercentage,
        }));
      } else if (minuteResults.length > 0) {
        // Use whatever minute data we have
        granularity = "minute";
        intervals = minuteResults.map((row) => {
          const success = Number(row.successCount) || 0;
          const failure = Number(row.failureCount) || 0;
          const degraded = Number(row.degradedCount) || 0;
          const total = Number(row.totalCount) || 0;
          return {
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
        granularity = "day";
        intervals = dailyAggregates.map((day) => ({
          timestamp: day.date,
          successCount: Number(day.successCount || 0),
          degradedCount: Number(day.degradedCount || 0),
          failureCount: Number(day.failureCount || 0),
          totalCount: Number(day.totalCount || 0),
          uptimePercentage: day.uptimePercentage,
        }));
      }
    } else {
      // No monitorId specified and not enough hourly data, use whatever daily we have
      granularity = "day";
      if (hourlyAggregates.length > 0) {
        // Group hourly data into daily buckets
        const dailyMap = new Map<string, { success: number; failure: number; degraded: number; total: number }>();

        for (const hour of hourlyAggregates) {
          const dateStr = hour.hour.toISOString().slice(0, 10);
          const existing = dailyMap.get(dateStr) || { success: 0, failure: 0, degraded: 0, total: 0 };
          existing.success += Number(hour.successCount || 0);
          existing.failure += Number(hour.failureCount || 0);
          existing.degraded += Number(hour.degradedCount || 0);
          existing.total += Number(hour.totalCount || 0);
          dailyMap.set(dateStr, existing);
        }

        intervals = Array.from(dailyMap.entries()).map(([date, counts]) => ({
          timestamp: new Date(date),
          successCount: counts.success,
          failureCount: counts.failure,
          degradedCount: counts.degraded,
          totalCount: counts.total,
          uptimePercentage: counts.total > 0 ? ((counts.success + counts.degraded) / counts.total) * 100 : null,
        })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      } else {
        intervals = dailyAggregates.map((day) => ({
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
  if (intervals.length > 0 && monitorId) {
    const now = new Date();
    let currentIntervalStart: Date;

    if (granularity === "day") {
      currentIntervalStart = new Date(now);
      currentIntervalStart.setHours(0, 0, 0, 0);
    } else if (granularity === "hour") {
      currentIntervalStart = new Date(now);
      currentIntervalStart.setMinutes(0, 0, 0);
    } else {
      currentIntervalStart = new Date(now);
      currentIntervalStart.setSeconds(0, 0);
    }

    // Fetch raw check results for the current interval
    const recentResults = await db
      .select({
        successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
        failureCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} IN ('failure', 'timeout', 'error'))`.as("failure_count"),
        degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
        totalCount: sql<number>`COUNT(*)`.as("total_count"),
      })
      .from(checkResults)
      .where(
        and(
          eq(checkResults.monitorId, monitorId),
          gte(checkResults.createdAt, currentIntervalStart)
        )
      );

    const recentResult = recentResults[0];
    if (recentResult) {
      const success = Number(recentResult.successCount) || 0;
      const failure = Number(recentResult.failureCount) || 0;
      const degraded = Number(recentResult.degradedCount) || 0;
      const total = Number(recentResult.totalCount) || 0;

      if (total > 0) {
        // Check if we already have an interval for the current period
        const currentIntervalKey = currentIntervalStart.toISOString();
        const existingCurrentIndex = intervals.findIndex(
          (i) => i.timestamp.toISOString() === currentIntervalKey
        );

        const newInterval: IntervalData = {
          timestamp: currentIntervalStart,
          successCount: success,
          degradedCount: degraded,
          failureCount: failure,
          totalCount: total,
          uptimePercentage: total > 0 ? ((success + degraded) / total) * 100 : null,
        };

        if (existingCurrentIndex >= 0) {
          // Update existing interval - prefer raw data since it's more recent
          const existing = intervals[existingCurrentIndex];
          if (!existing) {
            intervals.push(newInterval);
          } else {
            intervals[existingCurrentIndex] = {
              ...existing,
              successCount: Math.max(existing.successCount, success),
              degradedCount: Math.max(existing.degradedCount, degraded),
              failureCount: Math.max(existing.failureCount, failure),
              totalCount: Math.max(existing.totalCount, total),
              uptimePercentage:
                total > 0 ? ((success + degraded) / total) * 100 : existing.uptimePercentage,
            };
          }
        } else {
          // Add new interval for current period
          intervals.push(newInterval);
        }
      }
    }
  }

  // Calculate overall uptime (ensure numeric addition)
  const totals = intervals.reduce(
    (acc, interval) => ({
      success: acc.success + interval.successCount,
      degraded: acc.degraded + interval.degradedCount,
      failure: acc.failure + interval.failureCount,
      total: acc.total + interval.totalCount,
    }),
    { success: 0, degraded: 0, failure: 0, total: 0 }
  );

  const uptimePercentage =
    totals.total > 0
      ? (((totals.success + totals.degraded) / totals.total) * 100).toFixed(4)
      : null;

  // Fetch incidents for the monitor if monitorId is specified
  let incidentsByTimestamp = new Map<string, Array<{
    id: string;
    title: string;
    severity: "minor" | "major" | "critical";
  }>>();

  if (monitorId) {
    const monitorIncidents = await db.query.incidents.findMany({
      where: and(
        eq(incidents.organizationId, organizationId),
        gte(incidents.startedAt, startDate)
      ),
      orderBy: [desc(incidents.startedAt)],
    });

    // Filter to incidents affecting this monitor and group by timestamp based on granularity
    for (const incident of monitorIncidents) {
      const affectedMonitors = incident.affectedMonitors || [];
      if (!affectedMonitors.includes(monitorId)) continue;

      const incidentStart = new Date(incident.startedAt);
      const incidentEnd = incident.resolvedAt ? new Date(incident.resolvedAt) : new Date();

      // Add incident to each interval it was active
      const currentTime = new Date(incidentStart);

      if (granularity === "day") {
        currentTime.setHours(0, 0, 0, 0);
      } else if (granularity === "hour") {
        currentTime.setMinutes(0, 0, 0);
      } else {
        currentTime.setSeconds(0, 0);
      }

      while (currentTime <= incidentEnd && currentTime >= startDate) {
        let timestampKey: string;
        if (granularity === "day") {
          timestampKey = currentTime.toISOString().slice(0, 10);
        } else {
          timestampKey = currentTime.toISOString();
        }

        const existing = incidentsByTimestamp.get(timestampKey) || [];
        if (!existing.some(i => i.id === incident.id)) {
          existing.push({
            id: incident.id,
            title: incident.title,
            severity: incident.severity,
          });
        }
        incidentsByTimestamp.set(timestampKey, existing);

        // Increment based on granularity
        if (granularity === "day") {
          currentTime.setDate(currentTime.getDate() + 1);
        } else if (granularity === "hour") {
          currentTime.setHours(currentTime.getHours() + 1);
        } else {
          currentTime.setMinutes(currentTime.getMinutes() + 1);
        }
      }
    }
  }

  return c.json({
    success: true,
    data: {
      uptimePercentage: uptimePercentage !== null ? parseFloat(uptimePercentage) : null,
      days,
      granularity,
      totals,
      intervals: intervals.map((interval) => {
        let timestampKey: string;
        if (granularity === "day") {
          timestampKey = interval.timestamp.toISOString().slice(0, 10);
        } else {
          timestampKey = interval.timestamp.toISOString();
        }

        // Recalculate uptime to ensure it includes degraded
        const recalculatedUptime = interval.totalCount > 0
          ? ((interval.successCount + interval.degradedCount) / interval.totalCount) * 100
          : null;
        return {
          timestamp: interval.timestamp,
          uptime: recalculatedUptime,
          successCount: interval.successCount,
          degradedCount: interval.degradedCount,
          failureCount: interval.failureCount,
          totalCount: interval.totalCount,
          incidents: incidentsByTimestamp.get(timestampKey) || [],
        };
      }),
      // Keep 'daily' field for backward compatibility
      daily: intervals.map((interval) => {
        let timestampKey: string;
        if (granularity === "day") {
          timestampKey = interval.timestamp.toISOString().slice(0, 10);
        } else {
          timestampKey = interval.timestamp.toISOString();
        }

        const recalculatedUptime = interval.totalCount > 0
          ? ((interval.successCount + interval.degradedCount) / interval.totalCount) * 100
          : null;
        return {
          date: interval.timestamp,
          uptime: recalculatedUptime,
          successCount: interval.successCount,
          degradedCount: interval.degradedCount,
          failureCount: interval.failureCount,
          totalCount: interval.totalCount,
          incidents: incidentsByTimestamp.get(timestampKey) || [],
        };
      }),
    },
  });
});

// Response time analytics
analyticsRoutes.get("/response-times", async (c) => {
  const organizationId = await requireOrganization(c);
  const monitorId = c.req.query("monitorId");
  const hours = parseInt(c.req.query("hours") || "24");

  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);

  if (!monitorId) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "monitorId query parameter is required",
        },
      },
      400
    );
  }

  // Verify monitor belongs to org
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  // Determine granularity based on time range to maximize data points
  // Target: ~200-400 data points for good chart density
  // <= 3 hours: raw individual points (up to ~180 points at 1min interval)
  // 3-12 hours: 2-minute buckets (~360 points max)
  // 12-24 hours: 5-minute buckets (~288 points)
  // 24-72 hours: 10-minute buckets (~432 points)
  // 72-168 hours (7d): 15-minute buckets (~672 points)
  // 168-720 hours (30d): hourly buckets (~720 points)
  // > 720 hours: 2-hour buckets
  type Granularity = "raw" | "2min" | "5min" | "10min" | "15min" | "hourly" | "2hour";
  const granularity: Granularity =
    hours <= 3 ? "raw" :
    hours <= 12 ? "2min" :
    hours <= 24 ? "5min" :
    hours <= 72 ? "10min" :
    hours <= 168 ? "15min" :
    hours <= 720 ? "hourly" :
    "2hour";

  // Always fetch raw check results first
  const rawResults = await db.query.checkResults.findMany({
    where: and(
      eq(checkResults.monitorId, monitorId),
      gte(checkResults.createdAt, startDate)
    ),
    orderBy: [checkResults.createdAt],
  });

  // Helper functions
  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    const boundedIndex = Math.max(0, Math.min(index, sorted.length - 1));
    return sorted[boundedIndex] ?? null;
  };

  const average = (arr: number[]): number | null =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // Calculate summary stats from all raw results
  const allResponseTimes = rawResults
    .filter((r) => r.responseTimeMs != null)
    .map((r) => r.responseTimeMs as number);

  const summary = {
    p50: percentile(allResponseTimes, 50),
    p75: percentile(allResponseTimes, 75),
    p90: percentile(allResponseTimes, 90),
    p95: percentile(allResponseTimes, 95),
    p99: percentile(allResponseTimes, 99),
    avg: average(allResponseTimes),
    min: allResponseTimes.length > 0 ? Math.min(...allResponseTimes) : null,
    max: allResponseTimes.length > 0 ? Math.max(...allResponseTimes) : null,
  };

  // Build data points based on granularity
  let dataPoints: Array<{
    timestamp: Date;
    avg: number | null;
    min: number | null;
    max: number | null;
    p50: number | null;
    p90: number | null;
    p99: number | null;
    count: number;
  }>;

  if (granularity === "raw") {
    // Return individual check results (only those with valid response times)
    dataPoints = rawResults
      .filter((r) => r.responseTimeMs != null)
      .map((r) => ({
        timestamp: new Date(r.createdAt),
        avg: r.responseTimeMs!,
        min: r.responseTimeMs!,
        max: r.responseTimeMs!,
        p50: r.responseTimeMs!,
        p90: r.responseTimeMs!,
        p99: r.responseTimeMs!,
        count: 1,
      }));
  } else {
    // Aggregate into buckets based on granularity
    // Bucket sizes in minutes
    const bucketMinutes =
      granularity === "2min" ? 2 :
      granularity === "5min" ? 5 :
      granularity === "10min" ? 10 :
      granularity === "15min" ? 15 :
      granularity === "hourly" ? 60 :
      120; // 2hour

    const bucketMap = new Map<string, { responseTimes: number[]; successCount: number; failureCount: number; degradedCount: number }>();

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

      const existing = bucketMap.get(bucketKey) || { responseTimes: [], successCount: 0, failureCount: 0, degradedCount: 0 };

      if (result.responseTimeMs != null) {
        existing.responseTimes.push(result.responseTimeMs);
      }
      if (result.status === "success") {
        existing.successCount++;
      } else if (result.status === "degraded") {
        existing.degradedCount++;
      } else if (["failure", "timeout", "error"].includes(result.status)) {
        existing.failureCount++;
      }

      bucketMap.set(bucketKey, existing);
    }

    dataPoints = Array.from(bucketMap.entries())
      .filter(([, data]) => data.responseTimes.length > 0) // Only buckets with valid response times
      .map(([bucketKey, data]) => ({
        timestamp: new Date(bucketKey),
        avg: average(data.responseTimes)!,
        min: Math.min(...data.responseTimes),
        max: Math.max(...data.responseTimes),
        p50: percentile(data.responseTimes, 50)!,
        p90: percentile(data.responseTimes, 90)!,
        p99: percentile(data.responseTimes, 99)!,
        count: data.responseTimes.length,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  return c.json({
    success: true,
    data: {
      monitorId,
      hours,
      granularity,
      summary: {
        p50: summary.p50 !== null ? Math.round(summary.p50) : null,
        p75: summary.p75 !== null ? Math.round(summary.p75) : null,
        p90: summary.p90 !== null ? Math.round(summary.p90) : null,
        p95: summary.p95 !== null ? Math.round(summary.p95) : null,
        p99: summary.p99 !== null ? Math.round(summary.p99) : null,
        avg: summary.avg !== null ? Math.round(summary.avg) : null,
        min: summary.min !== null ? Math.round(summary.min) : null,
        max: summary.max !== null ? Math.round(summary.max) : null,
      },
      points: dataPoints.map((point) => ({
        timestamp: point.timestamp,
        avg: point.avg !== null ? Math.round(point.avg) : null,
        min: point.min !== null ? Math.round(point.min) : null,
        max: point.max !== null ? Math.round(point.max) : null,
        p50: point.p50 !== null ? Math.round(point.p50) : null,
        p90: point.p90 !== null ? Math.round(point.p90) : null,
        p99: point.p99 !== null ? Math.round(point.p99) : null,
        count: point.count,
      })),
    },
  });
});

// Incident statistics
analyticsRoutes.get("/incidents", async (c) => {
  const organizationId = await requireOrganization(c);
  const days = parseInt(c.req.query("days") || "30");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const incidentList = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, organizationId),
      gte(incidents.startedAt, startDate)
    ),
    orderBy: [desc(incidents.startedAt)],
  });

  // Count by status
  const byStatus = incidentList.reduce(
    (acc, incident) => {
      acc[incident.status] = (acc[incident.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Count by severity
  const bySeverity = incidentList.reduce(
    (acc, incident) => {
      acc[incident.severity] = (acc[incident.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate MTTR (Mean Time to Resolution)
  const resolvedIncidents = incidentList.filter(
    (i) => i.status === "resolved" && i.resolvedAt
  );
  const totalResolutionTime = resolvedIncidents.reduce((acc, incident) => {
    const duration =
      new Date(incident.resolvedAt!).getTime() -
      new Date(incident.startedAt).getTime();
    return acc + duration;
  }, 0);
  const mttr =
    resolvedIncidents.length > 0
      ? totalResolutionTime / resolvedIncidents.length / 1000 / 60 // in minutes
      : 0;

  return c.json({
    success: true,
    data: {
      days,
      total: incidentList.length,
      byStatus,
      bySeverity,
      mttr: Math.round(mttr), // Mean Time to Resolution in minutes
      recent: incidentList.slice(0, 10).map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        startedAt: i.startedAt,
        resolvedAt: i.resolvedAt,
      })),
    },
  });
});

// PageSpeed analytics
analyticsRoutes.get("/pagespeed", async (c) => {
  const organizationId = await requireOrganization(c);
  const monitorId = c.req.query("monitorId");
  const days = parseInt(c.req.query("days") || "7");

  if (!monitorId) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "monitorId query parameter is required",
        },
      },
      400
    );
  }

  // Verify monitor belongs to org
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get check results with PageSpeed data
  const results = await db.query.checkResults.findMany({
    where: and(
      eq(checkResults.monitorId, monitorId),
      gte(checkResults.createdAt, startDate),
      sql`${checkResults.pagespeedScores} IS NOT NULL`
    ),
    orderBy: [desc(checkResults.createdAt)],
    limit: 100,
  });

  // Calculate averages
  const scores = results.map((r) => r.pagespeedScores as {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
  } | null).filter(Boolean);

  const average = (arr: (number | undefined)[]): number | null => {
    const valid = arr.filter((v): v is number => v !== undefined);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const avgPerformance = average(scores.map((s) => s?.performance));
  const avgAccessibility = average(scores.map((s) => s?.accessibility));
  const avgBestPractices = average(scores.map((s) => s?.bestPractices));
  const avgSeo = average(scores.map((s) => s?.seo));

  // Get latest score
  const latestScore = scores[0] || null;

  return c.json({
    success: true,
    data: {
      monitorId,
      days,
      totalChecks: results.length,
      latest: latestScore,
      averages: {
        performance: avgPerformance !== null ? Math.round(avgPerformance) : null,
        accessibility: avgAccessibility !== null ? Math.round(avgAccessibility) : null,
        bestPractices: avgBestPractices !== null ? Math.round(avgBestPractices) : null,
        seo: avgSeo !== null ? Math.round(avgSeo) : null,
      },
      history: results.map((r) => ({
        timestamp: r.createdAt,
        scores: r.pagespeedScores,
      })),
    },
  });
});

// Web Vitals analytics
analyticsRoutes.get("/web-vitals", async (c) => {
  const organizationId = await requireOrganization(c);
  const monitorId = c.req.query("monitorId");
  const days = parseInt(c.req.query("days") || "7");

  if (!monitorId) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "monitorId query parameter is required",
        },
      },
      400
    );
  }

  // Verify monitor belongs to org
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    throw new Error("Not found");
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get check results with Web Vitals data
  const results = await db.query.checkResults.findMany({
    where: and(
      eq(checkResults.monitorId, monitorId),
      gte(checkResults.createdAt, startDate),
      sql`${checkResults.webVitals} IS NOT NULL`
    ),
    orderBy: [desc(checkResults.createdAt)],
    limit: 100,
  });

  // Calculate averages and assess status
  const vitals = results.map((r) => r.webVitals as {
    lcp?: number;
    fid?: number;
    inp?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
    si?: number;
    tbt?: number;
  } | null).filter(Boolean);

  const average = (arr: (number | undefined)[]): number | null => {
    const valid = arr.filter((v): v is number => v !== undefined);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const avgLcp = average(vitals.map((v) => v?.lcp));
  const avgFid = average(vitals.map((v) => v?.fid));
  const avgInp = average(vitals.map((v) => v?.inp));
  const avgCls = average(vitals.map((v) => v?.cls));
  const avgFcp = average(vitals.map((v) => v?.fcp));
  const avgTtfb = average(vitals.map((v) => v?.ttfb));
  const avgSi = average(vitals.map((v) => v?.si));
  const avgTbt = average(vitals.map((v) => v?.tbt));

  // Assess Core Web Vitals status based on Google's thresholds
  const assessVital = (value: number | null, good: number, poor: number, lowerIsBetter = true): "good" | "needs-improvement" | "poor" | "unknown" => {
    if (value === null) return "unknown";
    if (lowerIsBetter) {
      if (value <= good) return "good";
      if (value <= poor) return "needs-improvement";
      return "poor";
    } else {
      if (value >= good) return "good";
      if (value >= poor) return "needs-improvement";
      return "poor";
    }
  };

  // Get latest vitals
  const latestVitals = vitals[0] || null;

  return c.json({
    success: true,
    data: {
      monitorId,
      days,
      totalChecks: results.length,
      latest: latestVitals,
      averages: {
        lcp: avgLcp !== null ? Math.round(avgLcp) : null,
        fid: avgFid !== null ? Math.round(avgFid) : null,
        inp: avgInp !== null ? Math.round(avgInp) : null,
        cls: avgCls !== null ? Number(avgCls.toFixed(3)) : null,
        fcp: avgFcp !== null ? Math.round(avgFcp) : null,
        ttfb: avgTtfb !== null ? Math.round(avgTtfb) : null,
        si: avgSi !== null ? Math.round(avgSi) : null,
        tbt: avgTbt !== null ? Math.round(avgTbt) : null,
      },
      assessment: {
        lcp: assessVital(avgLcp, 2500, 4000),      // Good: <= 2.5s, Poor: > 4s
        fid: assessVital(avgFid, 100, 300),        // Good: <= 100ms, Poor: > 300ms
        inp: assessVital(avgInp, 200, 500),        // Good: <= 200ms, Poor: > 500ms
        cls: assessVital(avgCls, 0.1, 0.25),       // Good: <= 0.1, Poor: > 0.25
        fcp: assessVital(avgFcp, 1800, 3000),      // Good: <= 1.8s, Poor: > 3s
        ttfb: assessVital(avgTtfb, 800, 1800),     // Good: <= 800ms, Poor: > 1.8s
      },
      history: results.map((r) => ({
        timestamp: r.createdAt,
        vitals: r.webVitals,
      })),
    },
  });
});

// Dashboard overview
analyticsRoutes.get("/dashboard", async (c) => {
  const organizationId = await requireOrganization(c);

  // Get monitor counts by status
  const allMonitors = await db.query.monitors.findMany({
    where: eq(monitors.organizationId, organizationId),
  });

  const monitorsByStatus = allMonitors.reduce(
    (acc, monitor) => {
      acc[monitor.status] = (acc[monitor.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Get active incidents
  const activeIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, organizationId),
      sql`${incidents.status} != 'resolved'`
    ),
    orderBy: [desc(incidents.startedAt)],
  });

  // Get recent resolved incidents (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recentIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, organizationId),
      gte(incidents.startedAt, weekAgo)
    ),
    orderBy: [desc(incidents.startedAt)],
    limit: 10,
  });

  // Calculate overall uptime from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let overallUptime: number | null = null;
  let uptimeTrend: Array<{ date: string; uptime: number }> = [];

  if (allMonitors.length > 0) {
    const monitorIds = allMonitors.map((m) => m.id);

    // Get uptime from check results
    const uptimeStats = await db
      .select({
        successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
        degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
        totalCount: sql<number>`COUNT(*)`.as("total_count"),
      })
      .from(checkResults)
      .where(
        and(
          inArray(checkResults.monitorId, monitorIds),
          gte(checkResults.createdAt, thirtyDaysAgo)
        )
      );

    const totalCount = Number(uptimeStats[0]?.totalCount || 0);
    const successCount = Number(uptimeStats[0]?.successCount || 0);
    const degradedCount = Number(uptimeStats[0]?.degradedCount || 0);
    if (totalCount > 0) {
      overallUptime = ((successCount + degradedCount) / totalCount) * 100;
    }

    // Get uptime trend (daily data)
    const dailyUptimeData = await db
      .select({
        date: sql<string>`DATE(${checkResults.createdAt})`.as("date"),
        successCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`.as("success_count"),
        degradedCount: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'degraded')`.as("degraded_count"),
        totalCount: sql<number>`COUNT(*)`.as("total_count"),
      })
      .from(checkResults)
      .where(
        and(
          inArray(checkResults.monitorId, monitorIds),
          gte(checkResults.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${checkResults.createdAt})`)
      .orderBy(sql`DATE(${checkResults.createdAt})`);

    uptimeTrend = dailyUptimeData.map((d) => {
      const total = Number(d.totalCount || 0);
      const success = Number(d.successCount || 0);
      const degraded = Number(d.degradedCount || 0);
      return {
        date: d.date,
        uptime: total > 0 ? ((success + degraded) / total) * 100 : 0,
      };
    });
  }

  return c.json({
    success: true,
    data: {
      monitors: {
        total: allMonitors.length,
        byStatus: monitorsByStatus,
      },
      incidents: {
        active: activeIncidents.length,
        recent: recentIncidents,
      },
      uptime: {
        average: overallUptime,
        trend: uptimeTrend,
      },
    },
  });
});
