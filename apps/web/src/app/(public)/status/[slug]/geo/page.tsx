"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Globe,
  Layers3,
  MapPin,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@uni-status/ui";
import { GeoMapControls } from "@/components/public-status/geo/geo-map-controls";
import { StatusPageRouteShell } from "@/components/public-status";
import type {
  GeoControlState,
  GeoData,
  GeoIncident,
  GeoMonitor,
  GeoProbe,
  GeoRegion,
  GeoResponse,
} from "@/components/public-status/geo/types";

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

function getApiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const appHostname = new URL(appUrl).hostname;
    const currentHostname = window.location.hostname;
    if (currentHostname !== appHostname && currentHostname !== "localhost") {
      return "/api";
    }
  } catch {
    // Fall back to the configured API URL when parsing fails.
  }
  return DEFAULT_API_URL;
}

const GeoMap = dynamic(
  () => import("@/components/public-status/geo/geo-map").then((mod) => mod.GeoMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
);

async function fetchGeoData(slug: string): Promise<GeoResponse> {
  const response = await fetch(`${getApiUrl()}/public/status-pages/${slug}/geo`, {
    credentials: "include",
  });
  return response.json();
}

function MapSkeleton() {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border bg-card animate-pulse">
      <div className="text-center">
        <Globe className="mx-auto mb-4 h-12 w-12 text-muted-foreground animate-pulse" />
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    </div>
  );
}

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  status?: "success" | "warning" | "error";
}

