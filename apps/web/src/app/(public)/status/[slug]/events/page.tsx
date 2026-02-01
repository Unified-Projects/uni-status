"use client";

import { useState, useMemo, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  AlertTriangle,
  Search,
  Clock,
  CheckCircle,
  Wrench,
  Filter,
  X,
  Bell,
} from "lucide-react";
import { cn, Button, Input, Badge } from "@uni-status/ui";
import type { UnifiedEvent, EventType } from "@uni-status/shared";
import { PublicEventCard } from "@/components/public-status/events/public-event-card";
import { PublicEventTimeline } from "@/components/public-status/events/public-event-timeline";
import {
  PublicEventFilters,
  type PublicEventFiltersState,
} from "@/components/public-status/events/public-event-filters";

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

const DEFAULT_PRIMARY = "#3b82f6";

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return null;
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

const hslToString = (hsl: { h: number; s: number; l: number }) =>
  `${hsl.h} ${hsl.s}% ${hsl.l}%`;

const getContrastingText = (hex: string): string => {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
};

function buildThemeStyles(theme?: { primaryColor?: string }): CSSProperties {
  if (!theme) return {};
  const styles: CSSProperties & Record<string, string> = {};
  const primaryHex = theme.primaryColor || DEFAULT_PRIMARY;
  const primaryHsl = hexToHsl(primaryHex);
  if (primaryHsl) {
    const primaryString = hslToString(primaryHsl);
    styles["--primary"] = primaryString;
    styles["--ring"] = primaryString;

    const primaryForeground = hexToHsl(getContrastingText(primaryHex));
    if (primaryForeground) {
      styles["--primary-foreground"] = hslToString(primaryForeground);
    }
  }

  return styles;
}

interface EventsResponse {
  success: boolean;
  data?: {
    events: UnifiedEvent[];
    total: number;
    hasMore: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface FetchEventsParams {
  types?: string[];
  status?: string[];
  search?: string;
  severity?: string[];
  monitors?: string[];
  regions?: string[];
}

async function fetchPublicEvents(
  slug: string,
  params: FetchEventsParams
): Promise<EventsResponse> {
  const searchParams = new URLSearchParams();

  if (params.types?.length) {
    searchParams.set("types", params.types.join(","));
  }
  if (params.status?.length) {
    searchParams.set("status", params.status.join(","));
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.severity?.length) {
    searchParams.set("severity", params.severity.join(","));
  }
  if (params.monitors?.length) {
    searchParams.set("monitors", params.monitors.join(","));
  }
  if (params.regions?.length) {
    searchParams.set("regions", params.regions.join(","));
  }

  const response = await fetch(
    `${getApiUrl()}/public/status-pages/${slug}/events?${searchParams.toString()}`,
    {
      credentials: "include",
    }
  );

  return response.json();
}

interface StatusPageResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    slug: string;
    theme?: {
      name: string;
      primaryColor?: string;
      customCss?: string;
      colorMode?: "system" | "light" | "dark";
    };
    monitors: Array<{
      id: string;
      name: string;
      regions: string[];
    }>;
  };
  error?: { code: string; message: string };
}

async function fetchStatusPageData(slug: string): Promise<StatusPageResponse> {
  const response = await fetch(`${getApiUrl()}/public/status-pages/${slug}`, {
    credentials: "include",
  });
  return response.json();
}

type TabFilter = "all" | "active" | "resolved" | "incidents" | "maintenance";

