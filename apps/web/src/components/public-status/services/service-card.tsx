"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  Globe,
  Activity,
  TrendingUp,
  AlertTriangle,
  History,
  MessageSquare,
  Shield,
  Mail,
  Heart,
  MapPin,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { cn, Badge, Button } from "@uni-status/ui";
import { ServiceDependencies } from "./service-dependencies";
import { ComponentSubscribeButton } from "../component-subscribe-button";
import {
  showsResponseTime,
  showsCertificate,
  showsUptime,
  showsEmailAuth,
  showsHeartbeat,
  getPrimaryMetricLabel,
  getUptimeColorClass,
  getCertificateColorClass,
  getEmailAuthColorClass,
  formatCertificateExpiry,
  formatEmailAuthScore,
  formatHeartbeatLastPing,
  getHeartbeatColorClass,
} from "../monitors/types";
import type { MonitorType, CertificateInfo, EmailAuthInfo, HeartbeatInfo } from "../monitors/types";

// Types matching the API response
interface ServiceMetrics {
  p50: number;
  p95: number;
  p99: number;
  avgResponseTimeMs: number;
}

interface ServiceDependency {
  id: string;
  description?: string | null;
}

interface ServiceActiveIncident {
  id: string;
  title: string;
  severity: string;
}

interface Service {
  id: string;
  name: string;
  description?: string | null;
  type: MonitorType;
  status: string;
  group?: string | null;
  order: number;
  regions: string[];
  lastCheckedAt?: string | null;
  metrics: ServiceMetrics | null;
  uptimePercentage: number | null;
  dependencies: {
    upstream: ServiceDependency[];
    downstream: ServiceDependency[];
  };
  activeIncidents: ServiceActiveIncident[];
  providerImpacts?: Array<{
    providerId: string;
    providerName: string;
    providerStatus: keyof typeof PROVIDER_STATUS_CONFIG | string;
  }>;
  baseStatus?: string | null;
  // Type-specific data
  certificateInfo?: CertificateInfo;
  emailAuthInfo?: EmailAuthInfo;
  heartbeatInfo?: HeartbeatInfo;
}

interface ServiceCardProps {
  service: Service;
  statusPageSlug: string;
  basePath?: string;
  settings?: {
    subscriptions: boolean;
    crowdsourcedReporting: boolean;
    showGeoMap?: boolean;
  };
}

// Status display configuration
const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  active: { label: "Operational", bgColor: "bg-[var(--status-success-text)]", textColor: "text-[var(--status-success-text)]" },
  degraded: { label: "Degraded", bgColor: "bg-[var(--status-warning-text)]", textColor: "text-[var(--status-warning-text)]" },
  down: { label: "Down", bgColor: "bg-[var(--status-error-text)]", textColor: "text-[var(--status-error-text)]" },
  pending: { label: "Pending", bgColor: "bg-[var(--status-gray-text)]", textColor: "text-[var(--status-gray-text)]" },
  paused: { label: "Paused", bgColor: "bg-[var(--status-gray-text)]", textColor: "text-[var(--status-gray-text)]" },
};

// Type labels for display
const TYPE_LABELS: Record<string, string> = {
  http: "HTTP",
  https: "HTTPS",
  tcp: "TCP",
  ping: "Ping",
  dns: "DNS",
  ssl: "SSL",
  heartbeat: "Heartbeat",
  grpc: "gRPC",
  websocket: "WebSocket",
  smtp: "SMTP",
  imap: "IMAP",
  pop3: "POP3",
  ssh: "SSH",
  ldap: "LDAP",
  rdp: "RDP",
  mqtt: "MQTT",
  amqp: "AMQP",
  database_postgres: "PostgreSQL",
  database_mysql: "MySQL",
  database_mongodb: "MongoDB",
  database_redis: "Redis",
  database_elasticsearch: "Elasticsearch",
  traceroute: "Traceroute",
  email_auth: "Email Auth",
};

