"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { cn } from "@uni-status/ui";
import { MonitorWrapper } from "../monitors";
import { IncidentWrapper } from "../incidents";
import { OverallStatusBanner } from "../overall-status-banner";
import { SubscribeForm } from "../subscribe-form";
import { StatusPageFooter } from "../status-page-footer";
import type { FullPageLayoutProps } from "./types";

interface NavItem {
  id: string;
  label: string;
  show: boolean;
}

export function SinglePageLayout({
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
  const [activeSection, setActiveSection] = useState("systems");

  const navItems: NavItem[] = [
    { id: "systems", label: "Systems", show: true },
    { id: "incidents", label: "Active Incidents", show: activeIncidents.length > 0 },
    { id: "history", label: "Incident History", show: settings.showIncidentHistory && recentIncidents.length > 0 },
    { id: "uptime", label: "Uptime Summary", show: true },
  ];

  const visibleNavItems = navItems.filter((item) => item.show);

  // Scroll spy effect
  useEffect(() => {
    const handleScroll = () => {
      const sections = visibleNavItems.map((item) => ({
        id: item.id,
        element: document.getElementById(item.id),
      }));

      const scrollPosition = window.scrollY + 140;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.element && section.element.offsetTop <= scrollPosition) {
          setActiveSection(section.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleNavItems]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const SectionNav = () => (
    <div className="flex flex-wrap gap-2">
      {visibleNavItems.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToSection(item.id)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
            activeSection === item.id
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-[var(--status-border)] bg-[var(--status-muted)] text-[var(--status-text)]/80 hover:bg-[var(--status-muted)]/80"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={cn("min-h-screen bg-[var(--status-bg)] text-[var(--status-text)]", className)}>
      <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,hsl(var(--foreground)/0.08),transparent_35%),radial-gradient(circle_at_85%_10%,hsl(var(--primary)/0.18),transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
          {(notificationMessage || notificationError) && (
            <div className="max-w-3xl">
              {notificationMessage && (
                <div className="mb-3 rounded-xl border px-4 py-3 text-sm shadow-sm text-[var(--status-success-text)] bg-[var(--status-success-bg)] border-[var(--status-success-text)]/20">
                  {notificationMessage === "subscribed" && "You have been subscribed to status updates."}
                  {notificationMessage === "unsubscribed" && "You have been unsubscribed from status updates."}
                  {notificationMessage === "already_verified" && "Your email is already verified."}
                </div>
              )}
              {notificationError && (
                <div className="rounded-xl border px-4 py-3 text-sm shadow-sm text-[var(--status-error-text)] bg-[var(--status-error-bg)] border-[var(--status-error-text)]/20">
                  {notificationError === "invalid_token" && "Invalid or expired link."}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-[var(--status-card)] shadow-sm ring-1 ring-[var(--status-border)]">
                <img
                  src={pageData.logo || pageData.orgLogo || "/icon.svg"}
                  alt={pageData.name}
                  className="h-10 w-10 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== "/icon.svg") {
                      target.src = "/icon.svg";
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--status-muted-text)]">Single View</p>
                <h1 className="text-3xl font-bold tracking-tight text-[var(--status-text)]">{pageData.name}</h1>
                {pageData.headerText && (
                  <p className="text-sm text-[var(--status-muted-text)] max-w-2xl">
                    {pageData.headerText}
                  </p>
                )}
              </div>
            </div>
            <SectionNav />
          </div>

          {pageData.slug && (
            <div className="flex flex-wrap gap-2 text-sm text-[var(--status-muted-text)]">
              <Link
                href={`${pageData.basePath || ""}/` || "/"}
                className="rounded-full border border-[var(--status-border)] px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-[var(--status-text)]"
              >
                Status
              </Link>
              <Link
                href={`${pageData.basePath || ""}/events`}
                className="rounded-full border border-[var(--status-border)] px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-[var(--status-text)]"
              >
                Events
              </Link>
              {settings.showServicesPage && (
                <Link
                  href={`${pageData.basePath || ""}/services`}
                  className="rounded-full border border-[var(--status-border)] px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-[var(--status-text)]"
                >
                  Services
                </Link>
              )}
            </div>
          )}

          <OverallStatusBanner
            monitors={monitors}
            incidents={activeIncidents}
            lastUpdatedAt={pageData.lastUpdatedAt}
            className="mt-2 border-primary/30 bg-primary/5 shadow-sm backdrop-blur"
          />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 space-y-16">
        <section id="systems" className="scroll-mt-28 space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Systems Status</h2>
            <p className="text-[var(--status-muted-text)]">
              Current operational status of all monitored services
            </p>
          </div>

          <div className="rounded-2xl border bg-[var(--status-card)]/70 p-6 shadow-sm space-y-6">
            {ungroupedMonitors.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <div key={groupName} className="space-y-3">
                <h3 className="text-lg font-semibold">{groupName}</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

        {activeIncidents.length > 0 && (
          <section id="incidents" className="scroll-mt-28 space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">Active Incidents</h2>
              <p className="text-[var(--status-muted-text)]">
                Ongoing issues affecting our services
              </p>
            </div>
            <div className="rounded-2xl border bg-[var(--status-card)]/70 p-6 shadow-sm space-y-6">
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

        {settings.showIncidentHistory && recentIncidents.length > 0 && (
          <section id="history" className="scroll-mt-28 space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">Incident History</h2>
              <p className="text-[var(--status-muted-text)]">
                Past incidents and their resolutions
              </p>
            </div>
            <div className="rounded-2xl border bg-[var(--status-card)]/70 p-6 shadow-sm space-y-6">
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

        <section id="uptime" className="scroll-mt-28 space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Uptime Summary</h2>
            <p className="text-[var(--status-muted-text)]">
              Overall system reliability over the past {settings.uptimeDays} days
            </p>
          </div>
          <div className="rounded-2xl border bg-[var(--status-card)]/70 p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {monitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className="rounded-lg border p-4 hover:bg-[var(--status-muted)]/60 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium truncate pr-2">{monitor.name}</span>
                    <span
                      className={cn(
                        "text-sm font-bold whitespace-nowrap",
                        monitor.uptimePercentage !== null && monitor.uptimePercentage >= 99.9
                          ? "text-[var(--status-success-text)]"
                          : monitor.uptimePercentage !== null && monitor.uptimePercentage >= 99
                            ? "text-[var(--status-success-text)]/80"
                            : monitor.uptimePercentage !== null && monitor.uptimePercentage >= 95
                              ? "text-[var(--status-warning-text)]"
                              : "text-[var(--status-error-text)]"
                      )}
                    >
                      {monitor.uptimePercentage !== null
                        ? `${monitor.uptimePercentage.toFixed(2)}%`
                        : "--"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--status-muted-text)]">
                    Last {settings.uptimeDays} days
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="rounded-2xl border bg-[var(--status-card)]/70 p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Stay updated</h3>
          <p className="text-sm text-[var(--status-muted-text)] mb-4">
            Subscribe to receive alerts whenever something changes.
          </p>
          <SubscribeForm slug={pageData.slug} />
        </div>
      </div>

      <div className="border-t bg-[var(--status-card)]/60">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <StatusPageFooter
            footerText={pageData.footerText}
            supportUrl={pageData.supportUrl}
            hideBranding={pageData.hideBranding}
            slug={pageData.slug}
            basePath={pageData.basePath}
          />
        </div>
      </div>
    </div>
  );
}