export default function PublicEventsPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;

  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");
  const [advancedFilters, setAdvancedFilters] = useState<PublicEventFiltersState>({
    severity: [],
    monitors: [],
    regions: [],
  });

  // Detect if we're on a custom domain (client-side)
  const [basePath, setBasePath] = useState(`/status/${slug}`);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const appHostname = new URL(appUrl).hostname;
      const currentHostname = window.location.hostname;
      // If we're on a custom domain, use empty basePath
      if (currentHostname !== appHostname && currentHostname !== "localhost") {
        setBasePath("");
      }
    }
  }, []);

  // Fetch status page data for monitors and regions
  const { data: statusPageData } = useQuery({
    queryKey: ["public-status-page", slug],
    queryFn: () => fetchStatusPageData(slug),
    enabled: !!slug,
    staleTime: 60000,
  });

  const themeStyles = useMemo(
    () => buildThemeStyles(statusPageData?.data?.theme),
    [statusPageData?.data?.theme]
  );

  useEffect(() => {
    const colorMode = statusPageData?.data?.theme?.colorMode;
    if (!colorMode || colorMode === "system") return;
    document.documentElement.classList.toggle("dark", colorMode === "dark");
  }, [statusPageData?.data?.theme?.colorMode]);

  // Extract available monitors and regions
  const availableMonitors = useMemo(() => {
    if (!statusPageData?.data?.monitors) return [];
    return statusPageData.data.monitors.map((m) => ({
      id: m.id,
      name: m.name,
    }));
  }, [statusPageData]);

  const availableRegions = useMemo(() => {
    if (!statusPageData?.data?.monitors) return [];
    const regionSet = new Set<string>();
    statusPageData.data.monitors.forEach((m) => {
      (m.regions || []).forEach((r) => regionSet.add(r));
    });
    return Array.from(regionSet).sort();
  }, [statusPageData]);

  // Build query params based on tab filter and advanced filters
  const queryParams = useMemo(() => {
    const p: FetchEventsParams = {};

    switch (tabFilter) {
      case "active":
        p.status = ["investigating", "identified", "monitoring", "scheduled", "active"];
        break;
      case "resolved":
        p.status = ["resolved", "completed"];
        break;
      case "incidents":
        p.types = ["incident"];
        break;
      case "maintenance":
        p.types = ["maintenance"];
        break;
    }

    if (searchQuery.trim()) {
      p.search = searchQuery.trim();
    }

    // Add advanced filters
    if (advancedFilters.severity.length > 0) {
      p.severity = advancedFilters.severity;
    }
    if (advancedFilters.monitors.length > 0) {
      p.monitors = advancedFilters.monitors;
    }
    if (advancedFilters.regions.length > 0) {
      p.regions = advancedFilters.regions;
    }

    return p;
  }, [tabFilter, searchQuery, advancedFilters]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-events", slug, queryParams],
    queryFn: () => fetchPublicEvents(slug, queryParams),
    enabled: !!slug,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const events = data?.data?.events || [];

  // Calculate counts for tabs (from all data, not filtered)
  const { data: allData } = useQuery({
    queryKey: ["public-events", slug, {}],
    queryFn: () => fetchPublicEvents(slug, {}),
    enabled: !!slug,
    staleTime: 30000,
  });

  const counts = useMemo(() => {
    if (!allData?.data?.events) {
      return { all: 0, active: 0, resolved: 0, incidents: 0, maintenance: 0 };
    }

    const allEvents = allData.data.events;
    const activeStatuses = ["investigating", "identified", "monitoring", "scheduled", "active"];
    const resolvedStatuses = ["resolved", "completed"];

    return {
      all: allEvents.length,
      active: allEvents.filter((e) => activeStatuses.includes(e.status)).length,
      resolved: allEvents.filter((e) => resolvedStatuses.includes(e.status)).length,
      incidents: allEvents.filter((e) => e.type === "incident").length,
      maintenance: allEvents.filter((e) => e.type === "maintenance").length,
    };
  }, [allData]);

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-lg font-semibold">Failed to load events</h2>
            <p className="mt-2 text-muted-foreground">
              {data?.error?.message || "An error occurred while loading events."}
            </p>
            <Button onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={themeStyles}>
      {statusPageData?.data?.theme?.customCss && (
        <style dangerouslySetInnerHTML={{ __html: statusPageData.data.theme.customCss }} />
      )}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`${basePath}/` || "/"}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Status Page
          </Link>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="mt-1 text-muted-foreground">
            Incidents and scheduled maintenance affecting this service
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <TabButton
            active={tabFilter === "all"}
            onClick={() => setTabFilter("all")}
            count={counts.all}
          >
            All
          </TabButton>
          <TabButton
            active={tabFilter === "active"}
            onClick={() => setTabFilter("active")}
            count={counts.active}
            highlight={counts.active > 0}
          >
            Active
          </TabButton>
          <TabButton
            active={tabFilter === "resolved"}
            onClick={() => setTabFilter("resolved")}
            count={counts.resolved}
          >
            Resolved
          </TabButton>
          <TabButton
            active={tabFilter === "incidents"}
            onClick={() => setTabFilter("incidents")}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          >
            Incidents
          </TabButton>
          <TabButton
            active={tabFilter === "maintenance"}
            onClick={() => setTabFilter("maintenance")}
            icon={<Calendar className="h-3.5 w-3.5" />}
          >
            Maintenance
          </TabButton>
        </div>

        {/* Search, Filters, and View Toggle */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PublicEventFilters
                filters={advancedFilters}
                onFiltersChange={setAdvancedFilters}
                availableMonitors={availableMonitors}
                availableRegions={availableRegions}
              />
              <div className="flex items-center rounded-md border">
                <Button
                  variant={viewMode === "timeline" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => setViewMode("timeline")}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Timeline
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => setViewMode("list")}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  List
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Events Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          (() => {
            const hasAdvancedFilters =
              advancedFilters.severity.length > 0 ||
              advancedFilters.monitors.length > 0 ||
              advancedFilters.regions.length > 0;
            const hasAnyFilters = searchQuery || tabFilter !== "all" || hasAdvancedFilters;

            return (
              <div className="text-center py-12 border rounded-lg bg-muted/30">
                <CheckCircle className="mx-auto h-12 w-12 text-status-success-solid" />
                <h2 className="mt-4 text-lg font-semibold">
                  {hasAnyFilters
                    ? "No events match your filters"
                    : "All systems operational"}
                </h2>
                <p className="mt-2 text-muted-foreground">
                  {hasAnyFilters
                    ? "Try adjusting your search or filter criteria."
                    : "There are no incidents or scheduled maintenance at this time."}
                </p>
                {hasAnyFilters && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setTabFilter("all");
                      setAdvancedFilters({ severity: [], monitors: [], regions: [] });
                    }}
                    className="mt-4"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            );
          })()
        ) : viewMode === "timeline" ? (
          <PublicEventTimeline events={events} slug={slug} basePath={basePath} />
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <PublicEventCard
                key={`${event.type}-${event.id}`}
                event={event}
                slug={slug}
                basePath={basePath}
              />
            ))}
          </div>
        )}

        {/* Subscribe prompt */}
        {events.length > 0 && (
          <div className="mt-12 border-t pt-8">
            <div className="text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">Stay updated</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                Subscribe to individual events to receive notifications about status changes and updates.
              </p>
              <Link href={`${basePath}/` || "/"}>
                <Button variant="outline" className="mt-4">
                  Go to Status Page
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  highlight?: boolean;
  icon?: React.ReactNode;
}

function TabButton({
  active,
  onClick,
  children,
  count,
  highlight,
  icon,
}: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted hover:bg-muted/80 text-muted-foreground"
      )}
    >
      {icon}
      {children}
      {count !== undefined && (
        <Badge
          variant={active ? "secondary" : "outline"}
          className={cn(
            "h-5 px-1.5 text-xs",
            highlight && !active && "bg-status-warning-solid text-white border-status-warning-solid"
          )}
        >
          {count}
        </Badge>
      )}
    </button>
  );
}