const PROVIDER_STATUS_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string }
> = {
  operational: {
    label: "Operational",
    bgClass: "bg-[var(--status-success-bg)]",
    textClass: "text-[var(--status-success-text)]",
  },
  degraded: {
    label: "Degraded",
    bgClass: "bg-[var(--status-warning-bg)]",
    textClass: "text-[var(--status-warning-text)]",
  },
  partial_outage: {
    label: "Partial Outage",
    bgClass: "bg-[var(--status-orange-bg)]",
    textClass: "text-[var(--status-orange-text)]",
  },
  major_outage: {
    label: "Major Outage",
    bgClass: "bg-[var(--status-error-bg)]",
    textClass: "text-[var(--status-error-text)]",
  },
  maintenance: {
    label: "Maintenance",
    bgClass: "bg-[var(--status-info-bg)]",
    textClass: "text-[var(--status-info-text)]",
  },
  unknown: {
    label: "Unknown",
    bgClass: "bg-[var(--status-gray-bg)]",
    textClass: "text-[var(--status-gray-text)]",
  },
};

// Region labels
const REGION_LABELS: Record<string, string> = {
  uk: "UK",
  "us-east": "US East",
  "us-west": "US West",
  "eu-west": "EU West",
  "eu-central": "EU Central",
  "ap-southeast": "Asia Pacific",
  "ap-northeast": "Asia Northeast",
  "sa-east": "South America",
  "au-southeast": "Australia",
};

type PercentileKey = "p50" | "p95" | "p99";

