"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  ExternalLink,
  X,
} from "lucide-react";
import {
  Button,
  Input,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@uni-status/ui";
import { apiClient, queryKeys, type CertificateListItem, type CertificateStats, type PaginationMeta } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, DEFAULT_PAGE_SIZE, getPaginationProps } from "@/components/ui/pagination";
import { formatDistanceToNow, format } from "date-fns";
import { useDashboardStore } from "@/stores/dashboard-store";

type ExpiryStatus = "expired" | "expiring-soon" | "healthy" | "unknown";
type CtState = "healthy" | "new" | "unexpected" | "error" | "disabled" | "unknown";

const STATUS_OPTIONS: { value: ExpiryStatus; label: string; icon: React.ElementType; color: string }[] = [
  { value: "expired", label: "Expired", icon: XCircle, color: "text-red-500" },
  { value: "expiring-soon", label: "Expiring Soon", icon: AlertTriangle, color: "text-yellow-500" },
  { value: "healthy", label: "Healthy", icon: CheckCircle2, color: "text-green-500" },
  { value: "unknown", label: "Unknown", icon: HelpCircle, color: "text-muted-foreground" },
];

function getExpiryStatus(daysUntilExpiry: number | undefined): ExpiryStatus {
  if (daysUntilExpiry === undefined) return "unknown";
  if (daysUntilExpiry <= 0) return "expired";
  if (daysUntilExpiry <= 30) return "expiring-soon";
  return "healthy";
}

function getExpiryBadge(daysUntilExpiry: number | undefined) {
  const status = getExpiryStatus(daysUntilExpiry);
  const option = STATUS_OPTIONS.find((o) => o.value === status)!;
  const Icon = option.icon;

  return (
    <Badge
      variant={status === "expired" ? "destructive" : status === "expiring-soon" ? "warning" : status === "healthy" ? "success" : "secondary"}
      className="gap-1"
    >
      <Icon className="h-3 w-3" />
      {status === "expired"
        ? "Expired"
        : status === "unknown"
        ? "Unknown"
        : `${daysUntilExpiry} days`}
    </Badge>
  );
}

