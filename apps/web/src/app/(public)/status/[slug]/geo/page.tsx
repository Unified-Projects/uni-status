"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, AlertTriangle, Activity, Globe } from "lucide-react";
import { cn, Badge, Skeleton } from "@uni-status/ui";
import { GeoMapControls } from "@/components/public-status/geo/geo-map-controls";
import type {
  GeoResponse,
  GeoControlState,
  GeoRegion,
  GeoMonitor,
  GeoProbe,
  GeoIncident,
  GeoQuorumConnection,
} from "@/components/public-status/geo/types";

// Default API URL - will be overridden to relative URL on custom domains
const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

// Helper to get API URL - uses relative URL on custom domains to avoid CORS issues
function getApiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const appHostname = new URL(appUrl).hostname;
    const currentHostname = window.location.hostname;
    // On custom domains, use relative URLs so requests go through the same domain
    if (currentHostname !== appHostname && currentHostname !== "localhost") {
      return "/api";
    }
  } catch {
    // If URL parsing fails, use default
  }
  return DEFAULT_API_URL;
}

// Dynamically import the map component to avoid SSR issues
const GeoMap = dynamic(
  () => import("@/components/public-status/geo/geo-map").then((mod) => mod.GeoMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
);

interface StatusPageResponse {
  success: boolean;
  data?: {
    statusPage: {
      id: string;
      name: string;
      slug: string;
    };
  };
  error?: { code: string; message: string };
}

async function fetchGeoData(slug: string): Promise<GeoResponse> {
  const response = await fetch(`${getApiUrl()}/public/status-pages/${slug}/geo`, {
    credentials: "include",
  });
  return response.json();
}

async function fetchStatusPageData(slug: string): Promise<StatusPageResponse> {
  const response = await fetch(`${getApiUrl()}/public/status-pages/${slug}`, {
    credentials: "include",
  });
  return response.json();
}

// Map skeleton for loading state
function MapSkeleton() {
  return (
    <div className="w-full h-[600px] rounded-lg border bg-card animate-pulse flex items-center justify-center">
      <div className="text-center">
        <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    </div>
  );
}

// Stats card component
interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  status?: "success" | "warning" | "error";
}

function StatsCard({ icon, label, value, status }: StatsCardProps) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-bold mt-1",
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

  // Control state for map overlays
  const [controls, setControls] = useState<GeoControlState>({
    showPublicProbes: true,
    showPrivateProbes: false,
    showEdgeOrigin: true, // Default to Edge mode (showing public/edge probes)
    showQuorumConnections: true,
    selectedRegion: null,
  });

  // Fetch status page data for name
  const { data: statusPageData } = useQuery({
    queryKey: ["public-status-page", slug],
    queryFn: () => fetchStatusPageData(slug),
    enabled: !!slug,
    staleTime: 60000,
  });

  // Fetch geo data
  const {
    data: geoData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["public-geo", slug],
    queryFn: () => fetchGeoData(slug),
    enabled: !!slug,
    staleTime: 30000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Handle control changes
  const handleControlChange = (key: keyof GeoControlState, value: boolean) => {
    setControls((prev) => ({ ...prev, [key]: value }));
  };

  // Calculate stats
  const stats = useMemo(() => {
    if (!geoData?.data) {
      return {
        totalRegions: 0,
        totalMonitors: 0,
        activeIncidents: 0,
        operationalMonitors: 0,
        degradedMonitors: 0,
        downMonitors: 0,
      };
    }

    const { regions, incidents } = geoData.data;

    return {
      totalRegions: regions.length,
      totalMonitors: regions.reduce((sum, r) => sum + r.monitorCount, 0),
      activeIncidents: incidents.length,
      operationalMonitors: regions.reduce((sum, r) => sum + (r.status === "active" ? r.monitorCount : 0), 0),
      degradedMonitors: regions.reduce((sum, r) => sum + (r.status === "degraded" ? r.monitorCount : 0), 0),
      downMonitors: regions.reduce((sum, r) => sum + (r.status === "down" ? r.monitorCount : 0), 0),
    };
  }, [geoData]);

  const statusPageName = statusPageData?.data?.statusPage?.name || "Status";

  // Check if we have probes or connections for controls
  const hasPublicProbes = (geoData?.data?.probes.public.length ?? 0) > 0;
  const hasPrivateProbes = (geoData?.data?.probes.private.length ?? 0) > 0;
  const hasQuorumConnections = (geoData?.data?.quorumConnections.length ?? 0) > 0;

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium">Unable to load geo view</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {(error as Error)?.message || "Please try again later"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (geoData && geoData.success === false) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium">Geo view unavailable</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {geoData.error?.message || "The geo view is disabled for this status page."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/status/${slug}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Status
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <MapPin className="h-6 w-6" />
                {statusPageName} - Geo View
              </h1>
              <p className="text-muted-foreground mt-1">
                Geographic visualization of monitoring infrastructure
              </p>
            </div>

            {stats.activeIncidents > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {stats.activeIncidents} Active Incident
                {stats.activeIncidents > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            icon={
              <div className="w-3 h-3 rounded-full bg-status-success-solid" />
            }
            label="Operational"
            value={isLoading ? "-" : stats.operationalMonitors}
            status="success"
          />
          <StatsCard
            icon={
              <div className="w-3 h-3 rounded-full bg-status-error-solid" />
            }
            label="Issues"
            value={isLoading ? "-" : stats.degradedMonitors + stats.downMonitors}
            status={stats.degradedMonitors + stats.downMonitors > 0 ? "error" : undefined}
          />
        </div>

        {/* Map Controls */}
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

        {/* Map */}
        <div className="h-[600px]">
          {isLoading ? (
            <MapSkeleton />
          ) : geoData?.data ? (
            <GeoMap
              regions={geoData.data.regions}
              monitors={geoData.data.monitors}
              probes={geoData.data.probes}
              incidents={geoData.data.incidents}
              quorumConnections={geoData.data.quorumConnections}
              controls={controls}
            />
          ) : (
            <div className="w-full h-full rounded-lg border bg-card flex items-center justify-center">
              <div className="text-center">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-lg font-medium">No regions configured</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  No monitors have been configured with regions yet.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Region list (below map) */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Regions Overview</h2>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card rounded-lg border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-20 w-full mb-3" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : geoData?.data && geoData.data.regions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {geoData.data.regions.map((region) => (
                <RegionCard key={region.id} region={region} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              No regions configured yet. Add monitors with region assignments to populate this view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RegionCardProps {
  region: GeoRegion;
}

function RegionCard({ region }: RegionCardProps) {
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
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold">{region.name}</div>
          <div className="text-sm text-muted-foreground">{region.location}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", statusColor)} />
          <span className="text-sm">{statusLabel}</span>
        </div>
      </div>

      {/* Latency */}
      {region.latency && (
        <div className="bg-muted/50 rounded-lg p-3 mb-3">
          <div className="text-xs text-muted-foreground mb-2">Response Time</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-muted-foreground">P50</div>
              <div className="font-mono font-semibold text-sm">
                {region.latency.p50}ms
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">P95</div>
              <div className="font-mono font-semibold text-sm">
                {region.latency.p95}ms
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">P99</div>
              <div className="font-mono font-semibold text-sm">
                {region.latency.p99}ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{region.monitorCount} monitor{region.monitorCount !== 1 ? "s" : ""}</span>
        {region.probeCount > 0 && (
          <span>{region.probeCount} probe{region.probeCount !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