export function ServiceCard({ service, statusPageSlug, basePath, settings }: ServiceCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPercentile, setSelectedPercentile] = useState<PercentileKey>("p95");
  const [isReporting, setIsReporting] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const statusConfig = STATUS_CONFIG[service.status] || STATUS_CONFIG.pending;
  const providerImpacts = service.providerImpacts || [];
  // Use basePath for links (empty string on custom domains, /status/{slug} on main domain)
  const linkBase = basePath ?? `/status/${statusPageSlug}`;

  const handleReportIssue = async () => {
    setIsReporting(true);
    setReportError(null);

    try {
      const response = await fetch(
        `/api/public/status-pages/${statusPageSlug}/report-down`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monitorId: service.id }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        if (data.error?.code === "RATE_LIMIT") {
          setReportError("Too many reports. Please try again later.");
        } else if (data.error?.code === "DISABLED") {
          setReportError("Reporting is not enabled.");
        } else {
          setReportError(data.error?.message || "Failed to submit report");
        }
        return;
      }

      setHasReported(true);
    } catch {
      setReportError("Network error. Please try again.");
    } finally {
      setIsReporting(false);
    }
  };

  const hasIncidents = service.activeIncidents.length > 0;
  const hasDependencies =
    service.dependencies.upstream.length > 0 ||
    service.dependencies.downstream.length > 0;

  return (
    <div
      className={cn(
        "bg-[var(--status-card)] rounded-lg border p-4 transition-all hover:shadow-md",
        hasIncidents && "border-status-error-solid/50"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div
            className={cn("w-3 h-3 rounded-full", statusConfig.bgColor)}
            title={statusConfig.label}
          />
          <div>
            <h3 className="font-semibold text-base">{service.name}</h3>
            {service.description && (
              <p className="text-sm text-[var(--status-muted-text)] line-clamp-1">
                {service.description}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {TYPE_LABELS[service.type] || service.type}
        </Badge>
      </div>

      {/* Provider impacts */}
      {providerImpacts.length > 0 && (
        <div className="mb-3 p-2 rounded-md bg-[var(--status-warning-bg)] border border-[var(--status-warning-text)]/30">
          <div className="flex items-center gap-2 text-[var(--status-warning-text)] text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Upstream provider issue
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {providerImpacts.map((impact) => {
              const cfg = PROVIDER_STATUS_CONFIG[impact.providerStatus] || PROVIDER_STATUS_CONFIG.unknown;
              return (
                <Badge
                  key={`${impact.providerId}-${impact.providerStatus}`}
                  variant="outline"
                  className={cn("text-xs", cfg.textClass, cfg.bgClass)}
                >
                  {impact.providerName} · {cfg.label}
                </Badge>
              );
            })}
          </div>
          {service.baseStatus && service.baseStatus !== service.status && (
            <div className="mt-1 text-xs text-[var(--status-muted-text)]">
              Base status: {service.baseStatus}
            </div>
          )}
        </div>
      )}

      {/* Active Incidents Warning */}
      {hasIncidents && (
        <div className="mb-3 p-2 bg-status-error-bg rounded-md">
          <div className="flex items-center gap-2 text-status-error-text text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            {service.activeIncidents.length} Active Incident
            {service.activeIncidents.length > 1 ? "s" : ""}
          </div>
          <div className="mt-1 text-xs text-[var(--status-muted-text)]">
            {service.activeIncidents.map((inc) => inc.title).join(", ")}
          </div>
        </div>
      )}

      {/* Type-Specific Metrics Row */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        {/* Uptime - only for types that show it */}
        {showsUptime(service.type) && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
            <span className={cn("font-medium", getUptimeColorClass(service.uptimePercentage))}>
              {service.uptimePercentage !== null
                ? `${service.uptimePercentage.toFixed(2)}%`
                : "N/A"}
            </span>
          </div>
        )}

        {/* Response/Connection Time - only for relevant types */}
        {showsResponseTime(service.type) && service.metrics && (
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
            <span className="font-medium">
              {service.metrics[selectedPercentile]}ms
            </span>
            <span className="text-xs text-[var(--status-muted-text)]">
              {selectedPercentile.toUpperCase()} {getPrimaryMetricLabel(service.type)}
            </span>
          </div>
        )}

        {/* Certificate info - for SSL/HTTPS */}
        {showsCertificate(service.type) && service.certificateInfo && (
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
            <span className={cn("font-medium", getCertificateColorClass(service.certificateInfo.daysUntilExpiry))}>
              {formatCertificateExpiry(service.certificateInfo.daysUntilExpiry)}
            </span>
          </div>
        )}

        {/* Email Auth - for email_auth type */}
        {showsEmailAuth(service.type) && service.emailAuthInfo && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
            <span className={cn("font-medium", getEmailAuthColorClass(service.emailAuthInfo.overallScore))}>
              {formatEmailAuthScore(service.emailAuthInfo.overallScore)}
            </span>
          </div>
        )}

        {/* Heartbeat - for heartbeat type */}
        {showsHeartbeat(service.type) && service.heartbeatInfo && (
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
            <span className={cn("font-medium", getHeartbeatColorClass(service.heartbeatInfo.lastPingAt, service.heartbeatInfo.expectedIntervalSeconds))}>
              {formatHeartbeatLastPing(service.heartbeatInfo.lastPingAt)}
            </span>
          </div>
        )}

        {/* Last Checked - always show */}
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
          <span className="text-[var(--status-muted-text)] text-xs">
            {service.lastCheckedAt
              ? formatDistanceToNow(new Date(service.lastCheckedAt), {
                  addSuffix: true,
                })
              : "Never"}
          </span>
        </div>
      </div>

      {/* Regions */}
      {service.regions.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-3.5 w-3.5 text-[var(--status-muted-text)]" />
          <div className="flex gap-1 flex-wrap">
            {service.regions.map((region) => (
              <Badge key={region} variant="secondary" className="text-xs py-0">
                {REGION_LABELS[region] || region}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      {hasDependencies && (
        <div className="mb-3">
          <ServiceDependencies
            upstream={service.dependencies.upstream}
            downstream={service.dependencies.downstream}
          />
        </div>
      )}

      {/* Detailed Metrics (expandable) - Type-specific */}
      {showDetails && (
        <div className="mb-3 p-3 bg-[var(--status-muted)]/50 rounded-md space-y-3">
          {/* Response Times - for relevant types */}
          {showsResponseTime(service.type) && service.metrics && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-[var(--status-muted-text)]">
                  {getPrimaryMetricLabel(service.type)} Times (30 days)
                </div>
                <div className="flex gap-1">
                  {(["p50", "p95", "p99"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSelectedPercentile(p)}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded transition-colors",
                        selectedPercentile === p
                          ? "bg-primary text-primary-foreground"
                          : "bg-[var(--status-muted)] hover:bg-[var(--status-muted)]/80 text-[var(--status-muted-text)]"
                      )}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">Avg</div>
                  <div className="font-medium">{service.metrics.avgResponseTimeMs}ms</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">P50</div>
                  <div className={cn("font-medium", selectedPercentile === "p50" && "text-primary")}>{service.metrics.p50}ms</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">P95</div>
                  <div className={cn("font-medium", selectedPercentile === "p95" && "text-primary")}>{service.metrics.p95}ms</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">P99</div>
                  <div className={cn("font-medium", selectedPercentile === "p99" && "text-primary")}>{service.metrics.p99}ms</div>
                </div>
              </div>
            </div>
          )}

          {/* Certificate Details - for SSL/HTTPS */}
          {showsCertificate(service.type) && service.certificateInfo && (
            <div>
              <div className="text-xs font-medium text-[var(--status-muted-text)] mb-2">
                Certificate Details
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">Expires In</div>
                  <div className={cn("font-medium", getCertificateColorClass(service.certificateInfo.daysUntilExpiry))}>
                    {formatCertificateExpiry(service.certificateInfo.daysUntilExpiry)}
                  </div>
                </div>
                {service.certificateInfo.issuer && (
                  <div>
                    <div className="text-xs text-[var(--status-muted-text)]">Issuer</div>
                    <div className="font-medium truncate">{service.certificateInfo.issuer}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Email Auth Details - for email_auth type */}
          {showsEmailAuth(service.type) && service.emailAuthInfo && (
            <div>
              <div className="text-xs font-medium text-[var(--status-muted-text)] mb-2">
                Email Authentication
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">SPF</div>
                  <div className={cn("font-medium", getAuthStatusColor(service.emailAuthInfo.spfStatus))}>
                    {service.emailAuthInfo.spfStatus}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">DKIM</div>
                  <div className={cn("font-medium", getAuthStatusColor(service.emailAuthInfo.dkimStatus))}>
                    {service.emailAuthInfo.dkimStatus}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">DMARC</div>
                  <div className={cn("font-medium", getAuthStatusColor(service.emailAuthInfo.dmarcStatus))}>
                    {service.emailAuthInfo.dmarcStatus}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Heartbeat Details - for heartbeat type */}
          {showsHeartbeat(service.type) && service.heartbeatInfo && (
            <div>
              <div className="text-xs font-medium text-[var(--status-muted-text)] mb-2">
                Heartbeat Details
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">Last Ping</div>
                  <div className="font-medium">
                    {formatHeartbeatLastPing(service.heartbeatInfo.lastPingAt)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-muted-text)]">Expected Interval</div>
                  <div className="font-medium">{service.heartbeatInfo.expectedIntervalSeconds}s</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Less Details" : "More Details"}
        </Button>

        <div className="flex gap-1">
          {settings?.subscriptions && (
            <ComponentSubscribeButton
              slug={statusPageSlug}
              monitorId={service.id}
              monitorName={service.name}
              variant="icon"
              size="sm"
            />
          )}

          <Link href={`${linkBase}/events?monitor=${service.id}`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View History">
              <History className="h-4 w-4" />
            </Button>
          </Link>

          {(settings?.showGeoMap ?? true) && (
            <Link href={`${linkBase}/geo`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View on Map">
                <MapPin className="h-4 w-4" />
              </Button>
            </Link>
          )}

          {settings?.crowdsourcedReporting && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0",
                hasReported && "text-status-success-solid",
                reportError && "text-status-error-solid"
              )}
              title={
                hasReported
                  ? "Thanks for reporting"
                  : reportError
                    ? reportError
                    : "Report Issue"
              }
              onClick={handleReportIssue}
              disabled={isReporting || hasReported}
            >
              {isReporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasReported ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper for auth status colors
function getAuthStatusColor(status: string): string {
  switch (status) {
    case "pass":
      return "text-[var(--status-success-text)]";
    case "partial":
      return "text-[var(--status-warning-text)]";
    case "fail":
    case "error":
      return "text-[var(--status-error-text)]";
    default:
      return "text-[var(--status-muted-text)]";
  }
}
