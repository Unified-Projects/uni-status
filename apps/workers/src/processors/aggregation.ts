import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { checkResults, checkResultsHourly } from "@uni-status/database/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "aggregation" });


interface AggregationJob {
  monitorId: string;
  hour: string; // ISO timestamp for the hour to aggregate
}

export async function processAggregation(job: Job<AggregationJob>) {
  const { monitorId, hour } = job.data;

  const hourStart = new Date(hour);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

  log.info(`Aggregating results for monitor ${monitorId} at ${hour}`);

  // Get all results for this hour
  const results = await db.query.checkResults.findMany({
    where: and(
      eq(checkResults.monitorId, monitorId),
      gte(checkResults.createdAt, hourStart),
      lt(checkResults.createdAt, hourEnd),
      sql`COALESCE(${checkResults.metadata} ->> 'checkType', '') <> 'certificate_transparency'`
    ),
  });

  if (results.length === 0) {
    log.info("No results to aggregate");
    return { success: true, count: 0 };
  }

  // Calculate aggregates
  const responseTimes = results
    .filter((r) => r.responseTimeMs !== null)
    .map((r) => r.responseTimeMs!)
    .sort((a, b) => a - b);

  const successCount = results.filter((r) => r.status === "success").length;
  const degradedCount = results.filter((r) => r.status === "degraded").length;
  const failureCount = results.filter((r) =>
    ["failure", "timeout", "error"].includes(r.status)
  ).length;

  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return null;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

  const aggregate = {
    id: nanoid(),
    monitorId,
    region: results[0]?.region || "uk",
    hour: hourStart,
    avgResponseTimeMs:
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : null,
    minResponseTimeMs: responseTimes.length > 0 ? Math.min(...responseTimes) : null,
    maxResponseTimeMs: responseTimes.length > 0 ? Math.max(...responseTimes) : null,
    p50ResponseTimeMs: percentile(responseTimes, 50),
    p75ResponseTimeMs: percentile(responseTimes, 75),
    p90ResponseTimeMs: percentile(responseTimes, 90),
    p95ResponseTimeMs: percentile(responseTimes, 95),
    p99ResponseTimeMs: percentile(responseTimes, 99),
    successCount,
    degradedCount,
    failureCount,
    totalCount: results.length,
    uptimePercentage:
      results.length > 0 ? ((successCount + degradedCount) / results.length) * 100 : null,
    createdAt: new Date(),
  };

  // Upsert the aggregate
  await db
    .insert(checkResultsHourly)
    .values(aggregate)
    .onConflictDoUpdate({
      target: [checkResultsHourly.monitorId, checkResultsHourly.hour],
      set: aggregate,
    });

  log.info(`Aggregated ${results.length} results for monitor ${monitorId}`);

  return { success: true, count: results.length };
}
