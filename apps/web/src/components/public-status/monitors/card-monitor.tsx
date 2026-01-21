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

interface CardMonitorProps extends MonitorProps {
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: TooltipMetricsConfig;
}

export function CardMonitor({
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
}: CardMonitorProps) {
  const granularity = monitor.uptimeGranularity || "day";
  // For card view, cap at 30 segments for visual reasons
  const displaySegments = Math.min(30, uptimeDays);

  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--status-card)] p-5 shadow-sm hover:shadow-md transition-shadow relative",
        className
      )}
    >
      {/* Subscribe button in top-right corner */}
      {subscription?.enabled && subscription.statusPageSlug && (
        <div className="absolute top-3 right-3">
          <ComponentSubscribeButton
            monitorId={monitor.id}
            monitorName={monitor.name}
            slug={subscription.statusPageSlug}
          />
        </div>
      )}

      <div className="mb-4">
        {/* For bar indicator, show below name. For others, show beside name */}
        {indicatorStyle === "bar" ? (
          <>
            <h3 className="font-semibold leading-tight line-clamp-2 pr-8 text-[var(--status-text)]">{monitor.name}</h3>
            {monitor.description && (
              <p className="text-sm text-[var(--status-muted-text)] line-clamp-2 mt-1">
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
          </>
        ) : (
          <div className="flex items-center gap-3">
            <StatusIndicatorWrapper
              style={indicatorStyle}
              status={monitor.status}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-tight line-clamp-2 pr-8 text-[var(--status-text)]">{monitor.name}</h3>
              {monitor.description && (
                <p className="text-sm text-[var(--status-muted-text)] line-clamp-2">
                  {monitor.description}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between text-sm mb-4">
        {/* Uptime - show for all types except SSL-only */}
        {showUptimePercentage && showsUptime(monitor.type) && (
          <div>
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
      </div>

      {/* Uptime History Bar - only for types that show uptime (not SSL-only) */}
      {showsUptime(monitor.type) && displayMode !== "graph" && (
        <UptimeBar
          data={monitor.uptimeData}
          days={displaySegments}
          granularity={granularity}
          height={20}
          showTooltip
          showLegend={false}
        />
      )}

      {/* Response Time Graph - when displayMode includes graph */}
      {showsResponseTime(monitor.type) && displayMode !== "bars" && monitor.responseTimeData && monitor.responseTimeData.length > 0 && (
        <ResponseTimeChart
          data={monitor.responseTimeData}
          height={120}
          tooltipMetrics={graphTooltipMetrics}
          className="border-0 shadow-none"
        />
      )}

      {/* Crowdsourced "Is this down?" button */}
      {crowdsourced?.enabled && crowdsourced.statusPageSlug && (
        <div className="mt-4 pt-3 border-t">
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
