"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Globe,
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
import { useStatusPages, useDeleteStatusPage } from "@/hooks/use-status-pages";
import {
  useDashboardStore,
  filterStatusPages,
  type StatusPagePublishedFilter,
} from "@/stores/dashboard-store";
import { StatusPageCard } from "@/components/status-pages";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, DEFAULT_PAGE_SIZE, getPaginationProps } from "@/components/ui/pagination";

const PUBLISHED_OPTIONS: { value: StatusPagePublishedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

export default function StatusPagesPage() {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);

  // Pagination
  const { page, setPage, resetPage, paginationParams } = usePagination();

  // Data fetching
  const { data: statusPagesResponse, isLoading, error, refetch } = useStatusPages(paginationParams);
  const statusPages = statusPagesResponse?.data;
  const meta = statusPagesResponse?.meta;

  // Mutations
  const deleteStatusPage = useDeleteStatusPage();

  // Store state
  const {
    statusPageFilters,
    setStatusPageFilters,
    resetStatusPageFilters,
    statusPageView,
    setStatusPageView,
  } = useDashboardStore();

  // Filter status pages
  const filteredStatusPages = useMemo(() => {
    if (!statusPages) return [];
    return filterStatusPages(statusPages, statusPageFilters);
  }, [statusPages, statusPageFilters]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusPageFilters.published !== "all") count++;
    if (statusPageFilters.search) count++;
    return count;
  }, [statusPageFilters]);

  // Handlers
  const handleDelete = (id: string) => {
    setPageToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pageToDelete) return;
    await deleteStatusPage.mutateAsync(pageToDelete);
    setDeleteDialogOpen(false);
    setPageToDelete(null);
  };

  const setPublishedFilter = (published: StatusPagePublishedFilter) => {
    setStatusPageFilters({ published });
  };

  // Reset pagination when filters change
  useEffect(() => {
    resetPage();
  }, [statusPageFilters.published, statusPageFilters.search, resetPage]);

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
        <ErrorState error={error} onRetry={() => refetch()} />
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
              placeholder="Search status pages..."
              value={statusPageFilters.search}
              onChange={(e) => setStatusPageFilters({ search: e.target.value })}
              className="pl-9"
            />
            {statusPageFilters.search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                onClick={() => setStatusPageFilters({ search: "" })}
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
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {PUBLISHED_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={statusPageFilters.published === option.value}
                  onCheckedChange={() => setPublishedFilter(option.value)}
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
                    onClick={resetStatusPageFilters}
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
              variant={statusPageView === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setStatusPageView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={statusPageView === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setStatusPageView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusPageFilters.published !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Status:{" "}
              {PUBLISHED_OPTIONS.find((o) => o.value === statusPageFilters.published)?.label}
              <button
                onClick={() => setPublishedFilter("all")}
                className="ml-1 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {statusPageFilters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {statusPageFilters.search}
              <button
                onClick={() => setStatusPageFilters({ search: "" })}
                className="ml-1 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Status Pages List/Grid */}
      {filteredStatusPages.length === 0 ? (
        statusPages && statusPages.length > 0 ? (
          <EmptyState
            icon={Search}
            title="No status pages match your filters"
            description="Try adjusting your search or filter criteria."
            action={{
              label: "Clear filters",
              onClick: resetStatusPageFilters,
            }}
          />
        ) : (
          <EmptyState
            icon={Globe}
            title="No status pages yet"
            description="Create a status page to keep your users informed about service health."
            action={{
              label: "Create Status Page",
              href: "/status-pages/new",
              icon: Plus,
            }}
          />
        )
      ) : (
        <>
          <div
            className={cn(
              statusPageView === "grid"
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                : "space-y-2"
            )}
          >
            {filteredStatusPages.map((page) => (
              <StatusPageCard
                key={page.id}
                statusPage={page}
                variant={statusPageView === "list" ? "compact" : "default"}
                onEdit={() => router.push(`/status-pages/${page.id}`)}
                onDelete={() => handleDelete(page.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {meta && (
            <Pagination
              {...getPaginationProps(meta, filteredStatusPages.length, setPage, "status pages")}
            />
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Status Page</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this status page? This action cannot be
              undone and all associated subscribers will be removed.
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
              disabled={deleteStatusPage.isPending}
            >
              {deleteStatusPage.isPending ? "Deleting..." : "Delete"}
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
        <h1 className="text-3xl font-bold">Status Pages</h1>
        <p className="text-muted-foreground">
          Public status pages to keep your users informed
        </p>
      </div>
      <Link href="/status-pages/new">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Status Page
        </Button>
      </Link>
    </div>
  );
}