function getCtBadge(ctStatus: CertificateListItem["ctStatus"]) {
  const state: CtState = ctStatus?.state ?? "unknown";
  const newCount = ctStatus?.newCount ?? 0;
  const unexpectedCount = ctStatus?.unexpectedCount ?? 0;

  const variant =
    state === "healthy"
      ? "success"
      : state === "new"
      ? "warning"
      : state === "unexpected" || state === "error"
      ? "destructive"
      : state === "disabled"
      ? "secondary"
      : "secondary";

  const label = (() => {
    switch (state) {
      case "healthy":
        return "No new CT entries";
      case "new":
        return `${newCount} new cert${newCount === 1 ? "" : "s"}`;
      case "unexpected":
        return `${unexpectedCount} unexpected`;
      case "error":
        return "CT check failed";
      case "disabled":
        return "CT disabled";
      default:
        return "No CT data";
    }
  })();

  const Icon =
    state === "healthy"
      ? CheckCircle2
      : state === "new"
      ? Shield
      : state === "unexpected" || state === "error"
      ? AlertTriangle
      : Clock;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export default function CertificatesPage() {
  const { currentOrganizationId } = useDashboardStore();
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<ExpiryStatus[]>([]);

  // Pagination
  const { page, setPage, resetPage, paginationParams } = usePagination();

  // Reset pagination when filters change
  useEffect(() => {
    resetPage();
  }, [search, statusFilters, resetPage]);

  // Fetch certificates
  const { data, isLoading, error, refetch } = useQuery<{ data: CertificateListItem[]; stats?: CertificateStats; meta?: PaginationMeta }>({
    queryKey: [...queryKeys.certificates.list(), currentOrganizationId, paginationParams],
    queryFn: () => apiClient.certificates.list(paginationParams, currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const certificates = data?.data ?? [];
  const stats = data?.stats;
  const meta = data?.meta;

  // Filter certificates
  const filteredCertificates = useMemo(() => {
    return certificates.filter((cert) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesName = cert.monitorName.toLowerCase().includes(searchLower);
        const matchesUrl = cert.url.toLowerCase().includes(searchLower);
        const matchesIssuer = cert.certificateInfo?.issuer?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesUrl && !matchesIssuer) return false;
      }

      // Status filter
      if (statusFilters.length > 0) {
        const certStatus = getExpiryStatus(cert.certificateInfo?.daysUntilExpiry);
        if (!statusFilters.includes(certStatus)) return false;
      }

      return true;
    });
  }, [certificates, search, statusFilters]);

  const activeFilterCount = (search ? 1 : 0) + (statusFilters.length > 0 ? 1 : 0);

  const toggleStatusFilter = (status: ExpiryStatus) => {
    setStatusFilters((current) =>
      current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status]
    );
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilters([]);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <LoadingState variant="card" count={4} />
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

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Total Certificates"
            value={stats.total}
            icon={Shield}
            color="text-blue-500"
          />
          <StatsCard
            title="Expired"
            value={stats.expired}
            icon={XCircle}
            color="text-red-500"
            onClick={() => setStatusFilters(["expired"])}
          />
          <StatsCard
            title="Expiring Soon"
            value={stats.expiringSoon}
            icon={AlertTriangle}
            color="text-yellow-500"
            description="Within 30 days"
            onClick={() => setStatusFilters(["expiring-soon"])}
          />
          <StatsCard
            title="Healthy"
            value={stats.healthy}
            icon={CheckCircle2}
            color="text-green-500"
            onClick={() => setStatusFilters(["healthy"])}
          />
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search certificates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                onClick={() => setSearch("")}
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
              <DropdownMenuLabel>Expiry Status</DropdownMenuLabel>
              {STATUS_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={statusFilters.includes(option.value)}
                  onCheckedChange={() => toggleStatusFilter(option.value)}
                >
                  <option.icon className={cn("mr-2 h-4 w-4", option.color)} />
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
                    onClick={resetFilters}
                  >
                    Clear all filters
                  </Button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active Filters Display */}
      {statusFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((status) => {
            const option = STATUS_OPTIONS.find((o) => o.value === status)!;
            return (
              <Badge key={status} variant="secondary" className="gap-1">
                <option.icon className={cn("h-3 w-3", option.color)} />
                {option.label}
                <button
                  onClick={() => toggleStatusFilter(status)}
                  className="ml-1 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Certificates Table */}
      {filteredCertificates.length === 0 ? (
        certificates.length > 0 ? (
          <EmptyState
            icon={Search}
            title="No certificates match your filters"
            description="Try adjusting your search or filter criteria."
            action={{
              label: "Clear filters",
              onClick: resetFilters,
            }}
          />
        ) : (
          <EmptyState
            icon={Shield}
            title="No SSL/HTTPS monitors"
            description="Create an SSL or HTTPS monitor to start tracking certificate expiry."
            action={{
              label: "Create Monitor",
              href: "/monitors/new",
            }}
          />
        )
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Issuer</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Days Remaining</TableHead>
                  <TableHead>CT Watch</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCertificates.map((cert) => (
                  <TableRow key={cert.monitorId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <Link
                          href={`/monitors/${cert.monitorId}`}
                          className="font-medium hover:underline"
                        >
                          {cert.monitorName}
                        </Link>
                        <span className="text-sm text-muted-foreground truncate max-w-[250px]">
                          {cert.url}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {cert.certificateInfo?.issuer || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {cert.certificateInfo?.validTo
                          ? format(new Date(cert.certificateInfo.validTo), "MMM d, yyyy")
                          : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getExpiryBadge(cert.certificateInfo?.daysUntilExpiry)}
                    </TableCell>
                    <TableCell>
                      {getCtBadge(cert.ctStatus)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {cert.lastChecked
                          ? formatDistanceToNow(new Date(cert.lastChecked), {
                              addSuffix: true,
                            })
                          : "Never"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/monitors/${cert.monitorId}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          {meta && (
            <Pagination
              {...getPaginationProps(meta, filteredCertificates.length, setPage, "certificates")}
            />
          )}
        </>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Certificates</h1>
        <p className="text-muted-foreground">
          Track SSL certificate expiry across your SSL and HTTPS monitors
        </p>
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  description,
  onClick,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", color)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