function StatsCard({ icon, label, value, status }: StatsCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold",
          status === "success" && "text-status-success-solid",
          status === "warning" && "text-status-warning-solid",
          status === "error" && "text-status-error-solid"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function PublicGeoPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [controls, setControls] = useState<GeoControlState>({
    showPublicProbes: true,
    showPrivateProbes: false,
    showEdgeOrigin: true,
    showQuorumConnections: true,
    selectedRegion: null,
  });

  const {
    data: geoData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["public-geo", slug],
    queryFn: () => fetchGeoData(slug),
    enabled: !!slug,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const geoPayload = geoData?.data;

  const stats = useMemo(() => {
    if (!geoPayload) {
      return {
        totalRegions: 0,
        totalMonitors: 0,
        activeIncidents: 0,
        operationalMonitors: 0,
        degradedMonitors: 0,
        downMonitors: 0,
      };
    }

    const { regions, incidents } = geoPayload;

    return {
      totalRegions: regions.length,
      totalMonitors: regions.reduce((sum, region) => sum + region.monitorCount, 0),
      activeIncidents: incidents.length,
      operationalMonitors: regions.reduce(
        (sum, region) => sum + (region.status === "active" ? region.monitorCount : 0),
        0
      ),
      degradedMonitors: regions.reduce(
        (sum, region) => sum + (region.status === "degraded" ? region.monitorCount : 0),
        0
      ),
      downMonitors: regions.reduce(
        (sum, region) => sum + (region.status === "down" ? region.monitorCount : 0),
        0
      ),
    };
  }, [geoPayload]);

  const incidentCountsByRegion = useMemo(() => {
    const counts = new Map<string, number>();
    if (!geoPayload) return counts;

    for (const incident of geoPayload.incidents) {
      for (const regionId of incident.affectedRegions) {
        counts.set(regionId, (counts.get(regionId) ?? 0) + 1);
      }
    }

    return counts;
  }, [geoPayload]);

  const selectedRegion = useMemo(
    () =>
      controls.selectedRegion
        ? geoPayload?.regions.find((region) => region.id === controls.selectedRegion) ?? null
        : null,
    [controls.selectedRegion, geoPayload]
  );

  const focusedGeoData = useMemo<GeoData | null>(() => {
    if (!geoPayload) return null;
    if (!controls.selectedRegion) return geoPayload;

    return {
      ...geoPayload,
      regions: geoPayload.regions.filter((region) => region.id === controls.selectedRegion),
      monitors: geoPayload.monitors.filter((monitor) =>
        monitor.regions.includes(controls.selectedRegion as string)
      ),
      probes: {
        public: geoPayload.probes.public.filter(
          (probe) => probe.region === controls.selectedRegion
        ),
        private: geoPayload.probes.private.filter(
          (probe) => probe.region === controls.selectedRegion
        ),
      },
      incidents: geoPayload.incidents.filter((incident) =>
        incident.affectedRegions.includes(controls.selectedRegion as string)
      ),
      quorumConnections: geoPayload.quorumConnections.filter(
        (connection) =>
          connection.fromRegion === controls.selectedRegion ||
          connection.toRegion === controls.selectedRegion
      ),
    };
  }, [controls.selectedRegion, geoPayload]);

  const regionMonitors = useMemo<GeoMonitor[]>(() => {
    if (!geoPayload || !controls.selectedRegion) return [];
    return geoPayload.monitors.filter((monitor) =>
      monitor.regions.includes(controls.selectedRegion as string)
    );
  }, [controls.selectedRegion, geoPayload]);

  const regionIncidents = useMemo<GeoIncident[]>(() => {
    if (!geoPayload || !controls.selectedRegion) return [];
    return geoPayload.incidents.filter((incident) =>
      incident.affectedRegions.includes(controls.selectedRegion as string)
    );
  }, [controls.selectedRegion, geoPayload]);

  const regionPublicProbes = useMemo<GeoProbe[]>(() => {
    if (!geoPayload || !controls.selectedRegion) return [];
    return geoPayload.probes.public.filter(
      (probe) => probe.region === controls.selectedRegion
    );
  }, [controls.selectedRegion, geoPayload]);

  const regionPrivateProbes = useMemo<GeoProbe[]>(() => {
    if (!geoPayload || !controls.selectedRegion) return [];
    return geoPayload.probes.private.filter(
      (probe) => probe.region === controls.selectedRegion
    );
  }, [controls.selectedRegion, geoPayload]);

  const visibleRegionProbes = controls.showEdgeOrigin
    ? regionPublicProbes
    : regionPrivateProbes;

  const hasPublicProbes = (geoPayload?.probes.public.length ?? 0) > 0;
  const hasPrivateProbes = (geoPayload?.probes.private.length ?? 0) > 0;
  const hasQuorumConnections = (geoPayload?.quorumConnections.length ?? 0) > 0;
  const statusPageName = geoPayload?.statusPage.name || "Status";

  const handleControlChange = (key: keyof GeoControlState, value: boolean) => {
    setControls((prev) => {
      if (key === "showEdgeOrigin") {
        return {
          ...prev,
          showEdgeOrigin: value,
          showPublicProbes: value,
          showPrivateProbes: !value,
        };
      }

      return { ...prev, [key]: value };
    });
  };

  const handleRegionChange = (value: string) => {
    setControls((prev) => ({
      ...prev,
      selectedRegion: value === "all" ? null : value,
    }));
  };

  if (isError) {
    return (
      <StatusPageRouteShell containerClassName="max-w-7xl">
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-medium">Unable to load geo view</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {(error as Error)?.message || "Please try again later"}
            </p>
          </div>
      </StatusPageRouteShell>
    );
  }

  if (geoData && geoData.success === false) {
    return (
      <StatusPageRouteShell containerClassName="max-w-7xl">
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-medium">Geo view unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {geoData.error?.message || "The geo view is disabled for this status page."}
            </p>
          </div>
      </StatusPageRouteShell>
    );
  }

  return (
    <StatusPageRouteShell containerClassName="max-w-7xl">
        <div className="mb-8">
          <Link
            href={`/status/${slug}`}
            className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Status
          </Link>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <MapPin className="h-6 w-6" />
                {statusPageName} - Geo View
              </h1>
              <p className="mt-1 text-muted-foreground">
                Geographic visualization of monitoring infrastructure
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedRegion && (
                <Badge variant="outline" className="gap-1">
                  <Layers3 className="h-3 w-3" />
                  Focused on {selectedRegion.name}
                </Badge>
              )}
              {stats.activeIncidents > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {stats.activeIncidents} Active Incident
                  {stats.activeIncidents > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatsCard
            icon={<Globe className="h-4 w-4" />}
            label="Total Regions"
            value={isLoading ? "-" : stats.totalRegions}
          />
          <StatsCard
            icon={<Activity className="h-4 w-4" />}
            label="Monitors"
            value={isLoading ? "-" : stats.totalMonitors}
          />
          <StatsCard
            icon={<div className="h-3 w-3 rounded-full bg-status-success-solid" />}
            label="Operational"
            value={isLoading ? "-" : stats.operationalMonitors}
            status="success"
          />
          <StatsCard
            icon={<div className="h-3 w-3 rounded-full bg-status-error-solid" />}
            label="Issues"
            value={isLoading ? "-" : stats.degradedMonitors + stats.downMonitors}
            status={stats.degradedMonitors + stats.downMonitors > 0 ? "error" : undefined}
          />
        </div>

        <div className="mb-4 rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Focus Region</div>
              <p className="text-sm text-muted-foreground">
                Filter the map and diagnostics to a single region when you need to inspect an issue.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={controls.selectedRegion ?? "all"}
                onValueChange={handleRegionChange}
                disabled={isLoading || (geoPayload?.regions.length ?? 0) === 0}
              >
                <SelectTrigger className="min-w-[220px]">
                  <SelectValue placeholder="All regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {(geoPayload?.regions ?? []).map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name} ({region.monitorCount} monitor
                      {region.monitorCount !== 1 ? "s" : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {controls.selectedRegion && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleRegionChange("all")}
                >
                  <X className="h-4 w-4" />
                  Clear focus
                </Button>
              )}
            </div>
          </div>
        </div>

        {!isLoading && (hasPublicProbes || hasPrivateProbes || hasQuorumConnections) && (
          <div className="mb-4">
            <GeoMapControls
              controls={controls}
              onControlChange={handleControlChange}
              hasPublicProbes={hasPublicProbes}
              hasPrivateProbes={hasPrivateProbes}
              hasQuorumConnections={hasQuorumConnections}
            />
          </div>
        )}

        <div className="mb-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[420px] md:h-[520px] xl:h-[620px]">
            {isLoading ? (
              <MapSkeleton />
            ) : focusedGeoData ? (
              <GeoMap
                regions={focusedGeoData.regions}
                monitors={focusedGeoData.monitors}
                probes={focusedGeoData.probes}
                incidents={focusedGeoData.incidents}
                quorumConnections={focusedGeoData.quorumConnections}
                controls={controls}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border bg-card">
                <div className="text-center">
                  <MapPin className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h2 className="text-lg font-medium">No regions configured</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    No monitors have been configured with regions yet.
                  </p>
                </div>
              </div>
            )}
          </div>

          <RegionInsightPanel
            selectedRegion={selectedRegion}
            visibleProbeMode={controls.showEdgeOrigin ? "edge" : "origin"}
            monitors={regionMonitors}
            incidents={regionIncidents}
            publicProbes={regionPublicProbes}
            privateProbes={regionPrivateProbes}
            visibleProbes={visibleRegionProbes}
            totalRegions={stats.totalRegions}
            totalLinks={focusedGeoData?.quorumConnections.length ?? 0}
          />
        </div>

        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Regions Overview</h2>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="mb-3 h-20 w-full" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : geoPayload && geoPayload.regions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {geoPayload.regions.map((region) => (
                <RegionCard
                  key={region.id}
                  region={region}
                  isSelected={region.id === controls.selectedRegion}
                  incidentCount={incidentCountsByRegion.get(region.id) ?? 0}
                  onSelect={() =>
                    handleRegionChange(
                      controls.selectedRegion === region.id ? "all" : region.id
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              No regions configured yet. Add monitors with region assignments to populate this view.
            </div>
          )}
        </div>
    </StatusPageRouteShell>
  );
}

interface RegionInsightPanelProps {
  selectedRegion: GeoRegion | null;
  visibleProbeMode: "edge" | "origin";
  monitors: GeoMonitor[];
  incidents: GeoIncident[];
  publicProbes: GeoProbe[];
  privateProbes: GeoProbe[];
  visibleProbes: GeoProbe[];
  totalRegions: number;
  totalLinks: number;
}

function RegionInsightPanel({
  selectedRegion,
  visibleProbeMode,
  monitors,
  incidents,
  publicProbes,
  privateProbes,
  visibleProbes,
  totalRegions,
  totalLinks,
}: RegionInsightPanelProps) {
  return (
    <aside className="rounded-lg border bg-card p-4">
      {selectedRegion ? (
        <>
          <div className="mb-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Region Focus
            </div>
            <h2 className="mt-1 text-xl font-semibold">{selectedRegion.name}</h2>
            <p className="text-sm text-muted-foreground">{selectedRegion.location}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FocusMetric label="Monitors" value={monitors.length} />
            <FocusMetric label="Incidents" value={incidents.length} />
            <FocusMetric label="Edge Probes" value={publicProbes.length} />
            <FocusMetric label="Origin Probes" value={privateProbes.length} />
          </div>

          <div className="mt-5 space-y-5">
            <DetailList
              title={`Visible ${visibleProbeMode === "edge" ? "Edge" : "Origin"} Probes`}
              emptyLabel={`No ${visibleProbeMode} probes mapped to this region.`}
              items={visibleProbes.map((probe) => (
                <ListRow
                  key={probe.id}
                  title={probe.name}
                  meta={probe.status}
                  accent={probe.status === "active" ? "success" : "muted"}
                />
              ))}
            />

            <DetailList
              title="Monitors"
              emptyLabel="No monitors mapped to this region."
              items={monitors.slice(0, 6).map((monitor) => (
                <ListRow
                  key={monitor.id}
                  title={monitor.name}
                  meta={monitor.status}
                  accent={
                    monitor.status === "active"
                      ? "success"
                      : monitor.status === "degraded"
                      ? "warning"
                      : monitor.status === "down"
                      ? "danger"
                      : "muted"
                  }
                />
              ))}
            />

            <DetailList
              title="Active Incidents"
              emptyLabel="No active incidents affecting this region."
              items={incidents.map((incident) => (
                <ListRow
                  key={incident.id}
                  title={incident.title}
                  meta={incident.severity}
                  accent={incident.severity === "critical" ? "danger" : "warning"}
                />
              ))}
            />
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Geo Summary
            </div>
            <h2 className="mt-1 text-xl font-semibold">All Regions</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Focus a region to inspect its monitors, incidents, and probe coverage without
              leaving the map.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <FocusMetric label="Regions" value={totalRegions} />
            <FocusMetric label="Region Links" value={totalLinks} />
            <FocusMetric label="Probe Mode" value={visibleProbeMode === "edge" ? "Edge" : "Origin"} />
            <FocusMetric label="Selection" value="Global" />
          </div>
        </div>
      )}
    </aside>
  );
}

interface FocusMetricProps {
  label: string;
  value: string | number;
}

function FocusMetric({ label, value }: FocusMetricProps) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

interface DetailListProps {
  title: string;
  emptyLabel: string;
  items: React.ReactNode[];
}

function DetailList({ title, emptyLabel, items }: DetailListProps) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      {items.length > 0 ? (
        <div className="space-y-2">{items}</div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

interface ListRowProps {
  title: string;
  meta: string;
  accent: "success" | "warning" | "danger" | "muted";
}

function ListRow({ title, meta, accent }: ListRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
      </div>
      <span
        className={cn(
          "ml-3 shrink-0 rounded-full px-2 py-1 text-xs font-medium capitalize",
          accent === "success" && "bg-status-success-solid/10 text-status-success-solid",
          accent === "warning" && "bg-status-warning-solid/10 text-status-warning-solid",
          accent === "danger" && "bg-status-error-solid/10 text-status-error-solid",
          accent === "muted" && "bg-muted text-muted-foreground"
        )}
      >
        {meta}
      </span>
    </div>
  );
}

interface RegionCardProps {
  region: GeoRegion;
  isSelected: boolean;
  incidentCount: number;
  onSelect: () => void;
}

function RegionCard({ region, isSelected, incidentCount, onSelect }: RegionCardProps) {
  const statusColor =
    region.status === "active"
      ? "bg-status-success-solid"
      : region.status === "degraded"
      ? "bg-status-warning-solid"
      : region.status === "down"
      ? "bg-status-error-solid"
      : "bg-status-gray-solid";

  const statusLabel =
    region.status === "active"
      ? "Operational"
      : region.status === "degraded"
      ? "Degraded"
      : region.status === "down"
      ? "Down"
      : "Pending";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40",
        isSelected && "border-primary ring-2 ring-primary/20"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{region.name}</div>
          <div className="text-sm text-muted-foreground">{region.location}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", statusColor)} />
          <span className="text-sm">{statusLabel}</span>
        </div>
      </div>

      {region.latency ? (
        <div className="mb-3 rounded-lg bg-muted/50 p-3">
          <div className="mb-2 text-xs text-muted-foreground">Response Time</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <LatencyValue label="P50" value={region.latency.p50} />
            <LatencyValue label="P95" value={region.latency.p95} />
            <LatencyValue label="P99" value={region.latency.p99} />
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          No latency data available
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {region.monitorCount} monitor{region.monitorCount !== 1 ? "s" : ""}
        </span>
        <span>
          {region.probeCount} probe{region.probeCount !== 1 ? "s" : ""}
        </span>
        <span>
          {incidentCount} incident{incidentCount !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}

interface LatencyValueProps {
  label: string;
  value: number;
}

function LatencyValue({ label, value }: LatencyValueProps) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}ms</div>
    </div>
  );
}
