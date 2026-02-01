"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Server,
  Globe,
  Activity,
  Clock,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  Layers,
  Filter,
} from "lucide-react";
import {
  cn,
  Button,
  Input,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@uni-status/ui";
import { ServiceCard } from "@/components/public-status/services/service-card";
import { formatDistanceToNow } from "date-fns";
import { showsUptime, type MonitorType, type CertificateInfo, type EmailAuthInfo, type HeartbeatInfo } from "@/components/public-status/monitors/types";

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

// Types for the services API response
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
  baseStatus?: string;
  providerImpacts?: Array<{
    providerId: string;
    providerName: string;
    providerStatus: "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
    providerStatusText?: string | null;
  }>;
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
  // Type-specific data
  certificateInfo?: CertificateInfo;
  emailAuthInfo?: EmailAuthInfo;
  heartbeatInfo?: HeartbeatInfo;
}

interface ServicesResponse {
  success: boolean;
  data?: {
    services: Service[];
    groups: Record<string, Service[]>;
    groupBy: string;
    activeIncidentsCount: number;
    settings: {
      subscriptions: boolean;
      crowdsourcedReporting: boolean;
      showGeoMap?: boolean;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

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

type GroupByOption = "group" | "type" | "region" | "status" | "none";

async function fetchServices(
  slug: string,
  groupBy: GroupByOption
): Promise<ServicesResponse> {
  const response = await fetch(
    `${getApiUrl()}/public/status-pages/${slug}/services?groupBy=${groupBy}`,
    {
      credentials: "include",
    }
  );
  return response.json();
}

async function fetchStatusPageData(slug: string): Promise<StatusPageResponse> {
  const response = await fetch(`${getApiUrl()}/public/status-pages/${slug}`, {
    credentials: "include",
  });
  return response.json();
}

// Group labels for display
const GROUP_BY_LABELS: Record<GroupByOption, string> = {
  group: "By Group",
  type: "By Type",
  region: "By Region",
  status: "By Status",
  none: "No Grouping",
};

// Status display configuration
const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  active: { label: "Operational", variant: "default", color: "bg-status-success-solid" },
  degraded: { label: "Degraded", variant: "secondary", color: "bg-status-warning-solid" },
  down: { label: "Down", variant: "destructive", color: "bg-status-error-solid" },
  pending: { label: "Pending", variant: "outline", color: "bg-status-gray-solid" },
  paused: { label: "Paused", variant: "outline", color: "bg-status-gray-solid" },
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

export default function PublicServicesPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug;

  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupByOption>(
    (searchParams.get("groupBy") as GroupByOption) || "group"
  );
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Fetch status page data for name
  const { data: statusPageData } = useQuery({
    queryKey: ["public-status-page", slug],
    queryFn: () => fetchStatusPageData(slug),
    enabled: !!slug,
    staleTime: 60000,
  });

  // Fetch services data
  const { data: servicesData, isLoading, isError } = useQuery({
    queryKey: ["public-services", slug, groupBy],
    queryFn: () => fetchServices(slug, groupBy),
    enabled: !!slug,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Handle groupBy change
  const handleGroupByChange = (value: GroupByOption) => {
    setGroupBy(value);
    const newParams = new URLSearchParams(searchParams.toString());
    if (value === "group") {
      newParams.delete("groupBy");
    } else {
      newParams.set("groupBy", value);
    }
    router.push(`/status/${slug}/services?${newParams.toString()}`);
  };

  // Filter services
  const filteredServices = useMemo(() => {
    if (!servicesData?.data?.services) return [];

    return servicesData.data.services.filter((service) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          service.name.toLowerCase().includes(query) ||
          service.description?.toLowerCase().includes(query) ||
          service.type.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter.length > 0 && !statusFilter.includes(service.status)) {
        return false;
      }

      return true;
    });
  }, [servicesData, searchQuery, statusFilter]);

  // Group filtered services
  const groupedServices = useMemo(() => {
    if (groupBy === "none") {
      return { "All Services": filteredServices };
    }

    const groups: Record<string, Service[]> = {};
    for (const service of filteredServices) {
      let groupKey: string;

      switch (groupBy) {
        case "type":
          groupKey = TYPE_LABELS[service.type] || service.type;
          break;
        case "region":
          groupKey = service.regions?.[0] || "Unknown";
          break;
        case "status":
          groupKey = STATUS_CONFIG[service.status]?.label || service.status;
          break;
        case "group":
        default:
          groupKey = service.group || "Ungrouped";
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(service);
    }

    return groups;
  }, [filteredServices, groupBy]);

  // Get all unique statuses for filter
  const availableStatuses = useMemo(() => {
    if (!servicesData?.data?.services) return [];
    const statuses = new Set(servicesData.data.services.map((s) => s.status));
    return Array.from(statuses);
  }, [servicesData]);

  const statusPageName = statusPageData?.data?.statusPage?.name || "Status";

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium">Unable to load services</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Please try again later
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
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
              <h1 className="text-2xl font-bold">{statusPageName} - Services</h1>
              <p className="text-muted-foreground mt-1">
                Service catalog and component status
              </p>
            </div>

            {servicesData?.data?.activeIncidentsCount ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {servicesData.data.activeIncidentsCount} Active Incident
                {servicesData.data.activeIncidentsCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Select value={groupBy} onValueChange={handleGroupByChange}>
              <SelectTrigger className="w-[150px]">
                <Layers className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GROUP_BY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter badges */}
            <div className="flex gap-1 flex-wrap">
              {availableStatuses.map((status) => {
                const config = STATUS_CONFIG[status] || { label: status, variant: "outline" as const };
                const isSelected = statusFilter.includes(status);
                return (
                  <Badge
                    key={status}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer",
                      isSelected && config.color
                    )}
                    onClick={() => {
                      if (isSelected) {
                        setStatusFilter(statusFilter.filter((s) => s !== status));
                      } else {
                        setStatusFilter([...statusFilter, status]);
                      }
                    }}
                  >
                    {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        {servicesData?.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Server className="h-4 w-4" />
                Total Services
              </div>
              <div className="text-2xl font-bold mt-1">
                {servicesData.data.services.length}
              </div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Activity className="h-4 w-4" />
                Operational
              </div>
              <div className="text-2xl font-bold mt-1 text-status-success-solid">
                {servicesData.data.services.filter((s) => s.status === "active").length}
              </div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="h-4 w-4" />
                Avg Uptime
              </div>
              <div className="text-2xl font-bold mt-1">
                {(() => {
                  // Only include services that should show uptime (excludes SSL-only)
                  const withUptime = servicesData.data.services.filter(
                    (s) => showsUptime(s.type) && s.uptimePercentage !== null
                  );
                  if (withUptime.length === 0) return "N/A";
                  const avg =
                    withUptime.reduce((sum, s) => sum + (s.uptimePercentage || 0), 0) /
                    withUptime.length;
                  return `${avg.toFixed(2)}%`;
                })()}
              </div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Globe className="h-4 w-4" />
                Regions
              </div>
              <div className="text-2xl font-bold mt-1">
                {(() => {
                  const regions = new Set<string>();
                  servicesData.data.services.forEach((s) => {
                    (s.regions || []).forEach((r) => regions.add(r));
                  });
                  return regions.size;
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Services Grid */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card rounded-lg border p-6 animate-pulse"
              >
                <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium">No services found</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {searchQuery || statusFilter.length > 0
                ? "Try adjusting your filters"
                : "No services are configured for this status page"}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedServices).map(([groupName, services]) => {
              // Hide header when groupBy is "none", or when all services are ungrouped (single "Ungrouped" group)
              const groupKeys = Object.keys(groupedServices);
              const hideHeader = groupBy === "none" ||
                (groupBy === "group" && groupKeys.length === 1 && groupKeys[0] === "Ungrouped");

              return (
              <div key={groupName}>
                {!hideHeader && (
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">{groupName}</h2>
                    <Badge variant="secondary">{services.length}</Badge>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      statusPageSlug={slug}
                      settings={servicesData?.data?.settings}
                    />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
