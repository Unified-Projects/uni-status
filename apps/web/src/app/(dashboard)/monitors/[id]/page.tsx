"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Pencil,
  Trash2,
  Clock,
  Globe,
  Activity,
  Shield,
  Zap,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from "@uni-status/ui";
import {
  useMonitor,
  useMonitorResults,
  useDeleteMonitor,
  usePauseMonitor,
  useResumeMonitor,
  useCheckMonitorNow,
} from "@/hooks/use-monitors";
import { useUptimeAnalytics, useResponseTimeAnalytics } from "@/hooks/use-analytics";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  StatusBadge,
  UptimeBar,
  UptimeLegend,
  ResponseTimeChart,
  ResponseTimeStats,
  type MonitorStatus,
} from "@/components/monitors";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LoadingState, LoadingSpinner } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { CheckResult } from "@/lib/api-client";
import { CertificateDetailsCard } from "@/components/certificates/certificate-details-card";
import { PageSpeedScoreCard, WebVitalsCard } from "@/components/pagespeed";
import { SecurityHeadersCard } from "@/components/security/security-headers-card";
import {
  showsResponseTime as typeShowsResponseTime,
  showsStatusCode as typeShowsStatusCode,
  showsCertificate as typeShowsCertificate,
  showsUptime as typeShowsUptime,
  showsEmailAuth as typeShowsEmailAuth,
  showsHeartbeat as typeShowsHeartbeat,
  showsTraceroute as typeShowsTraceroute,
  getPrimaryMetricLabel,
  type MonitorType,
} from "@/components/public-status/monitors/types";
import { TracerouteHopsCard, TracerouteStats, type TracerouteHop } from "@/components/monitors/traceroute-hops-card";
import { apiClient, queryKeys } from "@/lib/api-client";
import { CertificateTransparencyCard } from "@/components/certificates/certificate-transparency-card";

