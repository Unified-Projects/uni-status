"use client";

import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@uni-status/ui";
import {
  UptimeBar,
  UptimeLegend,
  type UptimeDataPoint,
  type UptimeStatus,
} from "@/components/monitors";
import { useUptimeAnalytics } from "@/hooks/use-analytics";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

const RANGE_OPTIONS = [45, 90] as const;

function getCombinedStatus(point: {
  uptimePercentage: number | null;
  totalCount: number;
  degradedCount: number;
  failureCount: number;
}): UptimeStatus {
  if (point.uptimePercentage === null || point.totalCount === 0) {
    return "unknown";
  }

  if (point.failureCount >= point.totalCount) {
    return "down";
  }

  if (point.degradedCount > 0 || point.failureCount > 0) {
    return "degraded";
  }

  return "success";
}

export function OrganizationUptimeTab() {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(45);

  const {
    data: uptimeAnalytics,
    isLoading,
    error,
  } = useUptimeAnalytics({
    days,
    granularity: "auto",
  });

  const combinedUptimeData = useMemo<UptimeDataPoint[]>(() => {
    if (!uptimeAnalytics) return [];

    return uptimeAnalytics.data.map((point) => ({
      date: point.date,
      timestamp: point.timestamp,
      uptimePercentage: point.uptimePercentage,
      status: getCombinedStatus(point),
      successCount: point.successCount,
      degradedCount: point.degradedCount,
      failureCount: point.failureCount,
      totalCount: point.totalCount,
      incidents: point.incidents,
    }));
  }, [uptimeAnalytics]);

  const overallUptimeLabel =
    uptimeAnalytics?.overall.uptimePercentage != null
      ? `${uptimeAnalytics.overall.uptimePercentage.toFixed(2)}% uptime`
      : "No uptime data";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Uptime History</CardTitle>
          <CardDescription>
            Historical uptime over the past {days} days
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={option === days ? "secondary" : "outline"}
              onClick={() => setDays(option)}
              disabled={isLoading && option === days}
            >
              {option} days
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <LoadingState variant="card" count={1} />
        ) : error ? (
          <ErrorState error={error} />
        ) : combinedUptimeData.length > 0 ? (
          <>
            <UptimeBar
              data={combinedUptimeData}
              days={days}
              granularity={uptimeAnalytics?.granularity}
              height={32}
              showTooltip
              showLegend={false}
            />

            <div className="grid gap-3 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <span className="text-muted-foreground">{days} days ago</span>
              <span className="text-center font-semibold text-foreground">
                {overallUptimeLabel}
              </span>
              <span className="text-muted-foreground sm:text-right">Today</span>
            </div>

            <UptimeLegend className="flex-wrap text-muted-foreground" />
          </>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No uptime history available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
