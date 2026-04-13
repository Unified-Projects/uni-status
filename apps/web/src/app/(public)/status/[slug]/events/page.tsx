"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Filter,
  Search,
  X,
} from "lucide-react";
import { Badge, Button, Input, cn } from "@uni-status/ui";
import type { UnifiedEvent } from "@uni-status/shared";
import { PublicEventCard } from "@/components/public-status/events/public-event-card";
import { PublicEventTimeline } from "@/components/public-status/events/public-event-timeline";
import {
  PublicEventFilters,
  type PublicEventFiltersState,
} from "@/components/public-status/events/public-event-filters";
import { StatusPageRouteShell } from "@/components/public-status";
import { useStatusPage } from "../status-page-context";

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const PAGE_SIZE = 20;

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
    // Fall back to configured API URL when URL parsing fails.
  }
  return DEFAULT_API_URL;
}

interface EventCounts {
  all: number;
  active: number;
  resolved: number;
  incidents: number;
  maintenance: number;
}

interface EventsResponse {
  success: boolean;
  data?: {
    events: UnifiedEvent[];
    total: number;
    hasMore: boolean;
    counts: EventCounts;
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
  limit?: number;
  offset?: number;
}

type TabFilter = "all" | "active" | "resolved" | "incidents" | "maintenance";
type ViewMode = "timeline" | "list";

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTabFilter(value: string | null): TabFilter {
  switch (value) {
    case "active":
    case "resolved":
    case "incidents":
    case "maintenance":
      return value;
    default:
      return "all";
  }
}

function parseViewMode(value: string | null): ViewMode {
  return value === "list" ? "list" : "timeline";
}

async function fetchPublicEvents(
  slug: string,
  params: FetchEventsParams
): Promise<EventsResponse> {
  const searchParams = new URLSearchParams();

  if (params.types?.length) searchParams.set("types", params.types.join(","));
  if (params.status?.length) searchParams.set("status", params.status.join(","));
  if (params.search) searchParams.set("search", params.search);
  if (params.severity?.length) searchParams.set("severity", params.severity.join(","));
  if (params.monitors?.length) searchParams.set("monitors", params.monitors.join(","));
  if (params.regions?.length) searchParams.set("regions", params.regions.join(","));
  if (typeof params.limit === "number") searchParams.set("limit", String(params.limit));
  if (typeof params.offset === "number") searchParams.set("offset", String(params.offset));

  const response = await fetch(
    `${getApiUrl()}/public/status-pages/${slug}/events?${searchParams.toString()}`,
    { credentials: "include" }
  );

  return response.json();
}

export default function PublicEventsPage() {
  const params = useParams<{ slug: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const { monitors: contextMonitors } = useStatusPage();

  const urlTabFilter = parseTabFilter(searchParams.get("tab"));
  const urlViewMode = parseViewMode(searchParams.get("view"));
  const urlSearch = searchParams.get("q") ?? "";
  const advancedFilters = useMemo<PublicEventFiltersState>(
    () => ({
      severity: parseCsvParam(searchParams.get("severity")),
      monitors: parseCsvParam(searchParams.get("monitors")),
      regions: parseCsvParam(searchParams.get("regions")),
    }),
    [searchParams]
  );

  const [searchInput, setSearchInput] = useState(urlSearch);
  const deferredSearchQuery = useDeferredValue(searchInput.trim());

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  const basePath = pathname.endsWith("/events")
    ? pathname.slice(0, -"/events".length)
    : `/status/${slug}`;

  const availableMonitors = useMemo(
    () => contextMonitors.map((monitor) => ({ id: monitor.id, name: monitor.name })),
    [contextMonitors]
  );

  const availableRegions = useMemo(() => {
    const regionSet = new Set<string>();
    contextMonitors.forEach((monitor) =>
      monitor.regions.forEach((region) => regionSet.add(region))
    );
    return Array.from(regionSet).sort();
  }, [contextMonitors]);

  const updateUrlState = (
    updates: Record<string, string | string[] | null>,
    options?: { replace?: boolean }
  ) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
        nextParams.delete(key);
        continue;
      }

      nextParams.set(key, Array.isArray(value) ? value.join(",") : value);
    }

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    startTransition(() => {
      if (options?.replace ?? true) {
        router.replace(nextUrl, { scroll: false });
      } else {
        router.push(nextUrl, { scroll: false });
      }
    });
  };

  useEffect(() => {
    if (deferredSearchQuery === urlSearch) {
      return;
    }

    updateUrlState({ q: deferredSearchQuery || null }, { replace: true });
  }, [deferredSearchQuery, urlSearch]);

  const queryParams = useMemo<FetchEventsParams>(() => {
    const nextParams: FetchEventsParams = {};

    switch (urlTabFilter) {
      case "active":
        nextParams.status = ["investigating", "identified", "monitoring", "scheduled", "active"];
        break;
      case "resolved":
        nextParams.status = ["resolved", "completed"];
        break;
      case "incidents":
        nextParams.types = ["incident"];
        break;
      case "maintenance":
        nextParams.types = ["maintenance"];
        break;
    }

    if (deferredSearchQuery) nextParams.search = deferredSearchQuery;
    if (advancedFilters.severity.length > 0) nextParams.severity = advancedFilters.severity;
    if (advancedFilters.monitors.length > 0) nextParams.monitors = advancedFilters.monitors;
    if (advancedFilters.regions.length > 0) nextParams.regions = advancedFilters.regions;

    return nextParams;
  }, [advancedFilters, deferredSearchQuery, urlTabFilter]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["public-events", slug, queryParams],
    queryFn: ({ pageParam = 0 }) =>
      fetchPublicEvents(slug, {
        ...queryParams,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.data?.hasMore) {
        return undefined;
      }

      return pages.reduce(
        (sum, page) => sum + (page.data?.events.length ?? 0),
        0
      );
    },
    enabled: !!slug,
    refetchInterval: 30_000,
  });

  const { data: countsData } = useQuery({
    queryKey: ["public-events-counts", slug],
    queryFn: () => fetchPublicEvents(slug, { limit: 1, offset: 0 }),
    enabled: !!slug,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const events = useMemo(
    () => data?.pages.flatMap((page) => page.data?.events ?? []) ?? [],
    [data]
  );

  const filteredTotal = data?.pages[0]?.data?.total ?? 0;
  const counts = countsData?.data?.counts ?? {
    all: 0,
    active: 0,
    resolved: 0,
    incidents: 0,
    maintenance: 0,
  };

  const hasAdvancedFilters =
    advancedFilters.severity.length > 0 ||
    advancedFilters.monitors.length > 0 ||
    advancedFilters.regions.length > 0;
  const hasAnyFilters = searchInput.trim() || urlTabFilter !== "all" || hasAdvancedFilters;

  if (isError) {
    return (
      <StatusPageRouteShell containerClassName="max-w-4xl">
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-lg font-semibold">Failed to load events</h2>
            <p className="mt-2 text-muted-foreground">
              {(error as Error)?.message || "An error occurred while loading events."}
            </p>
            <Button onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </div>
      </StatusPageRouteShell>
    );
  }

  return (
    <StatusPageRouteShell containerClassName="max-w-4xl">
        <div className="mb-8">
          <Link
            href={basePath || "/"}
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Status Page
          </Link>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="mt-1 text-muted-foreground">
            Incidents and scheduled maintenance affecting this service
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <TabButton
            active={urlTabFilter === "all"}
            onClick={() => updateUrlState({ tab: null }, { replace: false })}
            count={counts.all}
          >
            All
          </TabButton>
          <TabButton
            active={urlTabFilter === "active"}
            onClick={() => updateUrlState({ tab: "active" }, { replace: false })}
            count={counts.active}
            highlight={counts.active > 0}
          >
            Active
          </TabButton>
          <TabButton
            active={urlTabFilter === "resolved"}
            onClick={() => updateUrlState({ tab: "resolved" }, { replace: false })}
            count={counts.resolved}
          >
            Resolved
          </TabButton>
          <TabButton
            active={urlTabFilter === "incidents"}
            onClick={() => updateUrlState({ tab: "incidents" }, { replace: false })}
            count={counts.incidents}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          >
            Incidents
          </TabButton>
          <TabButton
            active={urlTabFilter === "maintenance"}
            onClick={() => updateUrlState({ tab: "maintenance" }, { replace: false })}
            count={counts.maintenance}
            icon={<Calendar className="h-3.5 w-3.5" />}
          >
            Maintenance
          </TabButton>
        </div>

        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="pl-9"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <PublicEventFilters
                filters={advancedFilters}
                onFiltersChange={(nextFilters) =>
                  updateUrlState(
                    {
                      severity: nextFilters.severity,
                      monitors: nextFilters.monitors,
                      regions: nextFilters.regions,
                    },
                    { replace: false }
                  )
                }
                availableMonitors={availableMonitors}
                availableRegions={availableRegions}
              />

              <div className="flex items-center rounded-md border">
                <Button
                  variant={urlViewMode === "timeline" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => updateUrlState({ view: null }, { replace: false })}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Timeline
                </Button>
                <Button
                  variant={urlViewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => updateUrlState({ view: "list" }, { replace: false })}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  List
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading events..."
                : `${filteredTotal} event${filteredTotal !== 1 ? "s" : ""} found`}
            </div>

            {hasAnyFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  updateUrlState(
                    {
                      tab: null,
                      view: null,
                      q: null,
                      severity: null,
                      monitors: null,
                      regions: null,
                    },
                    { replace: false }
                  );
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-32 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 py-12 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-status-success-solid" />
            <h2 className="mt-4 text-lg font-semibold">
              {hasAnyFilters ? "No events match your filters" : "All systems operational"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {hasAnyFilters
                ? "Try adjusting your search or filter criteria."
                : "There are no incidents or scheduled maintenance at this time."}
            </p>
          </div>
        ) : (
          <>
            {urlViewMode === "timeline" ? (
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

            {hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading more..." : "Load more events"}
                </Button>
              </div>
            )}
          </>
        )}

        {events.length > 0 && (
          <div className="mt-12 border-t pt-8">
            <div className="text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">Stay updated</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Subscribe to individual events to receive notifications about status changes and
                updates.
              </p>
              <Link href={basePath || "/"}>
                <Button variant="outline" className="mt-4">
                  Go to Status Page
                </Button>
              </Link>
            </div>
          </div>
        )}
    </StatusPageRouteShell>
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

function TabButton({ active, onClick, children, count, highlight, icon }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      {icon}
      {children}
      {count !== undefined && (
        <Badge
          variant={active ? "secondary" : "outline"}
          className={cn(
            "h-5 px-1.5 text-xs",
            highlight && !active && "border-status-warning-solid bg-status-warning-solid text-white"
          )}
        >
          {count}
        </Badge>
      )}
    </button>
  );
}