export default function MonitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const monitorId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Store state for view preferences
  const {
    uptimeDays,
    setUptimeDays,
    responseTimeHours,
    setResponseTimeHours,
    currentOrganizationId,
  } = useDashboardStore();

  // Data fetching
  const { data: monitor, isLoading, error, refetch } = useMonitor(monitorId);
  const { data: checkResults, isLoading: resultsLoading } = useMonitorResults(
    monitorId,
    { limit: 50 }
  );
  const { data: uptimeData } = useUptimeAnalytics({
    monitorId,
    days: uptimeDays,
  });
  const { data: responseTimeData } = useResponseTimeAnalytics(
    monitorId,
    responseTimeHours
  );

  const { data: certificateDetail, isLoading: certificateDetailLoading } = useQuery({
    queryKey: [...queryKeys.certificates.detail(monitorId), currentOrganizationId],
    queryFn: () => apiClient.certificates.get(monitorId, currentOrganizationId || undefined),
    enabled: !!monitor && !!currentOrganizationId && (monitor.type === "ssl" || monitor.type === "https"),
  });

  // Fallback uptime data from recent check results when analytics aggregates are empty
  const fallbackUptimeData = checkResults?.length
    ? (() => {
        const grouped = checkResults.reduce<Record<string, { success: number; degraded: number; failure: number; total: number }>>(
          (acc, result) => {
            const dateStr = result.createdAt.split("T")[0];
            const entry = acc[dateStr] || { success: 0, degraded: 0, failure: 0, total: 0 };
            if (result.status === "success") {
              entry.success += 1;
            } else if (result.status === "degraded") {
              entry.degraded += 1;
            } else {
              entry.failure += 1;
            }
            entry.total += 1;
            acc[dateStr] = entry;
            return acc;
          },
          {}
        );

        return Object.entries(grouped)
          .map(([date, counts]) => {
            const uptimePercentage = counts.total > 0
              ? ((counts.success + counts.degraded) / counts.total) * 100
              : null;

            const status =
              counts.failure > 0
                ? "down"
                : counts.degraded > 0
                  ? "degraded"
                  : uptimePercentage === null
                    ? "unknown"
                    : "success";

            return {
              date,
              uptimePercentage,
              status,
              successCount: counts.success,
              degradedCount: counts.degraded,
              failureCount: counts.failure,
              totalCount: counts.total,
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));
      })()
    : [];

  // The API automatically selects the best granularity based on available data
  const effectiveGranularity = uptimeData?.granularity || "day";
  const uptimeSeries = uptimeData?.data?.length
    ? uptimeData.data.map((d) => ({
        date: (() => {
          const parsed = typeof d.date === "string" ? new Date(d.date) : d.date;
          return parsed instanceof Date
            ? parsed.toISOString().split("T")[0]
            : String(d.date);
        })(),
        timestamp: d.timestamp || (typeof d.date === "string" ? d.date : new Date(d.date).toISOString()),
        uptimePercentage: (d as { uptime?: number | null }).uptime ?? d.uptimePercentage ?? null,
        successCount: d.successCount !== undefined ? Number(d.successCount) : undefined,
        degradedCount: d.degradedCount !== undefined ? Number(d.degradedCount) : undefined,
        failureCount: d.failureCount !== undefined ? Number(d.failureCount) : undefined,
        totalCount: d.totalCount !== undefined ? Number(d.totalCount) : undefined,
        incidents: d.incidents,
      }))
    : fallbackUptimeData;

  const getUptimeStatus = (dataPoint: {
    uptimePercentage: number | null;
    failureCount?: number | string;
    degradedCount?: number | string;
  }) => {
    const failureCount = Number(dataPoint.failureCount ?? 0);
    const degradedCount = Number(dataPoint.degradedCount ?? 0);

    if (failureCount > 0) return "down";
    if (degradedCount > 0) return "degraded";
    if (dataPoint.uptimePercentage === null) return "unknown";
    if (dataPoint.uptimePercentage >= 99) return "success";
    if (dataPoint.uptimePercentage >= 95) return "degraded";
    return "down";
  };

  // Fallback response time data from recent check results when API returns no data
  const fallbackResponseTimeData = checkResults?.length
    ? (() => {
        // Filter to only results with valid response times
        const validResults = checkResults.filter(
          (r): r is typeof r & { responseTimeMs: number } =>
            r.responseTimeMs !== null && r.responseTimeMs !== undefined
        );

        if (validResults.length === 0) {
          return { data: [], summary: null };
        }

        const responseTimes = validResults.map((r) => r.responseTimeMs);
        const sortedTimes = [...responseTimes].sort((a, b) => a - b);

        const percentile = (arr: number[], p: number) => {
          if (!arr.length) return null;
          const idx = Math.floor((p / 100) * arr.length);
          return arr[Math.min(idx, arr.length - 1)];
        };

        // Calculate overall statistics for summary
        const avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
        const min = Math.min(...responseTimes);
        const max = Math.max(...responseTimes);
        const p50 = percentile(sortedTimes, 50);
        const p90 = percentile(sortedTimes, 90);
        const p99 = percentile(sortedTimes, 99);

        // Create individual data points for charting (chronological order)
        const points = validResults.map((r) => ({
          timestamp: r.createdAt,
          avg: r.responseTimeMs,
          min: r.responseTimeMs,
          max: r.responseTimeMs,
          p50: r.responseTimeMs,
          p90: r.responseTimeMs,
          p99: r.responseTimeMs,
        }));

        return {
          data: points,
          summary: { avg, min, max, p50, p90, p99 },
        };
      })()
    : { data: [], summary: null };

  const hasApiResponseData = responseTimeData?.data?.some(
    (p) => p.avg !== null || p.p50 !== null || p.p90 !== null || p.p99 !== null
  );

  // Use API data if available, otherwise fallback
  let responseSeries = hasApiResponseData && responseTimeData?.data?.length
    ? responseTimeData.data
    : fallbackResponseTimeData.data;

  const responseSummary = responseTimeData?.summary ?? fallbackResponseTimeData.summary;

  // If we have summary data but no chart points, create points from summary for display
  if (responseSeries.length === 0 && responseSummary && responseSummary.avg !== null) {
    // Create a single point with the summary data as a fallback
    responseSeries = [{
      timestamp: new Date().toISOString(),
      avg: responseSummary.avg,
      min: responseSummary.min ?? null,
      max: responseSummary.max ?? null,
      p50: responseSummary.p50 ?? null,
      p90: responseSummary.p90 ?? null,
      p99: responseSummary.p99 ?? null,
      count: 1,
    }] as typeof responseSeries;
  }

  // Mutations
  const deleteMonitor = useDeleteMonitor();
  const pauseMonitor = usePauseMonitor();
  const resumeMonitor = useResumeMonitor();
  const checkNow = useCheckMonitorNow();

  const handleDelete = async () => {
    await deleteMonitor.mutateAsync(monitorId);
    router.push("/monitors");
  };

  const handlePause = async () => {
    await pauseMonitor.mutateAsync(monitorId);
  };

  const handleResume = async () => {
    await resumeMonitor.mutateAsync(monitorId);
  };

  const handleCheckNow = async () => {
    await checkNow.mutateAsync(monitorId);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/monitors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <LoadingState variant="page" />
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/monitors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <ErrorState
          title="Monitor not found"
          message="The monitor you're looking for doesn't exist or you don't have access to it."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const isPaused = monitor.paused || monitor.status === "paused";

  // Type detection using centralized helpers (cast to MonitorType for type safety)
  const monitorType = monitor.type as MonitorType;
  const isSslType = monitor.type === "ssl";

  // Determine which metrics are relevant for this monitor type using centralized helpers
  const showsResponseTime = typeShowsResponseTime(monitorType);
  const showsStatusCode = typeShowsStatusCode(monitorType);
  const showsCertificate = typeShowsCertificate(monitorType);
  const showsEmailAuth = typeShowsEmailAuth(monitorType);
  const showsHeartbeat = typeShowsHeartbeat(monitorType);
  const showsUptime = typeShowsUptime(monitorType);
  const showsTraceroute = typeShowsTraceroute(monitorType);

  // Get certificate info from most recent check result
  const latestCertResult = checkResults?.find(r => r.certificateInfo !== null && r.certificateInfo !== undefined);
  const mapHeadersToAdditionalDetails = (headers?: Record<string, string> | null) => {
    if (!headers) return null;
    return {
      serialNumber: headers.serialNumber || undefined,
      fingerprint: headers.fingerprint || undefined,
      protocol: headers.protocol || undefined,
      cipher: headers.cipher || undefined,
      altNames: headers.altNames ? headers.altNames.split(",").map((v) => v.trim()).filter(Boolean) : undefined,
      chainValid: headers.chainValid === "true",
      hostnameValid: headers.hostnameValid === "true",
      chainComplete: headers.chainComplete === "true",
      ocspStapled: headers.ocspStapled === "true",
      ocspUrl: headers.ocspUrl || undefined,
      ocspResponder: headers.ocspResponder || undefined,
      crlStatus: headers.crlStatus || undefined,
      caaStatus: headers.caaStatus || undefined,
      tlsVersionStatus: headers.tlsVersionStatus || undefined,
      cipherStatus: headers.cipherStatus || undefined,
    };
  };

  const certInfo = certificateDetail?.currentCertificate ?? latestCertResult?.certificateInfo ?? null;
  const certificateAdditionalDetails = certificateDetail?.additionalDetails
    ?? mapHeadersToAdditionalDetails(latestCertResult?.headers as Record<string, string> | null | undefined);
  const certificateLastChecked = certificateDetail?.lastChecked ?? latestCertResult?.createdAt ?? null;
  const certificateCheckStatus = certificateDetail?.checkStatus ?? latestCertResult?.status ?? null;
  const certificateErrorMessage = certificateDetail?.errorMessage ?? latestCertResult?.errorMessage ?? null;
  const certificateErrorCode = certificateDetail?.errorCode ?? latestCertResult?.errorCode ?? null;
  const certificateSslConfig = certificateDetail?.monitor.sslConfig ?? (monitor as any).config?.ssl ?? null;

  // Get email auth info from most recent check result
  const latestEmailAuthResult = checkResults?.find(r => (r as any).emailAuthDetails !== null && (r as any).emailAuthDetails !== undefined);
  const emailAuthInfo = (latestEmailAuthResult as any)?.emailAuthDetails;

  // Get traceroute hops from most recent check result
  const latestTracerouteResult = checkResults?.find(r => (r as any).metadata?.hops !== undefined);
  const tracerouteHops = (latestTracerouteResult as any)?.metadata?.hops as TracerouteHop[] | undefined;
  const tracerouteTarget = (latestTracerouteResult as any)?.metadata?.target as string | undefined;

  // Build dynamic columns based on monitor type
  const checkResultColumns: Column<CheckResult>[] = [
    // Time - always show
    {
      key: "createdAt",
      header: "Time",
      sortable: true,
      render: (result) => (
        <div className="text-sm">
          {new Date(result.createdAt).toLocaleString()}
        </div>
      ),
    },
    // Status - always show
    {
      key: "status",
      header: "Status",
      render: (result) => (
        <Badge
          variant={
            result.status === "success"
              ? "default"
              : result.status === "degraded"
                ? "secondary"
                : "destructive"
          }
          className={`pointer-events-none ${
            result.status === "success"
              ? "bg-green-500"
              : result.status === "degraded"
                ? "bg-yellow-500"
                : ""
          }`}
        >
          {result.status}
        </Badge>
      ),
    },
    // Response/Connection/Latency Time - dynamic based on monitor type
    ...(showsResponseTime ? [{
      key: "responseTimeMs" as const,
      header: `${getPrimaryMetricLabel(monitorType)} Time`,
      sortable: true,
      render: (result: CheckResult) => (
        <span className="text-sm">
          {result.responseTimeMs !== null ? `${result.responseTimeMs}ms` : "--"}
        </span>
      ),
    }] : []),
    // Status Code - only for HTTP types
    ...(showsStatusCode ? [{
      key: "statusCode" as const,
      header: "Status Code",
      render: (result: CheckResult) => (
        <span className="text-sm font-mono">
          {result.statusCode || "--"}
        </span>
      ),
    }] : []),
    // Certificate - only for SSL/HTTPS types
    ...(showsCertificate ? [{
      key: "certificateInfo" as const,
      header: "Certificate",
      render: (result: CheckResult) => {
        const cert = result.certificateInfo;
        if (!cert || cert.daysUntilExpiry === undefined) return <span className="text-sm text-muted-foreground">--</span>;
        const days = cert.daysUntilExpiry;
        const color = days <= 7 ? "text-red-500" : days <= 30 ? "text-yellow-500" : "text-green-500";
        return (
          <span className={`text-sm font-medium ${color}`}>
            {days}d until expiry
          </span>
        );
      },
    }] : []),
    // Email Auth Score - only for email_auth type
    ...(showsEmailAuth ? [{
      key: "emailAuthDetails" as const,
      header: "Auth Score",
      render: (result: CheckResult) => {
        const authDetails = (result as any).emailAuthDetails;
        if (!authDetails) return <span className="text-sm text-muted-foreground">--</span>;
        const score = authDetails.overallScore;
        const color = score >= 90 ? "text-green-500" : score >= 70 ? "text-yellow-500" : "text-red-500";
        return (
          <span className={`text-sm font-medium ${color}`}>
            {score}/100
          </span>
        );
      },
    }] : []),
    // Traceroute Hops - only for traceroute type
    ...(showsTraceroute ? [{
      key: "metadata" as const,
      header: "Hops",
      render: (result: CheckResult) => {
        const hops = (result as any).metadata?.hops as TracerouteHop[] | undefined;
        if (!hops || hops.length === 0) return <span className="text-sm text-muted-foreground">--</span>;
        const reachedDestination = hops[hops.length - 1]?.address !== null;
        return (
          <span className={`text-sm font-medium ${reachedDestination ? "text-green-500" : "text-yellow-500"}`}>
            {hops.length} hop{hops.length !== 1 ? "s" : ""}
            {!reachedDestination && " (incomplete)"}
          </span>
        );
      },
    }] : []),
    // Region - always show
    {
      key: "region",
      header: "Region",
      render: (result) => (
        <div className="flex items-center gap-1 text-sm">
          <Globe className="h-3 w-3" />
          {result.region}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Link href="/monitors">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{monitor.name}</h1>
            <StatusBadge status={monitor.status as MonitorStatus} />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="uppercase text-xs font-medium">
              {monitor.type}
            </span>
            <span>|</span>
            <a
              href={monitor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1"
            >
              {monitor.url}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckNow}
            disabled={checkNow.isPending}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${checkNow.isPending ? "animate-spin" : ""}`}
            />
            Check Now
          </Button>
          {isPaused ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResume}
              disabled={resumeMonitor.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              Resume
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              disabled={pauseMonitor.isPending}
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
          )}
          <Link href={`/monitors/${monitorId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="checks">Recent Checks</TabsTrigger>
          {(monitor.type === "ssl" || monitor.type === "https") && (
            <TabsTrigger value="certificate">
              <Shield className="mr-2 h-4 w-4" />
              Certificate
            </TabsTrigger>
          )}
          {(monitor.type === "http" || monitor.type === "https") && (monitor as any).config?.pagespeed?.enabled && (
            <TabsTrigger value="pagespeed">
              <Zap className="mr-2 h-4 w-4" />
              PageSpeed
            </TabsTrigger>
          )}
          {(monitor.type === "http" || monitor.type === "https") && (monitor as any).config?.securityHeaders?.enabled && (
            <TabsTrigger value="security">
              <Shield className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
          )}
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Row - Type-specific */}
          <div className="grid gap-4 md:grid-cols-4">
            {/* Status - always shown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge
                  status={monitor.status as MonitorStatus}
                  size="lg"
                />
              </CardContent>
            </Card>

            {/* Uptime - shown for all types except SSL-only */}
            {!isSslType && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Uptime ({uptimeDays}{effectiveGranularity === "day" ? "d" : effectiveGranularity === "hour" ? "h" : "m"})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {uptimeData?.overall?.uptimePercentage != null
                      ? `${uptimeData.overall.uptimePercentage.toFixed(2)}%`
                      : "--"}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Certificate Status - for SSL/HTTPS types */}
            {showsCertificate && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Certificate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {certInfo ? (
                    <div className="space-y-1">
                      <div className={`text-2xl font-bold ${
                        certInfo.daysUntilExpiry !== undefined
                          ? certInfo.daysUntilExpiry <= 7
                            ? "text-red-500"
                            : certInfo.daysUntilExpiry <= 30
                              ? "text-yellow-500"
                              : "text-green-500"
                          : ""
                      }`}>
                        {certInfo.daysUntilExpiry !== undefined
                          ? `${certInfo.daysUntilExpiry}d`
                          : "--"}
                      </div>
                      <div className="text-xs text-muted-foreground">until expiry</div>
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">--</div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Avg Response/Connection/Latency - only for types that show response time */}
            {showsResponseTime && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Avg {getPrimaryMetricLabel(monitorType)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {responseSeries[0]?.avg != null
                      ? `${Math.round(responseSeries[0].avg)}ms`
                      : "--"}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Email Auth Score - only for email_auth type */}
            {showsEmailAuth && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Auth Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {emailAuthInfo ? (
                    <div className="space-y-1">
                      <div className={`text-2xl font-bold ${
                        emailAuthInfo.overallScore >= 90
                          ? "text-green-500"
                          : emailAuthInfo.overallScore >= 70
                            ? "text-yellow-500"
                            : "text-red-500"
                      }`}>
                        {emailAuthInfo.overallScore}/100
                      </div>
                      <div className="text-xs text-muted-foreground">SPF/DKIM/DMARC</div>
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">--</div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Heartbeat - only for heartbeat type */}
            {showsHeartbeat && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Last Ping
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {monitor.lastCheckedAt
                      ? formatRelativeTime(monitor.lastCheckedAt)
                      : "Never"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Expected every {monitor.intervalSeconds}s
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Traceroute Hops - only for traceroute type */}
            {showsTraceroute && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Network Hops
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TracerouteStats hops={tracerouteHops || []} />
                </CardContent>
              </Card>
            )}

            {/* Last Check - always shown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Last Check
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 text-sm">
                  <Clock className="h-4 w-4" />
                  {monitor.lastCheckedAt
                    ? formatRelativeTime(monitor.lastCheckedAt)
                    : "Never"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Uptime Bar Section - only for types that show uptime (not SSL-only) */}
          {showsUptime && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Uptime History</CardTitle>
                    <CardDescription>
                      Historical uptime{effectiveGranularity === "day"
                        ? ` over the past ${uptimeDays} days`
                        : effectiveGranularity === "hour"
                          ? ` over the past ${uptimeDays} hours`
                          : ` over the past ${uptimeDays} minutes`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={uptimeDays === 45 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setUptimeDays(45)}
                    >
                      45 {effectiveGranularity === "day" ? "days" : effectiveGranularity === "hour" ? "hours" : "min"}
                    </Button>
                    <Button
                      variant={uptimeDays === 90 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setUptimeDays(90)}
                    >
                      90 {effectiveGranularity === "day" ? "days" : effectiveGranularity === "hour" ? "hours" : "min"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {uptimeSeries.length > 0 ? (
                  <>
                    <UptimeBar
                      data={uptimeSeries.map((d: any) => ({
                        date: d.date,
                        timestamp: d.timestamp,
                        uptimePercentage: d.uptimePercentage,
                        status: getUptimeStatus(d),
                        successCount: d.successCount,
                        degradedCount: d.degradedCount,
                        failureCount: d.failureCount,
                        totalCount: d.totalCount,
                        incidents: d.incidents,
                      }))}
                      days={uptimeDays}
                      granularity={effectiveGranularity}
                      showLegend
                    />
                    <UptimeLegend />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <p>No uptime data yet</p>
                    <p className="text-sm">Checks will appear here once the monitor has run long enough.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Response Time Section - only for types that have response times */}
          {showsResponseTime && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{getPrimaryMetricLabel(monitorType)} Time</CardTitle>
                    <CardDescription>
                      Performance metrics over time
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={responseTimeHours === 1 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setResponseTimeHours(1)}
                    >
                      1h
                    </Button>
                    <Button
                      variant={responseTimeHours === 6 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setResponseTimeHours(6)}
                    >
                      6h
                    </Button>
                    <Button
                      variant={responseTimeHours === 24 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setResponseTimeHours(24)}
                    >
                      24h
                    </Button>
                    <Button
                      variant={responseTimeHours === 168 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setResponseTimeHours(168)}
                    >
                      7d
                    </Button>
                    <Button
                      variant={responseTimeHours === 720 ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setResponseTimeHours(720)}
                    >
                      30d
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {responseSeries.length > 0 || responseSummary ? (
                  <div className="space-y-4">
                    {responseSeries.length > 0 && (
                      <ResponseTimeChart
                        data={responseSeries}
                        degradedThreshold={monitor.degradedThresholdMs ?? undefined}
                        height={300}
                      />
                    )}
                    {responseSeries.length > 0 && responseSummary && <Separator />}
                    {responseSummary && (
                      <ResponseTimeStats
                        avg={responseSummary.avg ?? null}
                        min={responseSummary.min ?? null}
                        max={responseSummary.max ?? null}
                        p50={responseSummary.p50 ?? null}
                        p90={responseSummary.p90 ?? null}
                        p99={responseSummary.p99 ?? null}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <p>No response time data yet</p>
                    <p className="text-sm">We will plot response times after the monitor collects results.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Traceroute Hops Section - only for traceroute type */}
          {showsTraceroute && (
            <TracerouteHopsCard
              hops={tracerouteHops || []}
              target={tracerouteTarget}
            />
          )}
        </TabsContent>

        {/* Recent Checks Tab */}
        <TabsContent value="checks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Check Results</CardTitle>
              <CardDescription>
                Last 50 monitoring checks for this monitor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resultsLoading ? (
                <LoadingState variant="table" count={5} />
              ) : checkResults && checkResults.length > 0 ? (
                <DataTable
                  data={checkResults}
                  columns={checkResultColumns}
                  keyExtractor={(r) => r.id}
                />
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No check results yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Certificate Tab (for SSL/HTTPS monitors) */}
        {(monitor.type === "ssl" || monitor.type === "https") && (
          <TabsContent value="certificate" className="space-y-6">
            <div className="space-y-6">
              <CertificateDetailsCard
                certificateInfo={certInfo ?? null}
                additionalDetails={certificateAdditionalDetails ?? null}
                lastChecked={certificateLastChecked}
                checkStatus={certificateCheckStatus}
                errorMessage={certificateErrorMessage}
                errorCode={certificateErrorCode}
                sslConfig={certificateSslConfig}
              />

              <CertificateTransparencyCard
                status={certificateDetail?.ctStatus}
                recentCertificates={certificateDetail?.ctRecentCertificates}
                newCertificates={certificateDetail?.ctNewCertificates}
                unexpectedCertificates={certificateDetail?.ctUnexpectedCertificates}
                isLoading={certificateDetailLoading}
              />
            </div>
          </TabsContent>
        )}

        {/* PageSpeed Tab (for HTTP/HTTPS monitors with PageSpeed enabled) */}
        {(monitor.type === "http" || monitor.type === "https") && (monitor as any).config?.pagespeed?.enabled && (
          <TabsContent value="pagespeed" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <PageSpeedScoreCard
                scores={(checkResults?.[0] as any)?.pagespeedScores ?? null}
                strategy={(monitor as any).config?.pagespeed?.strategy ?? "mobile"}
                lastChecked={checkResults?.[0]?.createdAt ?? null}
                thresholds={(monitor as any).config?.pagespeed?.thresholds ?? null}
              />
              <WebVitalsCard
                webVitals={(checkResults?.[0] as any)?.webVitals ?? null}
                lastChecked={checkResults?.[0]?.createdAt ?? null}
              />
            </div>
          </TabsContent>
        )}

        {/* Security Headers Tab (for HTTP/HTTPS monitors with Security Headers enabled) */}
        {(monitor.type === "http" || monitor.type === "https") && (monitor as any).config?.securityHeaders?.enabled && (
          <TabsContent value="security" className="space-y-6">
            <SecurityHeadersCard
              securityHeaders={(checkResults?.[0] as any)?.securityHeaders ?? null}
              lastChecked={checkResults?.[0]?.createdAt ?? null}
            />
          </TabsContent>
        )}

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Monitor Configuration</CardTitle>
              <CardDescription>
                Current settings for this monitor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Name
                  </label>
                  <p className="mt-1">{monitor.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Type
                  </label>
                  <p className="mt-1 uppercase">{monitor.type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    URL
                  </label>
                  <p className="mt-1 break-all">{monitor.url}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Method
                  </label>
                  <p className="mt-1">{monitor.method || "GET"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Check Interval
                  </label>
                  <p className="mt-1">{monitor.intervalSeconds}s</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Timeout
                  </label>
                  <p className="mt-1">{monitor.timeoutMs}ms</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Regions
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {monitor.regions.map((region) => (
                      <Badge key={region} variant="outline">
                        {region}
                      </Badge>
                    ))}
                  </div>
                </div>
                {monitor.degradedThresholdMs && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Degraded Threshold
                    </label>
                    <p className="mt-1">{monitor.degradedThresholdMs}ms</p>
                  </div>
                )}
              </div>

              {monitor.description && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Description
                    </label>
                    <p className="mt-1">{monitor.description}</p>
                  </div>
                </>
              )}

              {monitor.assertions &&
                Object.keys(monitor.assertions).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Assertions
                      </label>
                      <div className="mt-2 space-y-2">
                        {monitor.assertions.statusCode && (
                          <div className="text-sm">
                            <span className="font-medium">Status Codes:</span>{" "}
                            {monitor.assertions.statusCode.join(", ")}
                          </div>
                        )}
                        {monitor.assertions.responseTime && (
                          <div className="text-sm">
                            <span className="font-medium">Max Response Time:</span>{" "}
                            {monitor.assertions.responseTime}ms
                          </div>
                        )}
                        {monitor.assertions.body?.contains && (
                          <div className="text-sm">
                            <span className="font-medium">Body Contains:</span>{" "}
                            {monitor.assertions.body.contains}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

              <div className="pt-4">
                <Link href={`/monitors/${monitorId}/edit`}>
                  <Button>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Monitor
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Alert Policies</CardTitle>
              <CardDescription>
                Configure when and how to be notified about this monitor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center">
                <Activity className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 font-medium">No alert policies configured</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create an alert policy to get notified when this monitor goes down.
                </p>
                <Link href="/alerts" className="mt-4 inline-block">
                  <Button>
                    <Activity className="mr-2 h-4 w-4" />
                    Configure Alerts
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Monitor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{monitor.name}&quot;? This
              action cannot be undone and all associated check results will be
              permanently deleted.
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
              onClick={handleDelete}
              disabled={deleteMonitor.isPending}
            >
              {deleteMonitor.isPending ? "Deleting..." : "Delete Monitor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
