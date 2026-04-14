"use client";

import { useQuery } from "@tanstack/react-query";
import { getDefaultTemplateConfig, type TemplateConfig } from "@uni-status/shared";
import {
  StatusPageHeader,
  OverallStatusBanner,
  StatusPageFooter,
  SubscribeForm,
  LayoutWrapper,
  isFullPageLayout,
  StatusPageContainer,
} from "@/components/public-status";
import type { LayoutProps } from "@/components/public-status/layouts/types";

type PublicStatusMonitor = LayoutProps["monitors"][number] & {
  regions?: string[];
  uptimeGranularity?: "minute" | "hour" | "day";
  responseTimeData?: Array<{
    timestamp: string;
    avg: number | null;
    min: number | null;
    max: number | null;
    p50: number | null;
    p90: number | null;
    p99: number | null;
    status?: "success" | "degraded" | "down" | "incident";
  }>;
  uptimeData: Array<LayoutProps["monitors"][number]["uptimeData"][number] & {
    timestamp?: string;
    degradedCount?: number;
    incidents?: Array<{
      id: string;
      title: string;
      severity: "minor" | "major" | "critical";
    }>;
  }>;
};

type PublicStatusIncident = LayoutProps["activeIncidents"][number];
type PublicStatusCrowdsourced = NonNullable<LayoutProps["crowdsourced"]>;

interface PublicStatusPageContentData {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  orgLogo?: string | null;
  settings: LayoutProps["settings"] & {
    defaultTimezone?: string;
    localization?: {
      defaultLocale?: string;
      supportedLocales?: string[];
      rtlLocales?: string[];
    };
  };
  template?: TemplateConfig | null;
  monitors: PublicStatusMonitor[];
  activeIncidents: PublicStatusIncident[];
  recentIncidents: PublicStatusIncident[];
  crowdsourced: PublicStatusCrowdsourced;
  lastUpdatedAt: string;
}

interface PublicStatusPageLiveData {
  monitors: Array<{
    id: string;
    status: PublicStatusMonitor["status"];
    uptimePercentage: number | null;
    responseTimeMs: number | null;
    uptimeData: PublicStatusMonitor["uptimeData"];
    uptimeGranularity?: PublicStatusMonitor["uptimeGranularity"];
    responseTimeData?: PublicStatusMonitor["responseTimeData"];
    certificateInfo?: PublicStatusMonitor["certificateInfo"];
    emailAuthInfo?: PublicStatusMonitor["emailAuthInfo"];
    heartbeatInfo?: PublicStatusMonitor["heartbeatInfo"];
  }>;
  activeIncidents: PublicStatusIncident[];
  recentIncidents: PublicStatusIncident[];
  crowdsourced: PublicStatusCrowdsourced;
  lastUpdatedAt: string;
}

interface PublicStatusPageContentProps {
  slug: string;
  basePath: string;
  initialData: PublicStatusPageContentData;
  initialLocale?: string;
  notificationMessage?: string;
  notificationError?: string;
}

async function fetchStatusPageLiveData(slug: string): Promise<PublicStatusPageLiveData | null> {
  const response = await fetch(`/api/public/status-pages/${slug}/live`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.success || !payload.data) {
    return null;
  }

  return payload.data as PublicStatusPageLiveData;
}

function mergeStatusPageData(
  shellData: PublicStatusPageContentData,
  liveData: PublicStatusPageLiveData | null
): PublicStatusPageContentData {
  if (!liveData) {
    return shellData;
  }

  const liveMonitorsById = new Map(liveData.monitors.map((monitor) => [monitor.id, monitor]));

  return {
    ...shellData,
    monitors: shellData.monitors.map((monitor) => {
      const liveMonitor = liveMonitorsById.get(monitor.id);
      if (!liveMonitor) {
        return monitor;
      }

      return {
        ...monitor,
        ...liveMonitor,
      };
    }),
    activeIncidents: liveData.activeIncidents,
    recentIncidents: liveData.recentIncidents,
    crowdsourced: liveData.crowdsourced,
    lastUpdatedAt: liveData.lastUpdatedAt,
  };
}

