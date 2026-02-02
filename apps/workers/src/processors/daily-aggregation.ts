import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { checkResultsHourly, checkResultsDaily } from "@uni-status/database/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "daily-aggregation" });


interface DailyAggregationJob {
    monitorId: string;
    date: string; // ISO date string for the day to aggregate (e.g., "2025-01-15")
}

export async function processDailyAggregation(job: Job<DailyAggregationJob>) {
    const { monitorId, date } = job.data;

    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    log.info(`[Daily Aggregation] Aggregating results for monitor ${monitorId} on ${date}`);

    // Get all hourly aggregates for this day
    const hourlyResults = await db.query.checkResultsHourly.findMany({
        where: and(
            eq(checkResultsHourly.monitorId, monitorId),
            gte(checkResultsHourly.hour, dayStart),
            lt(checkResultsHourly.hour, dayEnd)
        ),
    });

    if (hourlyResults.length === 0) {
        log.info("[Daily Aggregation] No hourly results to aggregate");
        return { success: true, count: 0 };
    }

    // Group by region
    const byRegion = new Map<string, typeof hourlyResults>();
    for (const hour of hourlyResults) {
        const existing = byRegion.get(hour.region) || [];
        existing.push(hour);
        byRegion.set(hour.region, existing);
    }

    // Aggregate each region
    for (const [region, hours] of byRegion) {
        // Collect response times for percentile calculation
        const allResponseTimes: number[] = [];
        let totalSuccessCount = 0;
        let totalDegradedCount = 0;
        let totalFailureCount = 0;
        let totalCount = 0;
        let sumResponseTime = 0;
        let minResponseTime: number | null = null;
        let maxResponseTime: number | null = null;

        for (const hour of hours) {
            totalSuccessCount += hour.successCount;
            totalDegradedCount += hour.degradedCount;
            totalFailureCount += hour.failureCount;
            totalCount += hour.totalCount;

            // For response time aggregation, use the averages weighted by count
            if (hour.avgResponseTimeMs !== null && hour.totalCount > 0) {
                sumResponseTime += hour.avgResponseTimeMs * hour.totalCount;
            }

            if (hour.minResponseTimeMs !== null) {
                minResponseTime = minResponseTime === null
                    ? hour.minResponseTimeMs
                    : Math.min(minResponseTime, hour.minResponseTimeMs);
            }

            if (hour.maxResponseTimeMs !== null) {
                maxResponseTime = maxResponseTime === null
                    ? hour.maxResponseTimeMs
                    : Math.max(maxResponseTime, hour.maxResponseTimeMs);
            }

            // Collect individual percentile values for approximate daily percentiles
            if (hour.p50ResponseTimeMs !== null) allResponseTimes.push(hour.p50ResponseTimeMs);
            if (hour.p95ResponseTimeMs !== null) allResponseTimes.push(hour.p95ResponseTimeMs);
            if (hour.p99ResponseTimeMs !== null) allResponseTimes.push(hour.p99ResponseTimeMs);
        }

        // Calculate daily percentiles from hourly percentile values (approximation)
        allResponseTimes.sort((a, b) => a - b);

        const percentile = (arr: number[], p: number) => {
            if (arr.length === 0) return null;
            const index = Math.ceil((p / 100) * arr.length) - 1;
            return arr[Math.max(0, index)];
        };

        const aggregate = {
            id: nanoid(),
            monitorId,
            region,
            date: dayStart,
            avgResponseTimeMs: totalCount > 0 ? sumResponseTime / totalCount : null,
            minResponseTimeMs: minResponseTime,
            maxResponseTimeMs: maxResponseTime,
            p50ResponseTimeMs: percentile(allResponseTimes, 50),
            p95ResponseTimeMs: percentile(allResponseTimes, 95),
            p99ResponseTimeMs: percentile(allResponseTimes, 99),
            successCount: totalSuccessCount,
            degradedCount: totalDegradedCount,
            failureCount: totalFailureCount,
            totalCount: totalCount,
            uptimePercentage: totalCount > 0 ? ((totalSuccessCount + totalDegradedCount) / totalCount) * 100 : null,
            createdAt: new Date(),
        };

        // Upsert the daily aggregate
        await db
            .insert(checkResultsDaily)
            .values(aggregate)
            .onConflictDoUpdate({
                target: [checkResultsDaily.monitorId, checkResultsDaily.date],
                set: {
                    ...aggregate,
                    id: undefined, // Don't update the ID
                },
            });

        log.info(`[Daily Aggregation] Aggregated ${hours.length} hourly results for monitor ${monitorId} region ${region}`);
    }

    return { success: true, count: hourlyResults.length, regions: byRegion.size };
}
