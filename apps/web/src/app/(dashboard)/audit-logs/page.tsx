"use client";

import { useState, useMemo } from "react";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Badge } from "@uni-status/ui";
import {
  useAuditLogs,
  useAuditLogActions,
  useAuditLogUsers,
} from "@/hooks/use-audit-logs";
import {
  AuditLogRow,
  AuditFilters,
  AuditExportDialog,
} from "@uni-status/enterprise/web/components/audit";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { AuditLogsListParams, AuditLog, AuditLogsListResponse } from "@/lib/api-client";

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditLogsListParams>({
    limit: PAGE_SIZE,
    offset: 0,
  });

  // Data fetching
  const {
    data: logsResponse,
    isLoading,
    error,
    refetch,
  } = useAuditLogs(filters);
  const { data: actionCounts } = useAuditLogActions();
  const { data: userCounts } = useAuditLogUsers();

  // Extract data - the API returns { success, data: AuditLogsListResponse }
  const response = logsResponse as { success?: boolean; data?: AuditLogsListResponse } | undefined;
  const logs: AuditLog[] = response?.data?.data ?? [];
  const meta = {
    total: response?.data?.meta?.total ?? 0,
    limit: response?.data?.meta?.limit ?? PAGE_SIZE,
    offset: response?.data?.meta?.offset ?? 0,
    hasMore: response?.data?.meta?.hasMore ?? false,
  };

  // Pagination
  const currentPage = Math.floor(meta.offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(meta.total / PAGE_SIZE);

  const goToPage = (page: number) => {
    setFilters({
      ...filters,
      offset: (page - 1) * PAGE_SIZE,
    });
  };

  const handleFiltersChange = (newFilters: AuditLogsListParams) => {
    // Reset pagination when filters change
    setFilters({
      ...newFilters,
      limit: PAGE_SIZE,
      offset: 0,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader totalCount={0} />
        <LoadingState variant="list" count={10} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader totalCount={0} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader totalCount={meta.total} />

      {/* Filters */}
      <AuditFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        actionCounts={actionCounts}
        userCounts={userCounts}
      />

      {/* Content */}
      {logs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No audit logs found"
          description={
            filters.action || filters.userId || filters.resourceType || filters.from || filters.to
              ? "Try adjusting your filters to see more results."
              : "Audit logs will appear here as you and your team perform actions."
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Table Header */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
            <div className="w-6" />
            <div className="w-48">User</div>
            <div className="w-36">Action</div>
            <div className="flex-1">Resource</div>
            <div className="w-24 text-right">Time</div>
          </div>

          {/* Log Rows */}
          <div className="border rounded-lg divide-y">
            {logs.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <div className="text-sm text-muted-foreground">
                Showing {meta.offset + 1} - {Math.min(meta.offset + logs.length, meta.total)} of{" "}
                {meta.total} logs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        className="w-8"
                        onClick={() => goToPage(page)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageHeader({ totalCount }: { totalCount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">
          Track all actions and changes made by your team
          {totalCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {totalCount.toLocaleString()} total
            </Badge>
          )}
        </p>
      </div>
      <AuditExportDialog />
    </div>
  );
}
