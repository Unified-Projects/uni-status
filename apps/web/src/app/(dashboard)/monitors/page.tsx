"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Activity,
  Search,
  Filter,
  LayoutGrid,
  List,
  X,
} from "lucide-react";
import {
  Button,
  Input,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@uni-status/ui";
import { useMonitors, useDeleteMonitor, usePauseMonitor, useResumeMonitor, useCheckMonitorNow } from "@/hooks/use-monitors";
import { useDashboardStore, filterMonitors, sortMonitors, type MonitorStatus, type MonitorType } from "@/stores/dashboard-store";
import { MonitorCard } from "@/components/monitors";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, DEFAULT_PAGE_SIZE, getPaginationProps } from "@/components/ui/pagination";

const STATUS_OPTIONS: { value: MonitorStatus; label: string }[] = [
  { value: "active", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "down", label: "Down" },
  { value: "paused", label: "Paused" },
  { value: "pending", label: "Pending" },
];

const TYPE_OPTIONS: { value: MonitorType; label: string }[] = [
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS" },
  { value: "dns", label: "DNS" },
  { value: "ssl", label: "SSL" },
  { value: "tcp", label: "TCP" },
  { value: "ping", label: "Ping" },
];

export default function MonitorsPage() {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [monitorToDelete, setMonitorToDelete] = useState<string | null>(null);

  // Pagination
  const { page, setPage, resetPage, paginationParams } = usePagination();

  // Data fetching
  const { data: monitorsResponse, isLoading, error, refetch } = useMonitors(paginationParams);
  const monitors = monitorsResponse?.data;
  const meta = monitorsResponse?.meta;

  // Mutations
  const deleteMonitor = useDeleteMonitor();
  const pauseMonitor = usePauseMonitor();
  const resumeMonitor = useResumeMonitor();
  const checkNow = useCheckMonitorNow();

  // Store state
  const {
    monitorFilters,
    setMonitorFilters,
    resetMonitorFilters,
    monitorSort,
    setMonitorSort,
    monitorView,
    setMonitorView,
  } = useDashboardStore();

  // Filter and sort monitors
  const filteredMonitors = useMemo(() => {
    if (!monitors) return [];
    const filtered = filterMonitors(monitors, monitorFilters);
    return sortMonitors(filtered, monitorSort);
  }, [monitors, monitorFilters, monitorSort]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (monitorFilters.status.length > 0) count++;
    if (monitorFilters.type.length > 0) count++;
    if (monitorFilters.search) count++;
    return count;
  }, [monitorFilters]);

  // Handlers
  const handleDelete = (id: string) => {
    setMonitorToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!monitorToDelete) return;
    await deleteMonitor.mutateAsync(monitorToDelete);
    setDeleteDialogOpen(false);
    setMonitorToDelete(null);
  };

  const handlePause = async (id: string) => {
    await pauseMonitor.mutateAsync(id);
  };

  const handleResume = async (id: string) => {
    await resumeMonitor.mutateAsync(id);
  };

  const handleCheckNow = async (id: string) => {
    await checkNow.mutateAsync(id);
  };

  const toggleStatusFilter = (status: MonitorStatus) => {
    const current = monitorFilters.status;
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    setMonitorFilters({ status: updated });
  };

  const toggleTypeFilter = (type: MonitorType) => {
    const current = monitorFilters.type;
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setMonitorFilters({ type: updated });
  };

  // Reset pagination when filters change
  useEffect(() => {
    resetPage();
  }, [monitorFilters.status, monitorFilters.type, monitorFilters.search, resetPage]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <LoadingState variant="card" count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <ErrorState
          error={error}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search monitors..."
              value={monitorFilters.search}
              onChange={(e) => setMonitorFilters({ search: e.target.value })}
              className="pl-9"
            />
            {monitorFilters.search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                onClick={() => setMonitorFilters({ search: "" })}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {STATUS_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={monitorFilters.status.includes(option.value)}
                  onCheckedChange={() => toggleStatusFilter(option.value)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Type</DropdownMenuLabel>
              {TYPE_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={monitorFilters.type.includes(option.value)}
                  onCheckedChange={() => toggleTypeFilter(option.value)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
              {activeFilterCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={resetMonitorFilters}
                  >
                    Clear all filters
                  </Button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border">
            <Button
              variant={monitorView === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setMonitorView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={monitorView === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setMonitorView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {monitorFilters.status.map((status) => (
            <Badge key={status} variant="secondary" className="gap-1">
              Status: {STATUS_OPTIONS.find((s) => s.value === status)?.label}
              <button
                onClick={() => toggleStatusFilter(status)}
                className="ml-1 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {monitorFilters.type.map((type) => (
            <Badge key={type} variant="secondary" className="gap-1">
              Type: {TYPE_OPTIONS.find((t) => t.value === type)?.label}
              <button
                onClick={() => toggleTypeFilter(type)}
                className="ml-1 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Monitors List/Grid */}
      {filteredMonitors.length === 0 ? (
        monitors && monitors.length > 0 ? (
          <EmptyState
            icon={Search}
            title="No monitors match your filters"
            description="Try adjusting your search or filter criteria."
            action={{
              label: "Clear filters",
              onClick: resetMonitorFilters,
            }}
          />
        ) : (
          <EmptyState
            icon={Activity}
            title="No monitors yet"
            description="Create your first monitor to start tracking uptime and performance."
            action={{
              label: "Create Monitor",
              href: "/monitors/new",
              icon: Plus,
            }}
          />
        )
      ) : (
        <>
          <div
            className={cn(
              monitorView === "grid"
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                : "space-y-2"
            )}
          >
            {filteredMonitors.map((monitor) => (
              <MonitorCard
                key={monitor.id}
                monitor={monitor}
                uptimePercentage={monitor.uptimePercentage ?? null}
                avgResponseTime={monitor.avgResponseTime ?? null}
                variant={monitorView === "list" ? "compact" : "default"}
                onPause={() => handlePause(monitor.id)}
                onResume={() => handleResume(monitor.id)}
                onCheckNow={() => handleCheckNow(monitor.id)}
                onEdit={() => router.push(`/monitors/${monitor.id}/edit`)}
                onDelete={() => handleDelete(monitor.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {meta && (
            <Pagination
              {...getPaginationProps(meta, filteredMonitors.length, setPage, "monitors")}
            />
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Monitor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this monitor? This action cannot be
              undone and all associated check results will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMonitor.isPending}
            >
              {deleteMonitor.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Monitors</h1>
        <p className="text-muted-foreground">
          Manage your uptime monitors and track performance
        </p>
      </div>
      <Link href="/monitors/new">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Monitor
        </Button>
      </Link>
    </div>
  );
}
