"use client";

import { cn } from "@uni-status/ui";
import { MonitorWrapper } from "../monitors";
import { IncidentWrapper } from "../incidents";
import { StatusPageHeader } from "../status-page-header";
import { OverallStatusBanner } from "../overall-status-banner";
import { SubscribeForm } from "../subscribe-form";
import { StatusPageFooter } from "../status-page-footer";
import type { FullPageLayoutProps } from "./types";

export function CardsLayout({
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
  pageData,
  notificationMessage,
  notificationError,
}: FullPageLayoutProps) {
  return (
    <div className={cn("min-h-screen flex flex-col", className)}>
      {/* Full-width header area with centered content */}
      <div className="border-b bg-[var(--status-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Notification messages */}
          {notificationMessage && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-success-text)] bg-[var(--status-success-bg)] border-[var(--status-success-text)]/20 max-w-2xl mx-auto">
              {notificationMessage === "subscribed" && "You have been subscribed to status updates."}
              {notificationMessage === "unsubscribed" && "You have been unsubscribed from status updates."}
              {notificationMessage === "already_verified" && "Your email is already verified."}
            </div>
          )}
          {notificationError && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-error-text)] bg-[var(--status-error-bg)] border-[var(--status-error-text)]/20 max-w-2xl mx-auto">
              {notificationError === "invalid_token" && "Invalid or expired link."}
            </div>
          )}

          {/* Header */}
          <StatusPageHeader
            name={pageData.name}
            logo={pageData.logo}
            orgLogo={pageData.orgLogo}
            headerText={pageData.headerText}
            slug={pageData.slug}
            showServicesPage={settings.showServicesPage}
          />

          {/* Overall Status Banner */}
          <OverallStatusBanner
            monitors={monitors}
            incidents={activeIncidents}
            lastUpdatedAt={pageData.lastUpdatedAt}
            className="mt-6 max-w-2xl mx-auto"
          />
        </div>
      </div>

      {/* Wide content area */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 flex-1 w-full">
        <div className="space-y-12">
          {/* Active Incidents */}
          {activeIncidents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-6">Active Incidents</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <h2 className="text-lg font-semibold mb-6">Systems</h2>

            {ungroupedMonitors.length > 0 && (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-8">
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
              </div>
            )}

            {Array.from(monitorGroups.entries()).map(([groupName, groupMonitors]) => (
              <div key={groupName} className="mb-10">
                <h3 className="text-md font-medium text-[var(--status-muted-text)] mb-4">
                  {groupName}
                </h3>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          </section>

          {/* Past Incidents */}
          {settings.showIncidentHistory && recentIncidents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-6">Past Incidents</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* Subscribe Form */}
        <div className="mt-12 border-t pt-8 max-w-xl mx-auto">
          <SubscribeForm slug={pageData.slug} />
        </div>
      </div>

      {/* Footer - Always at bottom */}
      <div className="mt-auto px-4 pb-6 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <StatusPageFooter
          footerText={pageData.footerText}
          supportUrl={pageData.supportUrl}
          hideBranding={pageData.hideBranding}
          slug={pageData.slug}
        />
      </div>
    </div>
  );
}
