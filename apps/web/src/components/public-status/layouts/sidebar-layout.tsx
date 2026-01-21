"use client";

import { useState } from "react";
import { cn } from "@uni-status/ui";
import { Menu, X } from "lucide-react";
import { MonitorWrapper } from "../monitors";
import { IncidentWrapper } from "../incidents";
import { StatusIndicatorWrapper } from "../indicators";
import { OverallStatusBanner } from "../overall-status-banner";
import { SubscribeForm } from "../subscribe-form";
import { StatusPageFooter } from "../status-page-footer";
import type { FullPageLayoutProps, Monitor } from "./types";

function getGroupStatus(monitors: Monitor[]): "active" | "degraded" | "down" {
  if (monitors.some((m) => m.status === "down")) return "down";
  if (monitors.some((m) => m.status === "degraded")) return "degraded";
  return "active";
}

export function SidebarLayout({
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
  const allGroups = ["All Systems", ...Array.from(monitorGroups.keys())];
  if (ungroupedMonitors.length > 0) {
    allGroups.push("Ungrouped");
  }

  const [activeGroup, setActiveGroup] = useState(allGroups[0]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getDisplayedMonitors = (): Monitor[] => {
    if (activeGroup === "All Systems") return monitors;
    if (activeGroup === "Ungrouped") return ungroupedMonitors;
    return monitorGroups.get(activeGroup) || [];
  };

  const getGroupStatusForName = (groupName: string): "active" | "degraded" | "down" => {
    if (groupName === "All Systems") return getGroupStatus(monitors);
    if (groupName === "Ungrouped") return getGroupStatus(ungroupedMonitors);
    return getGroupStatus(monitorGroups.get(groupName) || []);
  };

  const displayedMonitors = getDisplayedMonitors();

  const handleGroupSelect = (group: string) => {
    setActiveGroup(group);
    setSidebarOpen(false);
  };

  // Sidebar content (shared between desktop and mobile)
  const SidebarContent = () => (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-[var(--status-muted-text)] mb-3 px-3">
        Monitor Groups
      </h3>
      {allGroups.map((group) => {
        const status = getGroupStatusForName(group);
        return (
          <button
            key={group}
            onClick={() => handleGroupSelect(group)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
              activeGroup === group
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-[var(--status-muted)]"
            )}
          >
            {/* Use dot indicator for cleaner sidebar look */}
            <StatusIndicatorWrapper style="dot" status={status} />
            <span className="truncate">{group}</span>
          </button>
        );
      })}

      {/* Quick incident summary in sidebar */}
      {activeIncidents.length > 0 && (
        <div className="mt-6 pt-4 border-t">
          <h3 className="text-sm font-medium text-[var(--status-muted-text)] mb-2 px-3">
            Active Incidents
          </h3>
          <div className="px-3 text-sm font-medium text-[var(--status-warning-text)]">
            {activeIncidents.length} active incident{activeIncidents.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("min-h-screen flex", className)}>
      {/* Desktop Sidebar - Fixed position, full height */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:border-r lg:bg-[var(--status-bg)]">
        <div className="flex-1 overflow-y-auto py-6 px-4">
          {/* Sidebar Logo/Branding */}
          <div className="mb-8">
            <img
              src={pageData.logo || pageData.orgLogo || "/icon.svg"}
              alt={pageData.name}
              className="h-10 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== "/icon.svg") {
                  target.src = "/icon.svg";
                }
              }}
            />
            <h2 className="mt-3 text-lg font-semibold truncate text-[var(--status-text)]">{pageData.name}</h2>
          </div>
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--status-text)]/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-[var(--status-bg)] border-r transform transition-transform duration-300 ease-in-out lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <img
              src={pageData.logo || pageData.orgLogo || "/icon.svg"}
              alt={pageData.name}
              className="h-8 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== "/icon.svg") {
                  target.src = "/icon.svg";
                }
              }}
            />
            <span className="font-semibold truncate text-[var(--status-text)]">{pageData.name}</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-[var(--status-muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-73px)]">
          <SidebarContent />
        </div>
      </aside>

      {/* Main Content Area - Offset by sidebar width on desktop */}
      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile Header with Menu Button */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-4 bg-[var(--status-bg)] border-b px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-[var(--status-muted)]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src={pageData.logo || pageData.orgLogo || "/icon.svg"}
              alt={pageData.name}
              className="h-6 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== "/icon.svg") {
                  target.src = "/icon.svg";
                }
              }}
            />
            <span className="font-semibold truncate text-[var(--status-text)]">{pageData.name}</span>
          </div>
        </div>

        {/* Centered content container */}
        <div className="px-6 py-8 lg:px-8 lg:py-10 max-w-4xl mx-auto flex-1 w-full">
          {/* Notification messages */}
          {notificationMessage && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-success-text)] bg-[var(--status-success-bg)] border-[var(--status-success-text)]/20">
              {notificationMessage === "subscribed" && "You have been subscribed to status updates."}
              {notificationMessage === "unsubscribed" && "You have been unsubscribed from status updates."}
              {notificationMessage === "already_verified" && "Your email is already verified."}
            </div>
          )}
          {notificationError && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-error-text)] bg-[var(--status-error-bg)] border-[var(--status-error-text)]/20">
              {notificationError === "invalid_token" && "Invalid or expired link."}
            </div>
          )}

          {/* Overall Status Banner */}
          <OverallStatusBanner
            monitors={monitors}
            incidents={activeIncidents}
            lastUpdatedAt={pageData.lastUpdatedAt}
          />

          {/* Main Content */}
          <div className="mt-8 space-y-8">
            {/* Active Incidents (shown at top when viewing all) */}
            {activeGroup === "All Systems" && activeIncidents.length > 0 && (
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

            {/* Monitors - Only show group name if not "All Systems" */}
            <section>
              {activeGroup !== "All Systems" && (
                <h2 className="text-lg font-semibold mb-4">{activeGroup}</h2>
              )}
              <div className="space-y-3">
                {displayedMonitors.map((monitor) => (
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
                {displayedMonitors.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-[var(--status-muted-text)]">
                    No monitors in this group.
                  </div>
                )}
              </div>
            </section>

            {/* Past Incidents (only when viewing all) */}
            {activeGroup === "All Systems" &&
              settings.showIncidentHistory &&
              recentIncidents.length > 0 && (
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

          {/* Subscribe Form */}
          <div className="mt-12 border-t pt-8">
            <SubscribeForm slug={pageData.slug} />
          </div>
        </div>

        {/* Footer - Always at bottom */}
        <div className="mt-auto px-6 pb-6 lg:px-8 max-w-4xl mx-auto w-full">
          <StatusPageFooter
            footerText={pageData.footerText}
            supportUrl={pageData.supportUrl}
            hideBranding={pageData.hideBranding}
            slug={pageData.slug}
            basePath={pageData.basePath}
          />
        </div>
      </main>
    </div>
  );
}
