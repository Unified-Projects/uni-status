import { db } from "@uni-status/database";
import { monitors } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import type { CheckStatus } from "@uni-status/shared/types";

interface BuildMonitorUpdateOptions {
  includeLastCheckedAt?: boolean;
  extraUpdates?: Record<string, unknown>;
}

export interface MonitorTransitionResult {
  organizationId: string;
  update: Record<string, unknown>;
}

/**
 * Build a threshold-aware monitor status/counter update from a check result.
 * This activates degradedAfterCount/downAfterCount and consecutive counters.
 */
export async function buildMonitorTransitionUpdate(
  monitorId: string,
  checkStatus: CheckStatus,
  options: BuildMonitorUpdateOptions = {}
): Promise<MonitorTransitionResult | null> {
  const monitor = await db.query.monitors.findFirst({
    where: eq(monitors.id, monitorId),
    columns: {
      organizationId: true,
      degradedAfterCount: true,
      downAfterCount: true,
      consecutiveDegradedCount: true,
      consecutiveFailureCount: true,
    },
  });

  if (!monitor) return null;

  const degradedAfter = Math.max(1, monitor.degradedAfterCount ?? 1);
  const downAfter = Math.max(1, monitor.downAfterCount ?? 1);
  const prevDegraded = Math.max(0, monitor.consecutiveDegradedCount ?? 0);
  const prevFailure = Math.max(0, monitor.consecutiveFailureCount ?? 0);

  let status: "active" | "degraded" | "down" = "active";
  let consecutiveDegradedCount = 0;
  let consecutiveFailureCount = 0;

  if (checkStatus === "success") {
    status = "active";
  } else if (checkStatus === "degraded") {
    consecutiveDegradedCount = prevDegraded + 1;
    status = consecutiveDegradedCount >= degradedAfter ? "degraded" : "active";
  } else {
    consecutiveFailureCount = prevFailure + 1;
    status = consecutiveFailureCount >= downAfter ? "down" : "active";
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    status,
    consecutiveDegradedCount,
    consecutiveFailureCount,
    updatedAt: now,
    ...(options.includeLastCheckedAt ? { lastCheckedAt: now } : {}),
    ...(options.extraUpdates ?? {}),
  };

  return {
    organizationId: monitor.organizationId,
    update,
  };
}
