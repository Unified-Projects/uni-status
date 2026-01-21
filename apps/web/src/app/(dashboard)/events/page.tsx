"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Calendar,
  AlertTriangle,
  LayoutGrid,
  List,
  Clock,
  CheckCircle,
  LayoutList,
} from "lucide-react";
import {
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@uni-status/ui";
import { useEvents, useSubscribeToEvent, useUnsubscribeFromEvent } from "@/hooks/use-events";
import { useMonitors } from "@/hooks/use-monitors";
import { useResolveIncident } from "@/hooks/use-incidents";
import {
  EventCard,
  EventFilters,
  EventsFeedTimeline,
} from "@/components/events";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/pagination";
import type { EventsListParams, EventType, UnifiedEvent } from "@/lib/api-client";

type ViewType = "grid" | "list" | "timeline";
type TabFilter = "all" | "active" | "resolved" | "incidents" | "maintenance";

export default function EventsPage() {
  const router = useRouter();
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [viewType, setViewType] = useState<ViewType>("grid");
  const [filters, setFilters] = useState<EventsListParams>({});
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [incidentToResolve, setIncidentToResolve] = useState<string | null>(null);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [eventToSubscribe, setEventToSubscribe] = useState<{ type: EventType; id: string } | null>(null);

  // Pagination
  const { page, setPage, resetPage, paginationParams } = usePagination();

  // Reset pagination when tab filter or filters change
  useEffect(() => {
    resetPage();
  }, [tabFilter, filters, resetPage]);

  // Build query params based on tab and filters
  const queryParams = useMemo(() => {
    const params: EventsListParams = { ...filters, ...paginationParams };

    switch (tabFilter) {
      case "active":
        params.status = ["investigating", "identified", "monitoring", "scheduled", "active"];
        break;
      case "resolved":
        params.status = ["resolved", "completed"];
        break;
      case "incidents":
        params.types = ["incident"];
        break;
      case "maintenance":
        params.types = ["maintenance"];
        break;
    }

    return params;
  }, [tabFilter, filters, paginationParams]);

  // Data fetching
  const { data: eventsResponse, isLoading, error, refetch } = useEvents(queryParams);
  const { data: monitorsResponse } = useMonitors();
  const monitors = monitorsResponse?.data;

  // Mutations
  const resolveIncident = useResolveIncident();
  const subscribeToEvent = useSubscribeToEvent();
  const unsubscribeFromEvent = useUnsubscribeFromEvent();

  // Calculate counts for tabs
  const counts = useMemo(() => {
    if (!eventsResponse?.events) return { all: 0, active: 0, resolved: 0, incidents: 0, maintenance: 0 };

    const events = eventsResponse.events;
    const activeStatuses = ["investigating", "identified", "monitoring", "scheduled", "active"];
    const resolvedStatuses = ["resolved", "completed"];

    return {
      all: eventsResponse.total,
      active: events.filter((e) => activeStatuses.includes(e.status)).length,
      resolved: events.filter((e) => resolvedStatuses.includes(e.status)).length,
      incidents: events.filter((e) => e.type === "incident").length,
      maintenance: events.filter((e) => e.type === "maintenance").length,
    };
  }, [eventsResponse]);

  // Handlers
  const handleResolve = (id: string) => {
    setIncidentToResolve(id);
    setResolveDialogOpen(true);
  };

  const confirmResolve = async () => {
    if (!incidentToResolve) return;
    await resolveIncident.mutateAsync(incidentToResolve);
    setResolveDialogOpen(false);
    setIncidentToResolve(null);
  };

  const handleSubscribe = async (event: UnifiedEvent) => {
    if (event.isSubscribed) {
      await unsubscribeFromEvent.mutateAsync({ type: event.type, id: event.id });
    } else {
      await subscribeToEvent.mutateAsync({ type: event.type, id: event.id });
    }
  };

  const handleExport = (format: "ics" | "json") => {
    // Export all events in current filter
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
    const searchParams = new URLSearchParams();
    searchParams.set("format", format);
    if (queryParams.types?.length) searchParams.set("types", queryParams.types.join(","));
    if (queryParams.status?.length) searchParams.set("status", queryParams.status.join(","));
    window.open(`${baseUrl}/api/v1/events/export?${searchParams.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader tabFilter={tabFilter} />
        <LoadingState variant="card" count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader tabFilter={tabFilter} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const events = eventsResponse?.events || [];

  return (
    <div className="space-y-6">
      <PageHeader tabFilter={tabFilter} />

      {/* Tabs */}
      <Tabs value={tabFilter} onValueChange={(v) => setTabFilter(v as TabFilter)}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            All
            <Badge variant="secondary" className="h-5 px-1.5">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            Active
            <Badge
              variant={counts.active > 0 ? "default" : "secondary"}
              className={cn("h-5 px-1.5", counts.active > 0 && "bg-yellow-500")}
            >
              {counts.active}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-2">
            Resolved
            <Badge variant="secondary" className="h-5 px-1.5">
              {counts.resolved}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="incidents" className="gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Incidents
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2">
            <Calendar className="h-3.5 w-3.5" />
            Maintenance
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters and View Toggle */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <EventFilters
            filters={filters}
            onFiltersChange={setFilters}
            monitors={monitors?.map((m) => ({ id: m.id, name: m.name })) || []}
            showExport={events.length > 0}
            onExport={handleExport}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewType === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewType("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewType === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none border-x"
              onClick={() => setViewType("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewType === "timeline" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewType("timeline")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Events Display */}
      {events.length === 0 ? (
        eventsResponse && eventsResponse.total > 0 ? (
          <EmptyState
            icon={Clock}
            title="No events match your filters"
            description="Try adjusting your search or filter criteria."
            action={{
              label: "Clear filters",
              onClick: () => {
                setFilters({});
                setTabFilter("all");
              },
            }}
          />
        ) : (
          <EmptyState
            icon={tabFilter === "incidents" ? AlertTriangle : tabFilter === "maintenance" ? Calendar : CheckCircle}
            title={
              tabFilter === "incidents"
                ? "No incidents"
                : tabFilter === "maintenance"
                ? "No maintenance events"
                : tabFilter === "active"
                ? "No active events"
                : tabFilter === "resolved"
                ? "No resolved events"
                : "No events"
            }
            description={
              tabFilter === "incidents"
                ? "No incidents have been created yet. Create one when you need to communicate service issues to your users."
                : tabFilter === "maintenance"
                ? "No maintenance windows have been scheduled yet. Create one when you need to communicate planned work to your users."
                : tabFilter === "active"
                ? "There are no active incidents or maintenance windows. Your services are running smoothly."
                : tabFilter === "resolved"
                ? "No resolved events to show. Resolved incidents and completed maintenance windows will appear here."
                : "No incidents or maintenance windows have been created yet. Create one when you need to communicate issues or planned work to your users."
            }
            action={
              tabFilter === "incidents"
                ? { label: "New Incident", href: "/incidents/new", icon: Plus }
                : tabFilter === "maintenance"
                ? { label: "New Maintenance", href: "/maintenance-windows/new", icon: Plus }
                : tabFilter === "active" || tabFilter === "resolved"
                ? undefined
                : { label: "Create Event", href: "/incidents/new", icon: Plus }
            }
          />
        )
      ) : viewType === "timeline" ? (
        <>
          <EventsFeedTimeline events={events} />
          {eventsResponse && eventsResponse.total > DEFAULT_PAGE_SIZE && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(eventsResponse.total / DEFAULT_PAGE_SIZE)}
              totalItems={eventsResponse.total}
              pageSize={DEFAULT_PAGE_SIZE}
              itemsOnCurrentPage={events.length}
              onPageChange={setPage}
              itemLabel="events"
            />
          )}
        </>
      ) : (
        <>
          <div
            className={cn(
              viewType === "grid"
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                : "space-y-2"
            )}
          >
            {events.map((event) => (
              <EventCard
                key={`${event.type}-${event.id}`}
                event={event}
                variant={viewType === "list" ? "compact" : "default"}
                onResolve={
                  event.type === "incident" && event.status !== "resolved"
                    ? () => handleResolve(event.id)
                    : undefined
                }
                onUpdate={() => router.push(`/events/${event.type}/${event.id}`)}
                onEdit={() => router.push(`/events/${event.type}/${event.id}`)}
                onSubscribe={
                  !event.isSubscribed ? () => handleSubscribe(event) : undefined
                }
                onUnsubscribe={
                  event.isSubscribed ? () => handleSubscribe(event) : undefined
                }
              />
            ))}
          </div>
          {eventsResponse && eventsResponse.total > DEFAULT_PAGE_SIZE && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(eventsResponse.total / DEFAULT_PAGE_SIZE)}
              totalItems={eventsResponse.total}
              pageSize={DEFAULT_PAGE_SIZE}
              itemsOnCurrentPage={events.length}
              onPageChange={setPage}
              itemLabel="events"
            />
          )}
        </>
      )}

      {/* Resolve Confirmation Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this incident as resolved? This will
              update the status and notify subscribers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmResolve}
              disabled={resolveIncident.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {resolveIncident.isPending ? "Resolving..." : "Resolve Incident"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageHeader({ tabFilter }: { tabFilter: TabFilter }) {
  // When on a specific tab, show a direct create button instead of dropdown
  if (tabFilter === "incidents") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Incidents</h1>
          <p className="text-muted-foreground">
            Track and manage service incidents
          </p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">
            <Plus className="mr-2 h-4 w-4" />
            New Incident
          </Link>
        </Button>
      </div>
    );
  }

  if (tabFilter === "maintenance") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Maintenance</h1>
          <p className="text-muted-foreground">
            Schedule and manage maintenance windows
          </p>
        </div>
        <Button asChild>
          <Link href="/maintenance-windows/new">
            <Plus className="mr-2 h-4 w-4" />
            New Maintenance
          </Link>
        </Button>
      </div>
    );
  }

  // Default: show dropdown for all event types
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Events</h1>
        <p className="text-muted-foreground">
          Manage incidents and maintenance windows
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/incidents/new">
              <AlertTriangle className="mr-2 h-4 w-4" />
              New Incident
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/maintenance-windows/new">
              <Calendar className="mr-2 h-4 w-4" />
              New Maintenance
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
