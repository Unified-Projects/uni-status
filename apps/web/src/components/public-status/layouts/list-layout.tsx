"use client";

import { cn } from "@uni-status/ui";
import { MonitorWrapper } from "../monitors";
import { IncidentWrapper } from "../incidents";
import type { LayoutProps } from "./types";

export function ListLayout({
  monitors,
  monitorGroups,
  ungroupedMonitors,
  activeIncidents,
  recentIncidents,
  settings,
  template,
  crowdsourced,
  statusPageSlug,
  className,
}: LayoutProps) {
  return (
    <div className={cn("space-y-8", className)}>
      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Active Incidents</h2>
          <div className="space-y-4">
            {activeIncidents.map((incident) => (
              <IncidentWrapper
                key={incident.id}
                style={template.incidentStyle}
                incident={incident}
              />
            ))}
          </div>
        </section>
      )}

      {/* Systems */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Systems</h2>
        <div className="space-y-3">
          {ungroupedMonitors.map((monitor) => (
            <MonitorWrapper
              key={monitor.id}
              style={template.monitorStyle}
              indicatorStyle={template.indicatorStyle}
              monitor={monitor}
              showUptimePercentage={settings.showUptimePercentage}
              showResponseTime={settings.showResponseTime}
              uptimeDays={settings.uptimeDays}
              displayMode={settings.displayMode}
              graphTooltipMetrics={settings.graphTooltipMetrics}
              crowdsourced={
                crowdsourced?.enabled
                  ? {
                      enabled: true,
                      statusPageSlug,
                      reportCount: crowdsourced.reportCounts?.[monitor.id] ?? 0,
                      threshold: crowdsourced.threshold,
                    }
                  : undefined
              }
              subscription={
                statusPageSlug
                  ? { enabled: true, statusPageSlug }
                  : undefined
              }
            />
          ))}

          {Array.from(monitorGroups.entries()).map(([groupName, groupMonitors]) => (
            <div key={groupName} className="mt-6">
              <h3 className="text-md font-medium text-[var(--status-muted-text)] mb-3">
                {groupName}
              </h3>
              <div className="space-y-3">
                {groupMonitors.map((monitor) => (
                  <MonitorWrapper
                    key={monitor.id}
                    style={template.monitorStyle}
                    indicatorStyle={template.indicatorStyle}
                    monitor={monitor}
                    showUptimePercentage={settings.showUptimePercentage}
                    showResponseTime={settings.showResponseTime}
                    uptimeDays={settings.uptimeDays}
                    displayMode={settings.displayMode}
                    graphTooltipMetrics={settings.graphTooltipMetrics}
                    crowdsourced={
                      crowdsourced?.enabled
                        ? {
                            enabled: true,
                            statusPageSlug,
                            reportCount: crowdsourced.reportCounts?.[monitor.id] ?? 0,
                            threshold: crowdsourced.threshold,
                          }
                        : undefined
                    }
                    subscription={
                      statusPageSlug
                        ? { enabled: true, statusPageSlug }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ))}

          {monitors.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-[var(--status-muted-text)]">
              No monitors configured for this status page.
            </div>
          )}
        </div>
      </section>

      {/* Past Incidents */}
      {settings.showIncidentHistory && recentIncidents.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Past Incidents</h2>
          <div className="space-y-4">
            {recentIncidents.map((incident) => (
              <IncidentWrapper
                key={incident.id}
                style={template.incidentStyle}
                incident={incident}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
