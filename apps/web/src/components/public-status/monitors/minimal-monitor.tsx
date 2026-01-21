"use client";

import { cn } from "@uni-status/ui";
import { StatusIndicatorWrapper } from "../indicators";
import { ReportDownButton } from "../report-down-button";
import { ComponentSubscribeButton } from "../component-subscribe-button";
import type { MonitorProps } from "./types";
import type { TooltipMetricsConfig } from "@/components/monitors/response-time-chart";

interface MinimalMonitorProps extends MonitorProps {
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: TooltipMetricsConfig;
}

export function MinimalMonitor({
  monitor,
  indicatorStyle = "dot",
  crowdsourced,
  subscription,
  className,
  // displayMode and graphTooltipMetrics are accepted but not used in minimal view
}: MinimalMonitorProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-3 rounded-md hover:bg-[var(--status-muted)]/50 transition-colors group",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <StatusIndicatorWrapper style={indicatorStyle} status={monitor.status} />
        <span className="font-medium">{monitor.name}</span>
      </div>
      <div className="flex items-center gap-2">
        {subscription?.enabled && subscription.statusPageSlug && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ComponentSubscribeButton
              monitorId={monitor.id}
              monitorName={monitor.name}
              slug={subscription.statusPageSlug}
            />
          </div>
        )}
        {crowdsourced?.enabled && crowdsourced.statusPageSlug && (
          <ReportDownButton
            statusPageSlug={crowdsourced.statusPageSlug}
            monitorId={monitor.id}
            reportCount={crowdsourced.reportCount}
            threshold={crowdsourced.threshold}
          />
        )}
      </div>
    </div>
  );
}