function splitMonitorGroups(monitors: PublicStatusMonitor[]) {
  const monitorGroups = new Map<string, PublicStatusMonitor[]>();
  const ungroupedMonitors: PublicStatusMonitor[] = [];

  for (const monitor of monitors) {
    if (monitor.group) {
      const group = monitorGroups.get(monitor.group) || [];
      group.push(monitor);
      monitorGroups.set(monitor.group, group);
    } else {
      ungroupedMonitors.push(monitor);
    }
  }

  return { monitorGroups, ungroupedMonitors };
}

export function PublicStatusPageContent({
  slug,
  basePath,
  initialData,
  initialLocale,
  notificationMessage,
  notificationError,
}: PublicStatusPageContentProps) {
  const { data: liveData } = useQuery({
    queryKey: ["public-status-page-live", slug],
    queryFn: () => fetchStatusPageLiveData(slug),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const data = mergeStatusPageData(initialData, liveData ?? null);
  const template = data.template || getDefaultTemplateConfig();
  const { monitorGroups, ungroupedMonitors } = splitMonitorGroups(data.monitors);
  const localization = data.settings.localization;
  const defaultTimezone = data.settings.defaultTimezone || "local";

  const pageData = {
    name: data.name,
    logo: data.logo,
    orgLogo: data.orgLogo,
    headerText: data.settings.headerText,
    footerText: data.settings.footerText,
    supportUrl: data.settings.supportUrl,
    hideBranding: data.settings.hideBranding,
    lastUpdatedAt: data.lastUpdatedAt,
    slug,
    basePath,
  };

  if (isFullPageLayout(template.layout)) {
    return (
      <StatusPageContainer
        localization={localization}
        defaultTimezone={defaultTimezone}
        initialLocale={initialLocale}
      >
        <div className="min-h-screen bg-background text-foreground">
          <LayoutWrapper
            layout={template.layout}
            monitors={data.monitors}
            monitorGroups={monitorGroups}
            ungroupedMonitors={ungroupedMonitors}
            activeIncidents={data.activeIncidents}
            recentIncidents={data.recentIncidents}
            settings={data.settings}
            template={template}
            crowdsourced={data.crowdsourced}
            statusPageSlug={slug}
            fullPageProps={pageData}
            notificationMessage={notificationMessage}
            notificationError={notificationError}
          />
        </div>
      </StatusPageContainer>
    );
  }

  return (
    <StatusPageContainer
      localization={localization}
      defaultTimezone={defaultTimezone}
      initialLocale={initialLocale}
    >
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 flex-1 w-full">
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

          <StatusPageHeader
            name={data.name}
            logo={data.logo}
            orgLogo={data.orgLogo}
            headerText={data.settings.headerText}
            slug={data.slug}
            basePath={basePath}
            showServicesPage={data.settings.showServicesPage}
          />

          <OverallStatusBanner
            monitors={data.monitors}
            incidents={data.activeIncidents}
            lastUpdatedAt={data.lastUpdatedAt}
            className="mt-6"
          />

          <div className="mt-8">
            <LayoutWrapper
              layout={template.layout}
              monitors={data.monitors}
              monitorGroups={monitorGroups}
              ungroupedMonitors={ungroupedMonitors}
              activeIncidents={data.activeIncidents}
              recentIncidents={data.recentIncidents}
              settings={data.settings}
              template={template}
              crowdsourced={data.crowdsourced}
              statusPageSlug={slug}
              basePath={basePath}
            />
          </div>

          <div className="mt-12 border-t pt-8 pb-8">
            <SubscribeForm slug={slug} />
          </div>

          <StatusPageFooter
            footerText={data.settings.footerText}
            supportUrl={data.settings.supportUrl}
            hideBranding={data.settings.hideBranding}
            slug={slug}
            basePath={basePath}
            localization={localization}
            className="mt-auto pt-8"
          />
        </div>
      </div>
    </StatusPageContainer>
  );
}
