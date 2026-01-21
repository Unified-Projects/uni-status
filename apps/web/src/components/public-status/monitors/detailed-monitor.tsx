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

interface DetailedMonitorProps extends MonitorProps {
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: TooltipMetricsConfig;
}

export function DetailedMonitor({
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
}: DetailedMonitorProps) {
  const granularity = monitor.uptimeGranularity || "day";
  const unitLabel = granularity === "day" ? "days" : granularity === "hour" ? "hours" : "minutes";

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--status-card)] p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between">
        {/* For bar indicator, show below name. For others, show beside name */}
        {indicatorStyle === "bar" ? (
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-[var(--status-text)]">{monitor.name}</h3>
            {monitor.description && (
              <p className="text-sm text-[var(--status-muted-text)] mt-1">
                {monitor.description}
              </p>
            )}
            <div className="mt-3">
              <StatusIndicatorWrapper
                style={indicatorStyle}
                status={monitor.status}
                size="lg"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 flex-1">
            <StatusIndicatorWrapper
              style={indicatorStyle}
              status={monitor.status}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-lg text-[var(--status-text)]">{monitor.name}</h3>
              {monitor.description && (
                <p className="text-sm text-[var(--status-muted-text)] mt-1">
                  {monitor.description}
                </p>
              )}
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

      <div className="grid grid-cols-2 gap-4">
        {/* Uptime - show for all types except SSL-only */}
        {showUptimePercentage && showsUptime(monitor.type) && (
          <div className="p-3 rounded-lg bg-[var(--status-muted)]/50">
            <div className="text-xs text-[var(--status-muted-text)] mb-1">Uptime</div>
            <div className={cn("text-xl font-bold", getUptimeColorClass(monitor.uptimePercentage))}>
              {formatUptime(monitor.uptimePercentage)}
            </div>
            <div className="text-xs text-[var(--status-muted-text)]">Last {uptimeDays} {unitLabel}</div>
          </div>
        )}
        {/* Response/Connection Time - for most types */}
        {showResponseTime && showsResponseTime(monitor.type) && (
          <div className="p-3 rounded-lg bg-[var(--status-muted)]/50">
            <div className="text-xs text-[var(--status-muted-text)] mb-1">{getPrimaryMetricLabel(monitor.type)}</div>
            <div className="text-xl font-bold text-[var(--status-text)]">
              {formatResponseTime(monitor.responseTimeMs)}
            </div>
            <div className="text-xs text-[var(--status-muted-text)]">Average</div>
          </div>
        )}
        {/* Certificate - for SSL/HTTPS types */}
        {showsCertificate(monitor.type) && monitor.certificateInfo && (
          <div className="p-3 rounded-lg bg-[var(--status-muted)]/50">
            <div className="text-xs text-[var(--status-muted-text)] mb-1">Certificate</div>
            <div className={cn("text-xl font-bold", getCertificateColorClass(monitor.certificateInfo.daysUntilExpiry))}>
              {formatCertificateExpiry(monitor.certificateInfo.daysUntilExpiry)}
            </div>
            <div className="text-xs text-[var(--status-muted-text)]">until expiry</div>
          </div>
        )}
        {/* Email Auth - for email_auth type */}
        {showsEmailAuth(monitor.type) && monitor.emailAuthInfo && (
          <div className="p-3 rounded-lg bg-[var(--status-muted)]/50">
            <div className="text-xs text-[var(--status-muted-text)] mb-1">Auth Score</div>
            <div className={cn("text-xl font-bold", getEmailAuthColorClass(monitor.emailAuthInfo.overallScore))}>
              {formatEmailAuthScore(monitor.emailAuthInfo.overallScore)}
            </div>
            <div className="text-xs text-[var(--status-muted-text)]">SPF/DKIM/DMARC</div>
          </div>
        )}
        {/* Heartbeat - for heartbeat type */}
        {showsHeartbeat(monitor.type) && monitor.heartbeatInfo && (
          <div className="p-3 rounded-lg bg-[var(--status-muted)]/50">
            <div className="text-xs text-[var(--status-muted-text)] mb-1">Last Ping</div>
            <div className={cn("text-xl font-bold", getHeartbeatColorClass(monitor.heartbeatInfo.lastPingAt, monitor.heartbeatInfo.expectedIntervalSeconds))}>
              {formatHeartbeatLastPing(monitor.heartbeatInfo.lastPingAt)}
            </div>
            <div className="text-xs text-[var(--status-muted-text)]">Expected every {monitor.heartbeatInfo.expectedIntervalSeconds}s</div>
          </div>
        )}
      </div>

      {/* Uptime History Bar - only for types that show uptime (not SSL-only) */}
      {showsUptime(monitor.type) && displayMode !== "graph" && (
        <div>
          <div className="text-xs text-[var(--status-muted-text)] mb-2">Uptime History</div>
          <UptimeBar
            data={monitor.uptimeData}
            days={uptimeDays}
            granularity={granularity}
            height={32}
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
        <div>
          <div className="text-xs text-[var(--status-muted-text)] mb-2">Response Time</div>
          <ResponseTimeChart
            data={monitor.responseTimeData}
            height={200}
            tooltipMetrics={graphTooltipMetrics}
            className="border-0 shadow-none"
          />
        </div>
      )}

      {/* Crowdsourced "Is this down?" button */}
      {crowdsourced?.enabled && crowdsourced.statusPageSlug && (
        <div className="pt-3 border-t">
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
