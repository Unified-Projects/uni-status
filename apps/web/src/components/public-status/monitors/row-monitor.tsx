"use client";

import { cn } from "@uni-status/ui";
import { UptimeBar } from "@/components/monitors/uptime-bar";
import { ResponseTimeChart, type TooltipMetricsConfig } from "@/components/monitors/response-time-chart";
import { StatusIndicatorWrapper } from "../indicators";
import { ReportDownButton } from "../report-down-button";
import { ComponentSubscribeButton } from "../component-subscribe-button";
import {
  type MonitorProps,
  formatResponseTime,
  formatUptime,
  getUptimeColorClass,
  formatCertificateExpiry,
  getCertificateColorClass,
  formatEmailAuthScore,
  getEmailAuthColorClass,
  formatHeartbeatLastPing,
  getHeartbeatColorClass,
  showsResponseTime,
  showsCertificate,
  showsUptime,
  showsEmailAuth,
  showsHeartbeat,
  getPrimaryMetricLabel,
} from "./types";

interface RowMonitorProps extends MonitorProps {
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: TooltipMetricsConfig;
}

export function RowMonitor({
  monitor,
  showUptimePercentage,
  showResponseTime,
  uptimeDays,
  indicatorStyle = "dot",
  crowdsourced,
  subscription,
  className,
  displayMode = "bars",
  graphTooltipMetrics = { avg: true },
}: RowMonitorProps) {
  const granularity = monitor.uptimeGranularity || "day";
  const unitLabel = granularity === "day" ? "days" : granularity === "hour" ? "hours" : "minutes";

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--status-card)] p-4 transition-colors hover:bg-[var(--status-muted)]/50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* For bar indicator, show below name. For others, show beside name */}
        {indicatorStyle === "bar" ? (
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-[var(--status-text)]">{monitor.name}</h3>
            {monitor.description && (
              <p className="text-sm text-[var(--status-muted-text)] truncate">
                {monitor.description}
              </p>
            )}
            <div className="mt-2">
              <StatusIndicatorWrapper
                style={indicatorStyle}
                status={monitor.status}
                pulse
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <StatusIndicatorWrapper
              style={indicatorStyle}
              status={monitor.status}
              pulse
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-[var(--status-text)]">{monitor.name}</h3>
              {monitor.description && (
                <p className="text-sm text-[var(--status-muted-text)] truncate">
                  {monitor.description}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-sm">
          {/* Uptime - show for all types except SSL-only */}
          {showUptimePercentage && showsUptime(monitor.type) && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">Uptime</div>
              <div className={cn("font-medium", getUptimeColorClass(monitor.uptimePercentage))}>
                {formatUptime(monitor.uptimePercentage)}
              </div>
            </div>
          )}
          {/* Response Time - for most types */}
          {showResponseTime && showsResponseTime(monitor.type) && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">{getPrimaryMetricLabel(monitor.type)}</div>
              <div className="font-medium text-[var(--status-text)]">
                {formatResponseTime(monitor.responseTimeMs)}
              </div>
            </div>
          )}
          {/* Certificate - for SSL/HTTPS types */}
          {showsCertificate(monitor.type) && monitor.certificateInfo && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">Certificate</div>
              <div className={cn("font-medium", getCertificateColorClass(monitor.certificateInfo.daysUntilExpiry))}>
                {formatCertificateExpiry(monitor.certificateInfo.daysUntilExpiry)}
              </div>
            </div>
          )}
          {/* Email Auth - for email_auth type */}
          {showsEmailAuth(monitor.type) && monitor.emailAuthInfo && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">Auth Score</div>
              <div className={cn("font-medium", getEmailAuthColorClass(monitor.emailAuthInfo.overallScore))}>
                {formatEmailAuthScore(monitor.emailAuthInfo.overallScore)}
              </div>
            </div>
          )}
          {/* Heartbeat - for heartbeat type */}
          {showsHeartbeat(monitor.type) && monitor.heartbeatInfo && (
            <div className="text-right">
              <div className="text-[var(--status-muted-text)] text-xs">Last Ping</div>
              <div className={cn("font-medium", getHeartbeatColorClass(monitor.heartbeatInfo.lastPingAt, monitor.heartbeatInfo.expectedIntervalSeconds))}>
                {formatHeartbeatLastPing(monitor.heartbeatInfo.lastPingAt)}
              </div>
            </div>
          )}
          {subscription?.enabled && subscription.statusPageSlug && (
            <ComponentSubscribeButton
              monitorId={monitor.id}
              monitorName={monitor.name}
              slug={subscription.statusPageSlug}
            />
          )}
        </div>
      </div>

      {/* Uptime History Bar - only for types that show uptime (not SSL-only) */}
      {showsUptime(monitor.type) && displayMode !== "graph" && (
        <div className="mt-4">
          <UptimeBar
            data={monitor.uptimeData}
            days={uptimeDays}
            granularity={granularity}
            height={24}
            showTooltip
            showLegend={false}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-[var(--status-muted-text)]">
            <span>{uptimeDays} {unitLabel} ago</span>
            <span>Now</span>
          </div>
        </div>
      )}

      {/* Response Time Graph - when displayMode includes graph */}
      {showsResponseTime(monitor.type) && displayMode !== "bars" && monitor.responseTimeData && monitor.responseTimeData.length > 0 && (
        <div className="mt-4">
          <ResponseTimeChart
            data={monitor.responseTimeData}
            height={150}
            tooltipMetrics={graphTooltipMetrics}
            className="border-0 shadow-none"
          />
        </div>
      )}

      {/* Crowdsourced "Is this down?" button */}
      {crowdsourced?.enabled && crowdsourced.statusPageSlug && (
        <div className="mt-3 pt-3 border-t">
          <ReportDownButton
            statusPageSlug={crowdsourced.statusPageSlug}
            monitorId={monitor.id}
            reportCount={crowdsourced.reportCount}
            threshold={crowdsourced.threshold}
          />
        </div>
      )}
    </div>
  );
}
