"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { Plus, Trash2, Settings2, ChevronDown, ChevronUp, Shield, Zap } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  Switch,
  Separator,
  Badge,
  cn,
} from "@uni-status/ui";
import { useCreateMonitor, useUpdateMonitor } from "@/hooks/use-monitors";
import { useBulkCreateDependencies, useDeleteDependency } from "@/hooks/use-dependencies";
import type { Monitor } from "@/lib/api-client";
import {
  MONITOR_TYPE_GROUPS,
  getUrlInputConfig,
  DNSConfigSection,
  HeartbeatConfigSection,
  DatabaseConfigSection,
  EmailServerConfigSection,
  EmailAuthConfigSection,
  GrpcConfigSection,
  WebsocketConfigSection,
  ProtocolConfigSection,
  BrokerConfigSection,
  TracerouteConfigSection,
  WebVitalsThresholdsSection,
  CollapsibleSection,
  DEFAULT_PORTS,
  PrometheusConfigSection,
  ExternalStatusConfigSection,
  AggregateConfigSection,
} from "./monitor-config-sections";
import { MonitorDependenciesSection } from "./monitor-dependencies-section";

// Region response type
interface RegionsResponse {
  success: boolean;
  data: {
    regions: string[];
    default: string;
    isEmpty: boolean;
  };
}

// Fetch regions from API
async function fetchRegions(apiUrl: string): Promise<RegionsResponse> {
  const res = await fetch(`${apiUrl}/api/public/regions`);
  if (!res.ok) {
    throw new Error("Failed to fetch regions");
  }
  return res.json();
}

// All monitor types including external status providers
const monitorTypes = [
  "http", "https", "dns", "ssl", "tcp", "ping",
  "heartbeat",
  "database_postgres", "database_mysql", "database_mongodb", "database_redis", "database_elasticsearch",
  "grpc", "websocket",
  "smtp", "imap", "pop3", "email_auth",
  "ssh", "ldap", "rdp",
  "mqtt", "amqp",
  "traceroute",
  "prometheus_blackbox", "prometheus_promql", "prometheus_remote_write",
  // External status providers
  "external_aws", "external_gcp", "external_azure", "external_cloudflare",
  "external_okta", "external_auth0", "external_stripe", "external_twilio",
  "external_statuspage", "external_custom",
  // Advanced
  "aggregate",
] as const;

const monitorFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  url: z.string().min(1, "URL/Host is required"),
  type: z.enum(monitorTypes),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  intervalSeconds: z.number().min(30).max(86400), // Up to 24 hours for heartbeat
  timeoutMs: z.number().min(1000).max(60000),
  regions: z.array(z.string()).min(1, "Select at least one region"),
  degradedThresholdMs: z.union([
    z.number().positive(),
    z.nan(),
    z.null(),
  ]).optional(),
  degradedAfterCount: z.number().int().min(1).max(10).optional(),
  downAfterCount: z.number().int().min(1).max(10).optional(),
  headers: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  body: z.string().optional(),
  assertions: z.object({
    statusCode: z.array(z.number()).optional(),
    responseTime: z.number().positive().optional().nullable(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.object({
      contains: z.string().optional(),
      notContains: z.string().optional(),
      regex: z.string().optional(),
      jsonPath: z.array(z.object({
        path: z.string(),
        value: z.unknown(),
      })).optional(),
    }).optional(),
  }).optional(),
  // Extended configuration for all monitor types
  config: z.object({
    // DNS Configuration
    dns: z.object({
      recordType: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "SRV", "NS", "SOA", "PTR"]).optional(),
      nameserver: z.string().optional(),
      expectedValue: z.string().optional(),
      resolvers: z.array(z.object({
        endpoint: z.string(),
        type: z.enum(["udp", "doh", "dot"]).optional(),
        region: z.string().optional(),
        name: z.string().optional(),
      })).optional(),
      propagationCheck: z.boolean().optional(),
      resolverStrategy: z.enum(["any", "quorum", "all"]).optional(),
      dnssecValidation: z.boolean().optional(),
      dohEndpoint: z.string().optional(),
      dotEndpoint: z.string().optional(),
      anycastCheck: z.boolean().optional(),
      regionTargetsInput: z.string().optional(),
      regionTargets: z.array(z.string()).optional(),
    }).optional(),
    // SSL Configuration
    ssl: z.object({
      enabled: z.boolean().optional(),
      expiryWarningDays: z.number().min(1).max(365).optional(),
      expiryErrorDays: z.number().min(1).max(90).optional(),
      checkChain: z.boolean().optional(),
      checkHostname: z.boolean().optional(),
      minTlsVersion: z.enum(["TLSv1.2", "TLSv1.3"]).optional(),
      allowedCiphersInput: z.string().optional(),
      blockedCiphersInput: z.string().optional(),
      requireOcspStapling: z.boolean().optional(),
      ocspCheck: z.boolean().optional(),
      ocspResponderTimeoutMs: z.number().min(500).max(30000).optional(),
      checkCrl: z.boolean().optional(),
      requireCompleteChain: z.boolean().optional(),
      caaCheck: z.boolean().optional(),
      caaIssuersInput: z.string().optional(),
    }).optional(),
    // Heartbeat Configuration
    heartbeat: z.object({
      expectedInterval: z.number().min(60).max(86400).optional(),
      gracePeriod: z.number().min(0).max(3600).optional(),
      timezone: z.string().optional(),
    }).optional(),
    // Database Configuration
    database: z.object({
      host: z.string().optional(),
      port: z.number().min(1).max(65535).optional(),
      database: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      ssl: z.boolean().optional(),
      query: z.string().optional(),
      expectedRowCount: z.number().int().min(0).optional(),
    }).optional(),
    // gRPC Configuration
    grpc: z.object({
      service: z.string().optional(),
      method: z.string().optional(),
      requestMessage: z.string().optional(), // JSON string
      tls: z.boolean().optional(),
      metadataArray: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
    }).optional(),
    // WebSocket Configuration
    websocket: z.object({
      headersArray: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
      sendMessage: z.string().optional(),
      expectMessage: z.string().optional(),
      closeTimeout: z.number().min(1000).max(60000).optional(),
    }).optional(),
    // Email Server Configuration (SMTP/IMAP/POP3)
    emailServer: z.object({
      host: z.string().optional(),
      port: z.number().min(1).max(65535).optional(),
      tls: z.boolean().optional(),
      starttls: z.boolean().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      authMethod: z.enum(["plain", "login", "cram-md5"]).optional(),
    }).optional(),
    // Protocol Configuration (SSH/LDAP/RDP)
    protocol: z.object({
      host: z.string().optional(),
      port: z.number().min(1).max(65535).optional(),
      expectBanner: z.string().optional(),
      ldapBaseDn: z.string().optional(),
      ldapFilter: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    }).optional(),
    // Broker Configuration (MQTT/AMQP)
    broker: z.object({
      username: z.string().optional(),
      password: z.string().optional(),
      topic: z.string().optional(),
      queue: z.string().optional(),
      vhost: z.string().optional(),
      tls: z.boolean().optional(),
    }).optional(),
    // Traceroute Configuration
    traceroute: z.object({
      maxHops: z.number().min(1).max(64).optional(),
      timeout: z.number().min(1000).max(30000).optional(),
      protocol: z.enum(["icmp", "udp", "tcp"]).optional(),
    }).optional(),
    // Email Authentication Configuration (SPF/DKIM/DMARC)
    emailAuth: z.object({
      domain: z.string().optional(),
      dkimSelectorsInput: z.string().optional(), // Comma-separated, processed on submit
      dkimSelectors: z.array(z.string()).optional(),
      nameserver: z.string().optional(),
      validatePolicy: z.boolean().optional(),
    }).optional(),
    // PageSpeed Configuration
    pagespeed: z.object({
      enabled: z.boolean().optional(),
      strategy: z.enum(["mobile", "desktop", "both"]).optional(),
      categories: z.array(z.enum(["performance", "accessibility", "best-practices", "seo"])).optional(),
      thresholds: z.object({
        performance: z.number().min(0).max(100).optional(),
        accessibility: z.number().min(0).max(100).optional(),
        bestPractices: z.number().min(0).max(100).optional(),
        seo: z.number().min(0).max(100).optional(),
      }).optional(),
      webVitalsThresholds: z.object({
        lcp: z.number().min(0).optional(),
        fid: z.number().min(0).optional(),
        cls: z.number().min(0).max(1).optional(),
      }).optional(),
    }).optional(),
    // Security Headers Configuration
    securityHeaders: z.object({
      enabled: z.boolean().optional(),
      minScore: z.number().min(0).max(100).optional(),
      checkHstsPreload: z.boolean().optional(),
    }).optional(),
    // HTTP Behavioral Configuration
    http: z.object({
      cache: z.object({
        requireCacheControl: z.boolean().optional(),
        requireEtag: z.boolean().optional(),
        allowNoStore: z.boolean().optional(),
        maxAgeSeconds: z.number().optional(),
        allowedCacheControlInput: z.string().optional(),
      }).optional(),
      responseSize: z.object({
        warnBytes: z.number().optional(),
        errorBytes: z.number().optional(),
      }).optional(),
      graphql: z.object({
        operations: z.array(z.object({
          name: z.string().optional(),
          type: z.enum(["query", "mutation", "introspection"]).optional(),
          query: z.string().optional(),
          urlOverride: z.string().optional(),
          expectErrors: z.boolean().optional(),
          expectIntrospectionEnabled: z.boolean().optional(),
          variablesInput: z.string().optional(),
        })).optional(),
      }).optional(),
      apiFlows: z.array(z.object({
        name: z.string().optional(),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
        url: z.string().optional(),
        headers: z.any().optional(),
        body: z.string().optional(),
        expectStatusInput: z.string().optional(),
        saveAs: z.string().optional(),
        extractInput: z.string().optional(),
      })).optional(),
      syntheticBrowser: z.object({
        enabled: z.boolean().optional(),
        screenshot: z.boolean().optional(),
        visualRegression: z.boolean().optional(),
        maxWaitMs: z.number().min(1000).max(60000).optional(),
        steps: z.array(z.object({
          action: z.enum(["goto", "click", "type", "waitForSelector", "waitForTimeout"]).optional(),
          target: z.string().optional(),
          value: z.string().optional(),
        })).optional(),
      }).optional(),
      contract: z.object({
        enabled: z.boolean().optional(),
        path: z.string().optional(),
        method: z.enum(["get", "post", "put", "patch", "delete", "head", "options"]).optional(),
        statusCode: z.number().optional(),
        requiredFieldsInput: z.string().optional(),
        operationId: z.string().optional(),
        openapi: z.any().optional(),
      }).optional(),
    }).optional(),
    // Prometheus / metrics configuration
    prometheus: z.object({
      exporterUrl: z.string().url().optional(),
      prometheusUrl: z.string().url().optional(),
      module: z.string().optional(),
      probePath: z.string().optional(),
      targetsInput: z.string().optional(),
      timeoutSeconds: z.number().min(1).max(300).optional(),
      multiTargetStrategy: z.enum(["any", "quorum", "all"]).optional(),
      preferOrgEmbedded: z.boolean().optional(),
      promql: z.object({
        query: z.string().optional(),
        lookbackSeconds: z.number().min(30).max(86400).optional(),
        stepSeconds: z.number().min(5).max(3600).optional(),
        authToken: z.string().optional(),
        prometheusUrl: z.string().url().optional(),
      }).optional(),
      thresholds: z.object({
        degraded: z.number().optional(),
        down: z.number().optional(),
        comparison: z.enum(["gte", "lte"]).optional(),
        normalizePercent: z.boolean().optional(),
      }).optional(),
      remoteWrite: z.object({
        regionLabel: z.string().optional(),
      }).optional(),
    }).optional(),
    // CDN/Edge vs Origin configuration
    cdn: z.object({
      edgeUrl: z.string().optional(),
      originUrl: z.string().optional(),
      edgeHeaders: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
      originHeaders: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
      compareToleranceMs: z.number().min(1).max(60000).optional(),
      requireStatusMatch: z.boolean().optional(),
    }).optional(),
    // External Status Provider configuration
    externalStatus: z.object({
      pollIntervalSeconds: z.number().min(60).max(3600).optional(),
      aws: z.object({
        regions: z.array(z.string()).optional(),
        services: z.array(z.string()).optional(),
      }).optional(),
      gcp: z.object({
        zones: z.array(z.string()).optional(),
        products: z.array(z.string()).optional(),
      }).optional(),
      azure: z.object({
        regions: z.array(z.string()).optional(),
        services: z.array(z.string()).optional(),
      }).optional(),
      cloudflare: z.object({
        components: z.array(z.string()).optional(),
      }).optional(),
      okta: z.object({
        cell: z.string().optional(),
      }).optional(),
      auth0: z.object({
        region: z.string().optional(),
      }).optional(),
      stripe: z.object({
        components: z.array(z.string()).optional(),
      }).optional(),
      twilio: z.object({
        components: z.array(z.string()).optional(),
      }).optional(),
      statuspage: z.object({
        baseUrl: z.string().optional(),
        components: z.array(z.string()).optional(),
      }).optional(),
      custom: z.object({
        statusUrl: z.string().optional(),
        jsonPath: z.string().optional(),
        statusMapping: z.record(z.string(), z.string()).optional(),
      }).optional(),
    }).optional(),
    // Aggregate Monitor configuration
    aggregate: z.object({
      thresholdMode: z.enum(["absolute", "percentage"]).optional(),
      degradedThresholdCount: z.number().int().min(1).optional(),
      downThresholdCount: z.number().int().min(1).optional(),
      degradedThresholdPercent: z.number().min(1).max(100).optional(),
      downThresholdPercent: z.number().min(1).max(100).optional(),
      countDegradedAsDown: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

type MonitorFormData = z.infer<typeof monitorFormSchema>;

interface MonitorFormProps {
  monitor?: Monitor;
  mode: "create" | "edit";
}

// Format region ID to display label
function formatRegionLabel(regionId: string): string {
  const labels: Record<string, string> = {
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
  return labels[regionId] || regionId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

const INTERVALS = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

// Normalize optional number inputs so empty fields don't become NaN
const parseOptionalNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(numberValue as number) ? undefined : numberValue as number;
};

const withDefaultNumber = (value: unknown, fallback: number) => {
  if (value === null || value === undefined) return fallback;
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(numberValue as number) ? fallback : numberValue as number;
};

function createDefaultHttpAssertions(): NonNullable<MonitorFormData["assertions"]> {
  return {
    statusCode: [200],
    responseTime: null,
    headers: {},
    body: {
      contains: "",
      notContains: "",
      regex: "",
      jsonPath: [],
    },
  };
}

export function MonitorForm({ monitor, mode }: MonitorFormProps) {
  const router = useRouter();
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [hasTypeInteracted, setHasTypeInteracted] = useState(mode === "edit");

  // Dependency state for batch save
  const [pendingUpstreamIds, setPendingUpstreamIds] = useState<string[]>([]);
  const [removedDependencyIds, setRemovedDependencyIds] = useState<string[]>([]);

  const createMonitor = useCreateMonitor();
  const updateMonitor = useUpdateMonitor();
  const bulkCreateDependencies = useBulkCreateDependencies();
  const deleteDependency = useDeleteDependency();

  // Fetch available regions from active probes
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
  const { data: regionsData, isLoading: regionsLoading } = useQuery({
    queryKey: ["regions"],
    queryFn: () => fetchRegions(apiUrl),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Compute available regions from API response
  const availableRegions = useMemo(() => {
    if (!regionsData?.data?.regions?.length) {
      // Fallback when no probes are connected
      return [{ value: "uk", label: "UK" }];
    }
    return regionsData.data.regions.map((region) => ({
      value: region,
      label: formatRegionLabel(region),
    }));
  }, [regionsData]);

  const defaultRegion = regionsData?.data?.default || "uk";
  const hasNoProbes = regionsData?.data?.isEmpty ?? false;

  const existingConfig = (monitor as any)?.config ?? {};
  const defaultCdnConfig = (() => {
    const cdn = (existingConfig as any)?.cdn ?? {};
    const edgeHeaders = cdn.edgeHeaders
      ? Object.entries(cdn.edgeHeaders as Record<string, string>).map(([key, value]) => ({ key, value }))
      : [];
    const originHeaders = cdn.originHeaders
      ? Object.entries(cdn.originHeaders as Record<string, string>).map(([key, value]) => ({ key, value }))
      : [];
    return {
      requireStatusMatch: cdn.requireStatusMatch ?? false,
      compareToleranceMs: cdn.compareToleranceMs ?? undefined,
      edgeUrl: cdn.edgeUrl ?? "",
      originUrl: cdn.originUrl ?? "",
      edgeHeaders,
      originHeaders,
    };
  })();

  const defaultDnsConfig = {
    resolverStrategy: "any",
    propagationCheck: false,
    resolvers: [],
    anycastCheck: false,
    dnssecValidation: false,
    regionTargetsInput: (existingConfig.dns?.regionTargets as string[] | undefined)?.join(", ") ?? "",
    ...existingConfig.dns,
  };

  const defaultConfig = {
    ...existingConfig,
    dns: defaultDnsConfig,
    cdn: defaultCdnConfig,
    ssl: {
      expiryWarningDays: 30,
      expiryErrorDays: 7,
      checkChain: true,
      checkHostname: true,
      ...existingConfig.ssl,
    },
    pagespeed: {
      enabled: false,
      strategy: "mobile",
      categories: ["performance"],
      thresholds: {
        performance: undefined,
        accessibility: undefined,
        bestPractices: undefined,
        seo: undefined,
      },
      ...existingConfig.pagespeed,
    },
    externalStatus: {
      pollIntervalSeconds: 300,
      ...existingConfig.externalStatus,
    },
    aggregate: {
      thresholdMode: "absolute",
      countDegradedAsDown: false,
      ...existingConfig.aggregate,
    },
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MonitorFormData>({
    resolver: zodResolver(monitorFormSchema),
    defaultValues: {
      name: monitor?.name ?? "",
      description: monitor?.description ?? "",
      url: monitor?.url ?? "",
      type: monitor?.type ?? "https",
      method: (monitor?.method as typeof HTTP_METHODS[number]) ?? "GET",
      intervalSeconds: monitor?.intervalSeconds ?? 60,
      timeoutMs: monitor?.timeoutMs ?? 30000,
      regions: monitor?.regions ?? [defaultRegion],
      degradedThresholdMs: monitor?.degradedThresholdMs ?? null,
      degradedAfterCount: (monitor as any)?.degradedAfterCount ?? 1,
      downAfterCount: (monitor as any)?.downAfterCount ?? 1,
      headers: monitor?.headers
        ? Object.entries(monitor.headers).map(([key, value]) => ({ key, value }))
        : [],
      body: monitor?.body ?? "",
      assertions: monitor?.assertions ?? createDefaultHttpAssertions(),
      config: defaultConfig,
    },
  });

  const selectedRegions = watch("regions");
  const isSingleRegion = availableRegions.length <= 1;

  // Set default region when regions load and none selected
  useEffect(() => {
    if ((!selectedRegions || selectedRegions.length === 0) && availableRegions[0]) {
      setValue("regions", [availableRegions[0].value]);
    }
  }, [selectedRegions, setValue, availableRegions]);

  const { fields: headerFields, append: appendHeader, remove: removeHeader } =
    useFieldArray({
      control,
      name: "headers",
    });
  const { fields: edgeHeaderFields, append: appendEdgeHeader, remove: removeEdgeHeader } =
    useFieldArray({
      control,
      name: "config.cdn.edgeHeaders",
    });
  const { fields: originHeaderFields, append: appendOriginHeader, remove: removeOriginHeader } =
    useFieldArray({
      control,
      name: "config.cdn.originHeaders",
    });
  const { fields: graphqlOperationFields, append: appendGraphqlOperation, remove: removeGraphqlOperation } =
    useFieldArray({
      control,
      name: "config.http.graphql.operations",
    });
  const { fields: apiFlowFields, append: appendApiFlow, remove: removeApiFlow } =
    useFieldArray({
      control,
      name: "config.http.apiFlows",
    });
  const { fields: syntheticStepFields, append: appendSyntheticStep, remove: removeSyntheticStep } =
    useFieldArray({
      control,
      name: "config.http.syntheticBrowser.steps",
    });

  const watchedType = watch("type");
  const watchedMethod = watch("method");
  const watchedUrl = watch("url");

  // Track previous type to detect type changes
  const [previousType, setPreviousType] = useState(watchedType);

  // Reset type-specific fields when monitor type changes
  useEffect(() => {
    if (watchedType === previousType) return;

    const isHttpNow = watchedType === "http" || watchedType === "https";
    const regionsValue = (watch("regions")?.length ? watch("regions") : [defaultRegion]) as string[];

    reset({
      name: watch("name"),
      description: watch("description"),
      type: watchedType,
      url: "",
      method: "GET",
      intervalSeconds: watch("intervalSeconds") ?? 60,
      timeoutMs: watch("timeoutMs") ?? 30000,
      regions: regionsValue,
      degradedThresholdMs: null,
      headers: [],
      body: "",
      assertions: isHttpNow ? createDefaultHttpAssertions() : undefined,
      config: undefined,
    });

    setShowHeaders(false);
    setShowBody(false);
    setAdvancedMode(false);
    setPreviousType(watchedType);
  }, [watchedType, previousType, reset, watch, defaultRegion]);

  // Auto-detect monitor type based on URL input
  useEffect(() => {
    if (!watchedUrl || mode === "edit" || hasTypeInteracted) return;

    const url = watchedUrl.trim().toLowerCase();
    let detectedType: typeof monitorTypes[number] | null = null;

    // Protocol-based detection
    if (url.startsWith("https://")) {
      detectedType = "https";
    } else if (url.startsWith("http://")) {
      detectedType = "http";
    } else if (url.startsWith("wss://") || url.startsWith("ws://")) {
      detectedType = "websocket";
    } else if (url.startsWith("mqtt://") || url.startsWith("mqtts://")) {
      detectedType = "mqtt";
    } else if (url.startsWith("amqp://") || url.startsWith("amqps://")) {
      detectedType = "amqp";
    } else if (url.startsWith("grpc://") || url.startsWith("grpcs://")) {
      detectedType = "grpc";
    } else if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
      detectedType = "database_postgres";
    } else if (url.startsWith("mysql://")) {
      detectedType = "database_mysql";
    } else if (url.startsWith("mongodb://") || url.startsWith("mongodb+srv://")) {
      detectedType = "database_mongodb";
    } else if (url.startsWith("redis://") || url.startsWith("rediss://")) {
      detectedType = "database_redis";
    } else if (url.startsWith("ssh://")) {
      detectedType = "ssh";
    } else if (url.startsWith("ldap://") || url.startsWith("ldaps://")) {
      detectedType = "ldap";
    } else if (url.startsWith("rdp://")) {
      detectedType = "rdp";
    } else if (url.startsWith("smtp://") || url.startsWith("smtps://")) {
      detectedType = "smtp";
    } else if (url.startsWith("imap://") || url.startsWith("imaps://")) {
      detectedType = "imap";
    } else if (url.startsWith("pop3://") || url.startsWith("pop3s://")) {
      detectedType = "pop3";
    } else if (url.startsWith("tcp://")) {
      detectedType = "tcp";
    } else if (url.startsWith("ping://") || url.startsWith("icmp://")) {
      detectedType = "ping";
    } else if (url.startsWith("dns://")) {
      detectedType = "dns";
    } else {
      // Pattern-based detection for URLs without explicit protocol
      // Check for common domain patterns that suggest HTTPS
      if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+/.test(url)) {
        // Looks like a domain name - default to https
        detectedType = "https";
      }
      // Check for IP:port patterns (could be TCP)
      else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(url)) {
        detectedType = "tcp";
      }
      // Check for hostname:port patterns
      else if (/^[a-z0-9.-]+:\d+$/.test(url)) {
        // Could be many things, check common ports
        const portMatch = url.match(/:(\d+)$/);
        if (portMatch) {
          const port = parseInt(portMatch[1]);
          switch (port) {
            case 22: detectedType = "ssh"; break;
            case 25: case 465: case 587: detectedType = "smtp"; break;
            case 53: detectedType = "dns"; break;
            case 80: detectedType = "http"; break;
            case 110: case 995: detectedType = "pop3"; break;
            case 143: case 993: detectedType = "imap"; break;
            case 389: case 636: detectedType = "ldap"; break;
            case 443: detectedType = "https"; break;
            case 1433: case 1521: case 3306: detectedType = "database_mysql"; break;
            case 5432: detectedType = "database_postgres"; break;
            case 1883: case 8883: detectedType = "mqtt"; break;
            case 3389: detectedType = "rdp"; break;
            case 5672: case 5671: detectedType = "amqp"; break;
            case 6379: detectedType = "database_redis"; break;
            case 9200: case 9243: detectedType = "database_elasticsearch"; break;
            case 27017: detectedType = "database_mongodb"; break;
            default: detectedType = "tcp"; break;
          }
        }
      }
    }

    if (detectedType && detectedType !== watchedType) {
      setValue("type", detectedType);
    }
  }, [watchedUrl, mode, setValue, watchedType, hasTypeInteracted]);

  // Type detection helpers
  const isHttpType = watchedType === "http" || watchedType === "https";
  const isTcpType = watchedType === "tcp";
  const isPingType = watchedType === "ping";
  const isDnsType = watchedType === "dns";
  const isSslType = watchedType === "ssl" || watchedType === "https";
  const isHeartbeatType = watchedType === "heartbeat";
  const isDatabaseType = watchedType.startsWith("database_");
  const isEmailServerType = ["smtp", "imap", "pop3"].includes(watchedType);
  const isEmailAuthType = watchedType === "email_auth";
  const isGrpcType = watchedType === "grpc";
  const isWebsocketType = watchedType === "websocket";
  const isProtocolType = ["ssh", "ldap", "rdp"].includes(watchedType);
  const isBrokerType = ["mqtt", "amqp"].includes(watchedType);
  const isTracerouteType = watchedType === "traceroute";
  const isPrometheusBlackbox = watchedType === "prometheus_blackbox";
  const isPrometheusPromql = watchedType === "prometheus_promql";
  const isPrometheusRemoteWrite = watchedType === "prometheus_remote_write";
  const isPrometheusType = isPrometheusBlackbox || isPrometheusPromql || isPrometheusRemoteWrite;
  const isExternalStatusType = watchedType.startsWith("external_");
  const certificateMonitoringEnabled = watch("config.ssl.enabled" as const) ?? true;

  const methodSupportsBody = ["POST", "PUT", "PATCH"].includes(watchedMethod);

  // Auto-show headers/body sections if they have values
  useEffect(() => {
    if (headerFields.length > 0) setShowHeaders(true);
    if (monitor?.body) setShowBody(true);
    if (monitor?.assertions?.body?.contains || monitor?.assertions?.body?.regex) {
      setAdvancedMode(true);
    }
  }, [headerFields.length, monitor]);

  const onSubmit = async (data: MonitorFormData) => {
    // Transform headers array to object
    const headers: Record<string, string> = {};
    data.headers?.forEach((h) => {
      if (h.key && h.value) {
        headers[h.key] = h.value;
      }
    });

    // Type detection for submission
    const submittedType = data.type;
    const isSslTypeSubmit = submittedType === "ssl" || submittedType === "https";
    const isHttpSubmit = submittedType === "http" || submittedType === "https";
    const isDnsSubmit = submittedType === "dns";
    const isHeartbeatSubmit = submittedType === "heartbeat";
    const isDatabaseSubmit = submittedType.startsWith("database_");
    const isEmailServerSubmit = ["smtp", "imap", "pop3"].includes(submittedType);
    const isEmailAuthSubmit = submittedType === "email_auth";
    const isGrpcSubmit = submittedType === "grpc";
    const isWebsocketSubmit = submittedType === "websocket";
    const isProtocolSubmit = ["ssh", "ldap", "rdp"].includes(submittedType);
    const isBrokerSubmit = ["mqtt", "amqp"].includes(submittedType);
    const isTracerouteSubmit = submittedType === "traceroute";
    const isPrometheusBlackboxSubmit = submittedType === "prometheus_blackbox";
    const isPrometheusPromqlSubmit = submittedType === "prometheus_promql";
    const isPrometheusRemoteWriteSubmit = submittedType === "prometheus_remote_write";
    const isPrometheusSubmit = isPrometheusBlackboxSubmit || isPrometheusPromqlSubmit || isPrometheusRemoteWriteSubmit;
    const isExternalStatusSubmit = submittedType.startsWith("external_");

    // Build config object conditionally based on monitor type
    const config: Record<string, unknown> = {};

    // DNS config
    if (isDnsSubmit && data.config?.dns) {
      const dnsConfig: Record<string, unknown> = {};
      if (data.config.dns.recordType) dnsConfig.recordType = data.config.dns.recordType;
      if (data.config.dns.nameserver) dnsConfig.nameserver = data.config.dns.nameserver;
      if (data.config.dns.expectedValue) dnsConfig.expectedValue = data.config.dns.expectedValue;
      if (data.config.dns.resolvers?.length) {
        const resolvers = data.config.dns.resolvers
          .filter((r) => r.endpoint)
          .map((r) => ({
            endpoint: r.endpoint,
            ...(r.type ? { type: r.type } : {}),
            ...(r.region ? { region: r.region } : {}),
            ...(r.name ? { name: r.name } : {}),
          }));
        if (resolvers.length > 0) dnsConfig.resolvers = resolvers;
      }
      if (data.config.dns.propagationCheck !== undefined) dnsConfig.propagationCheck = data.config.dns.propagationCheck;
      if (data.config.dns.resolverStrategy) dnsConfig.resolverStrategy = data.config.dns.resolverStrategy;
      if (data.config.dns.dnssecValidation !== undefined) dnsConfig.dnssecValidation = data.config.dns.dnssecValidation;
      if (data.config.dns.dohEndpoint) dnsConfig.dohEndpoint = data.config.dns.dohEndpoint;
      if (data.config.dns.dotEndpoint) dnsConfig.dotEndpoint = data.config.dns.dotEndpoint;
      if (data.config.dns.anycastCheck !== undefined) dnsConfig.anycastCheck = data.config.dns.anycastCheck;
      const regionTargets =
        data.config.dns.regionTargetsInput
          ?.split(",")
          .map((r) => r.trim())
          .filter((r) => r.length > 0) ?? [];
      if (regionTargets.length > 0) dnsConfig.regionTargets = regionTargets;
      if (Object.keys(dnsConfig).length > 0) config.dns = dnsConfig;
    }

    // SSL config
    if (isSslTypeSubmit) {
      const sslConfig: Record<string, unknown> = {
        expiryWarningDays: data.config?.ssl?.expiryWarningDays ?? 30,
        expiryErrorDays: data.config?.ssl?.expiryErrorDays ?? 7,
        checkChain: data.config?.ssl?.checkChain ?? true,
        checkHostname: data.config?.ssl?.checkHostname ?? true,
      };
      if (data.config?.ssl?.minTlsVersion) sslConfig.minTlsVersion = data.config.ssl.minTlsVersion;
      if (data.config?.ssl?.requireOcspStapling !== undefined) sslConfig.requireOcspStapling = data.config.ssl.requireOcspStapling;
      if (data.config?.ssl?.ocspCheck !== undefined) sslConfig.ocspCheck = data.config.ssl.ocspCheck;
      if (data.config?.ssl?.ocspResponderTimeoutMs) sslConfig.ocspResponderTimeoutMs = data.config.ssl.ocspResponderTimeoutMs;
      if (data.config?.ssl?.checkCrl !== undefined) sslConfig.checkCrl = data.config.ssl.checkCrl;
      if (data.config?.ssl?.requireCompleteChain !== undefined) sslConfig.requireCompleteChain = data.config.ssl.requireCompleteChain;
      if (data.config?.ssl?.caaCheck !== undefined) sslConfig.caaCheck = data.config.ssl.caaCheck;

      const allowedCiphers =
        data.config?.ssl?.allowedCiphersInput
          ?.split("\n")
          .map((c) => c.trim())
          .filter((c) => c.length > 0) ?? [];
      if (allowedCiphers.length > 0) sslConfig.allowedCiphers = allowedCiphers;

      const blockedCiphers =
        data.config?.ssl?.blockedCiphersInput
          ?.split("\n")
          .map((c) => c.trim())
          .filter((c) => c.length > 0) ?? [];
      if (blockedCiphers.length > 0) sslConfig.blockedCiphers = blockedCiphers;

      const caaIssuers =
        data.config?.ssl?.caaIssuersInput
          ?.split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0) ?? [];
      if (caaIssuers.length > 0) sslConfig.caaIssuers = caaIssuers;

      config.ssl = sslConfig;
    }

    // Heartbeat config (fallback to sensible defaults)
    if (isHeartbeatSubmit) {
      const heartbeatConfig: Record<string, unknown> = {
        expectedInterval: withDefaultNumber(data.config?.heartbeat?.expectedInterval, 300),
        gracePeriod: withDefaultNumber(data.config?.heartbeat?.gracePeriod, 60),
      };
      if (data.config?.heartbeat?.timezone) heartbeatConfig.timezone = data.config.heartbeat.timezone;
      config.heartbeat = heartbeatConfig;
    }

    // Database config
    if (isDatabaseSubmit && data.config?.database) {
      const dbConfig: Record<string, unknown> = {};
      if (data.config.database.host) dbConfig.host = data.config.database.host;
      dbConfig.port = withDefaultNumber(
        data.config.database.port,
        DEFAULT_PORTS[submittedType] ?? 5432
      );
      if (data.config.database.database) dbConfig.database = data.config.database.database;
      if (data.config.database.username) dbConfig.username = data.config.database.username;
      if (data.config.database.password) dbConfig.password = data.config.database.password;
      if (data.config.database.ssl !== undefined) dbConfig.ssl = data.config.database.ssl;
      if (data.config.database.query) dbConfig.query = data.config.database.query;
      if (data.config.database.expectedRowCount !== undefined) dbConfig.expectedRowCount = data.config.database.expectedRowCount;
      if (Object.keys(dbConfig).length > 0) config.database = dbConfig;
    }

    // Email server config
    if (isEmailServerSubmit && data.config?.emailServer) {
      const emailConfig: Record<string, unknown> = {};
      if (data.config.emailServer.host) emailConfig.host = data.config.emailServer.host;
      emailConfig.port = withDefaultNumber(
        data.config.emailServer.port,
        DEFAULT_PORTS[submittedType] ?? 587
      );
      if (data.config.emailServer.tls !== undefined) emailConfig.tls = data.config.emailServer.tls;
      if (data.config.emailServer.starttls !== undefined) emailConfig.starttls = data.config.emailServer.starttls;
      if (data.config.emailServer.username) emailConfig.username = data.config.emailServer.username;
      if (data.config.emailServer.password) emailConfig.password = data.config.emailServer.password;
      if (data.config.emailServer.authMethod) emailConfig.authMethod = data.config.emailServer.authMethod;
      if (Object.keys(emailConfig).length > 0) config.emailServer = emailConfig;
    }

    // Email authentication config (SPF/DKIM/DMARC)
    if (isEmailAuthSubmit && data.config?.emailAuth) {
      const emailAuthConfig: Record<string, unknown> = {};
      // Use URL as domain if not explicitly set
      if (data.config.emailAuth.domain) {
        emailAuthConfig.domain = data.config.emailAuth.domain;
      } else if (data.url) {
        emailAuthConfig.domain = data.url;
      }
      // Parse comma-separated DKIM selectors
      if (data.config.emailAuth.dkimSelectorsInput) {
        const selectors = data.config.emailAuth.dkimSelectorsInput
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (selectors.length > 0) {
          emailAuthConfig.dkimSelectors = selectors;
        }
      }
      if (data.config.emailAuth.nameserver) emailAuthConfig.nameserver = data.config.emailAuth.nameserver;
      if (data.config.emailAuth.validatePolicy !== undefined) emailAuthConfig.validatePolicy = data.config.emailAuth.validatePolicy;
      if (Object.keys(emailAuthConfig).length > 0) config.emailAuth = emailAuthConfig;
    }

    // gRPC config
    if (isGrpcSubmit && data.config?.grpc) {
      const grpcConfig: Record<string, unknown> = {};
      if (data.config.grpc.service) grpcConfig.service = data.config.grpc.service;
      if (data.config.grpc.method) grpcConfig.method = data.config.grpc.method;
      if (data.config.grpc.requestMessage) {
        try {
          grpcConfig.requestMessage = JSON.parse(data.config.grpc.requestMessage);
        } catch {
          // If not valid JSON, store as string
          grpcConfig.requestMessage = data.config.grpc.requestMessage;
        }
      }
      if (data.config.grpc.tls !== undefined) grpcConfig.tls = data.config.grpc.tls;
      // Transform metadataArray to metadata object
      if (data.config.grpc.metadataArray?.length) {
        const metadata: Record<string, string> = {};
        data.config.grpc.metadataArray.forEach((m) => {
          if (m.key && m.value) metadata[m.key] = m.value;
        });
        if (Object.keys(metadata).length > 0) grpcConfig.metadata = metadata;
      }
      if (Object.keys(grpcConfig).length > 0) config.grpc = grpcConfig;
    }

    // WebSocket config
    if (isWebsocketSubmit && data.config?.websocket) {
      const wsConfig: Record<string, unknown> = {};
      // Transform headersArray to headers object
      if (data.config.websocket.headersArray?.length) {
        const wsHeaders: Record<string, string> = {};
        data.config.websocket.headersArray.forEach((h) => {
          if (h.key && h.value) wsHeaders[h.key] = h.value;
        });
        if (Object.keys(wsHeaders).length > 0) wsConfig.headers = wsHeaders;
      }
      if (data.config.websocket.sendMessage) wsConfig.sendMessage = data.config.websocket.sendMessage;
      if (data.config.websocket.expectMessage) wsConfig.expectMessage = data.config.websocket.expectMessage;
      if (data.config.websocket.closeTimeout) wsConfig.closeTimeout = data.config.websocket.closeTimeout;
      if (Object.keys(wsConfig).length > 0) config.websocket = wsConfig;
    }

    // Protocol config (SSH/LDAP/RDP)
    if (isProtocolSubmit && data.config?.protocol) {
      const protocolConfig: Record<string, unknown> = {};
      if (data.config.protocol.host) protocolConfig.host = data.config.protocol.host;
      if (data.config.protocol.port !== undefined || protocolConfig.host) {
        protocolConfig.port = withDefaultNumber(
          data.config.protocol.port,
          DEFAULT_PORTS[submittedType] ?? 22
        );
      }
      if (data.config.protocol.expectBanner) protocolConfig.expectBanner = data.config.protocol.expectBanner;
      if (data.config.protocol.ldapBaseDn) protocolConfig.ldapBaseDn = data.config.protocol.ldapBaseDn;
      if (data.config.protocol.ldapFilter) protocolConfig.ldapFilter = data.config.protocol.ldapFilter;
      if (data.config.protocol.username) protocolConfig.username = data.config.protocol.username;
      if (data.config.protocol.password) protocolConfig.password = data.config.protocol.password;
      if (Object.keys(protocolConfig).length > 0) config.protocol = protocolConfig;
    }

    // Broker config (MQTT/AMQP)
    if (isBrokerSubmit && data.config?.broker) {
      const brokerConfig: Record<string, unknown> = {};
      if (data.config.broker.username) brokerConfig.username = data.config.broker.username;
      if (data.config.broker.password) brokerConfig.password = data.config.broker.password;
      if (data.config.broker.topic) brokerConfig.topic = data.config.broker.topic;
      if (data.config.broker.queue) brokerConfig.queue = data.config.broker.queue;
      if (data.config.broker.vhost) brokerConfig.vhost = data.config.broker.vhost;
      if (data.config.broker.tls !== undefined) brokerConfig.tls = data.config.broker.tls;
      if (Object.keys(brokerConfig).length > 0) config.broker = brokerConfig;
    }

    // Traceroute config
    if (isTracerouteSubmit) {
      const traceConfig: Record<string, unknown> = {
        maxHops: withDefaultNumber(data.config?.traceroute?.maxHops, 30),
        timeout: withDefaultNumber(data.config?.traceroute?.timeout, 5000),
        protocol: data.config?.traceroute?.protocol ?? "icmp",
      };
      config.traceroute = traceConfig;
    }

    // PageSpeed config
    if (isHttpSubmit && data.config?.pagespeed?.enabled) {
      // Clean up threshold values - remove undefined/NaN values
      const thresholds: Record<string, number> = {};
      if (data.config.pagespeed.thresholds?.performance && !isNaN(data.config.pagespeed.thresholds.performance)) {
        thresholds.performance = data.config.pagespeed.thresholds.performance;
      }
      if (data.config.pagespeed.thresholds?.accessibility && !isNaN(data.config.pagespeed.thresholds.accessibility)) {
        thresholds.accessibility = data.config.pagespeed.thresholds.accessibility;
      }
      if (data.config.pagespeed.thresholds?.bestPractices && !isNaN(data.config.pagespeed.thresholds.bestPractices)) {
        thresholds.bestPractices = data.config.pagespeed.thresholds.bestPractices;
      }
      if (data.config.pagespeed.thresholds?.seo && !isNaN(data.config.pagespeed.thresholds.seo)) {
        thresholds.seo = data.config.pagespeed.thresholds.seo;
      }

      // Web Vitals thresholds
      const webVitalsThresholds: Record<string, number> = {};
      if (data.config.pagespeed.webVitalsThresholds?.lcp && !isNaN(data.config.pagespeed.webVitalsThresholds.lcp)) {
        webVitalsThresholds.lcp = data.config.pagespeed.webVitalsThresholds.lcp;
      }
      if (data.config.pagespeed.webVitalsThresholds?.fid && !isNaN(data.config.pagespeed.webVitalsThresholds.fid)) {
        webVitalsThresholds.fid = data.config.pagespeed.webVitalsThresholds.fid;
      }
      if (data.config.pagespeed.webVitalsThresholds?.cls && !isNaN(data.config.pagespeed.webVitalsThresholds.cls)) {
        webVitalsThresholds.cls = data.config.pagespeed.webVitalsThresholds.cls;
      }

      config.pagespeed = {
        enabled: true,
        strategy: data.config.pagespeed.strategy ?? "mobile",
        categories: data.config.pagespeed.categories ?? ["performance"],
        ...(Object.keys(thresholds).length > 0 && { thresholds }),
        ...(Object.keys(webVitalsThresholds).length > 0 && { webVitalsThresholds }),
      };
    }

    // Security Headers config
    if (isHttpSubmit && data.config?.securityHeaders?.enabled) {
      const securityHeadersConfig: Record<string, unknown> = {
        enabled: true,
      };
      if (data.config.securityHeaders.minScore && !isNaN(data.config.securityHeaders.minScore)) {
        securityHeadersConfig.minScore = data.config.securityHeaders.minScore;
      }
      if (data.config.securityHeaders.checkHstsPreload !== undefined) {
        securityHeadersConfig.checkHstsPreload = data.config.securityHeaders.checkHstsPreload;
      }
      config.securityHeaders = securityHeadersConfig;
    }

    // HTTP behavioral enhancements
    if (isHttpSubmit && data.config?.http) {
      const httpConfig: Record<string, unknown> = {};

      if (data.config.http.cache) {
        const cacheConfig: Record<string, unknown> = {};
        const cache = data.config.http.cache;
        if (cache.requireCacheControl !== undefined) cacheConfig.requireCacheControl = cache.requireCacheControl;
        if (cache.requireEtag !== undefined) cacheConfig.requireEtag = cache.requireEtag;
        if (cache.allowNoStore !== undefined) cacheConfig.allowNoStore = cache.allowNoStore;
        if (cache.maxAgeSeconds !== undefined) cacheConfig.maxAgeSeconds = cache.maxAgeSeconds;
        if (cache.allowedCacheControlInput) {
          const allowed = cache.allowedCacheControlInput
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
          if (allowed.length > 0) cacheConfig.allowedCacheControl = allowed;
        }
        if (Object.keys(cacheConfig).length > 0) httpConfig.cache = cacheConfig;
      }

      if (data.config.http.responseSize) {
        const sizeConfig: Record<string, unknown> = {};
        const size = data.config.http.responseSize;
        if (size.warnBytes !== undefined && !Number.isNaN(size.warnBytes)) sizeConfig.warnBytes = size.warnBytes;
        if (size.errorBytes !== undefined && !Number.isNaN(size.errorBytes)) sizeConfig.errorBytes = size.errorBytes;
        if (Object.keys(sizeConfig).length > 0) httpConfig.responseSize = sizeConfig;
      }

      if (data.config.http.graphql?.operations?.length) {
        const operations = data.config.http.graphql.operations
          .map((op) => {
            let variables: Record<string, unknown> | undefined;
            if (op.variablesInput) {
              try {
                variables = JSON.parse(op.variablesInput);
              } catch {
                // Ignore invalid variables input
              }
            }
            const query = op.query || (op.type === "introspection" ? "{ __schema { queryType { name } } }" : "");
            return {
              ...(op.name ? { name: op.name } : {}),
              type: op.type || "query",
              query,
              ...(variables ? { variables } : {}),
              ...(op.expectErrors !== undefined ? { expectErrors: op.expectErrors } : {}),
              ...(op.expectIntrospectionEnabled !== undefined ? { expectIntrospectionEnabled: op.expectIntrospectionEnabled } : {}),
              ...(op.urlOverride ? { urlOverride: op.urlOverride } : {}),
            };
          })
          .filter((op) => op.query);
        if (operations.length > 0) {
          httpConfig.graphql = { operations };
        }
      }

      if (data.config.http.apiFlows?.length) {
        const flows = data.config.http.apiFlows
          .filter((f) => f.url || f.method || f.body || f.expectStatusInput)
          .map((f) => {
            let headersObj: Record<string, string> | undefined;
            if (typeof f.headers === "string") {
              try {
                headersObj = JSON.parse(f.headers);
              } catch {
                headersObj = undefined;
              }
            } else if (f.headers) {
              headersObj = f.headers as Record<string, string>;
            }
            const expectStatus = f.expectStatusInput
              ?.split(",")
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !Number.isNaN(n));
            const extract =
              f.extractInput
                ?.split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => {
                  const [name, path] = line.includes("=") ? line.split("=") : [line, line];
                  return { name: name.trim(), path: (path || name).trim() };
                }) ?? undefined;

            return {
              ...(f.name ? { name: f.name } : {}),
              ...(f.method ? { method: f.method } : {}),
              ...(f.url ? { url: f.url } : {}),
              ...(headersObj ? { headers: headersObj } : {}),
              ...(f.body ? { body: f.body } : {}),
              ...(expectStatus && expectStatus.length > 0 ? { expectStatus } : {}),
              ...(f.saveAs ? { saveAs: f.saveAs } : {}),
              ...(extract && extract.length > 0 ? { extract } : {}),
            };
          });
        if (flows.length > 0) {
          httpConfig.apiFlows = flows;
        }
      }

      if (data.config.http.syntheticBrowser?.enabled) {
        const syntheticConfig: Record<string, unknown> = { enabled: true };
        const synthetic = data.config.http.syntheticBrowser;
        if (synthetic.screenshot !== undefined) syntheticConfig.screenshot = synthetic.screenshot;
        if (synthetic.visualRegression !== undefined) syntheticConfig.visualRegression = synthetic.visualRegression;
        if (synthetic.maxWaitMs) syntheticConfig.maxWaitMs = synthetic.maxWaitMs;
        if (synthetic.steps && synthetic.steps.length > 0) {
          syntheticConfig.steps = synthetic.steps.map((s) => ({
            action: s.action,
            ...(s.target ? { target: s.target } : {}),
            ...(s.value ? { value: s.value } : {}),
          }));
        }
        httpConfig.syntheticBrowser = syntheticConfig;
      }

      if (data.config.http.contract?.enabled) {
        const contractConfig: Record<string, unknown> = { enabled: true };
        const contract = data.config.http.contract;
        if (contract.operationId) contractConfig.operationId = contract.operationId;
        if (contract.path) contractConfig.path = contract.path;
        if (contract.method) contractConfig.method = contract.method;
        if (contract.statusCode) contractConfig.statusCode = contract.statusCode;
        if (contract.openapi) contractConfig.openapi = contract.openapi;
        if (contract.requiredFieldsInput) {
          const requiredFields = contract.requiredFieldsInput
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
              const [path, type] = line.includes(":") ? line.split(":") : [line, undefined];
              return { path: path.trim(), ...(type ? { type: type.trim() } : {}) };
            });
          if (requiredFields.length > 0) contractConfig.requiredFields = requiredFields;
        }
        httpConfig.contract = contractConfig;
      }

      if (Object.keys(httpConfig).length > 0) {
        config.http = httpConfig;
      }
    }

    // Prometheus configuration
    if (isPrometheusSubmit && data.config?.prometheus) {
      const promConfig: Record<string, unknown> = {};
      const prom = data.config.prometheus;

      if (prom.exporterUrl) promConfig.exporterUrl = prom.exporterUrl;
      if (prom.prometheusUrl) promConfig.prometheusUrl = prom.prometheusUrl;
      if (prom.module) promConfig.module = prom.module;
      if (prom.probePath) promConfig.probePath = prom.probePath;
      if (prom.timeoutSeconds !== undefined && !Number.isNaN(prom.timeoutSeconds)) {
        promConfig.timeoutSeconds = prom.timeoutSeconds;
      }
      if (prom.multiTargetStrategy) promConfig.multiTargetStrategy = prom.multiTargetStrategy;
      if (prom.preferOrgEmbedded !== undefined) promConfig.preferOrgEmbedded = prom.preferOrgEmbedded;

      // Targets textarea to array
      if (prom.targetsInput) {
        const targets = prom.targetsInput
          .split("\n")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        if (targets.length > 0) promConfig.targets = targets;
      }

      // PromQL config
      if (isPrometheusPromqlSubmit && prom.promql?.query) {
        promConfig.promql = {
          query: prom.promql.query,
          ...(prom.promql.lookbackSeconds ? { lookbackSeconds: prom.promql.lookbackSeconds } : {}),
          ...(prom.promql.stepSeconds ? { stepSeconds: prom.promql.stepSeconds } : {}),
          ...(prom.promql.authToken ? { authToken: prom.promql.authToken } : {}),
          ...(prom.promql.prometheusUrl ? { prometheusUrl: prom.promql.prometheusUrl } : {}),
        };
      }

      // Thresholds
      if (prom.thresholds) {
        const thresholds: Record<string, unknown> = {};
        if (prom.thresholds.degraded !== undefined && !Number.isNaN(prom.thresholds.degraded)) {
          thresholds.degraded = prom.thresholds.degraded;
        }
        if (prom.thresholds.down !== undefined && !Number.isNaN(prom.thresholds.down)) {
          thresholds.down = prom.thresholds.down;
        }
        if (prom.thresholds.comparison) thresholds.comparison = prom.thresholds.comparison;
        if (prom.thresholds.normalizePercent !== undefined) {
          thresholds.normalizePercent = prom.thresholds.normalizePercent;
        }
        if (Object.keys(thresholds).length > 0) {
          promConfig.thresholds = thresholds;
        }
      }

      // Remote write specific config
      if (isPrometheusRemoteWriteSubmit && prom.remoteWrite?.regionLabel) {
        promConfig.remoteWrite = { regionLabel: prom.remoteWrite.regionLabel };
      }

      if (Object.keys(promConfig).length > 0) {
        config.prometheus = promConfig;
      }
    }

    // CDN Edge vs Origin config
    if (isHttpSubmit && data.config?.cdn?.originUrl) {
      const cdnConfig: Record<string, unknown> = {
        originUrl: data.config.cdn.originUrl,
      };
      if (data.config.cdn.edgeUrl) cdnConfig.edgeUrl = data.config.cdn.edgeUrl;
      if (data.config.cdn.compareToleranceMs && !isNaN(data.config.cdn.compareToleranceMs)) {
        cdnConfig.compareToleranceMs = data.config.cdn.compareToleranceMs;
      }
      if (data.config.cdn.requireStatusMatch !== undefined) {
        cdnConfig.requireStatusMatch = data.config.cdn.requireStatusMatch;
      }
      // Map headers arrays to objects
      if (data.config.cdn.edgeHeaders?.length) {
        const headersObj: Record<string, string> = {};
        data.config.cdn.edgeHeaders.forEach((h) => {
          if (h.key && h.value) headersObj[h.key] = h.value;
        });
        if (Object.keys(headersObj).length > 0) cdnConfig.edgeHeaders = headersObj;
      }
      if (data.config.cdn.originHeaders?.length) {
        const headersObj: Record<string, string> = {};
        data.config.cdn.originHeaders.forEach((h) => {
          if (h.key && h.value) headersObj[h.key] = h.value;
        });
        if (Object.keys(headersObj).length > 0) cdnConfig.originHeaders = headersObj;
      }
      config.cdn = cdnConfig;
    }

    // External Status provider config
    if (isExternalStatusSubmit && data.config?.externalStatus) {
      const extConfig: Record<string, unknown> = {};
      const ext = data.config.externalStatus;

      // Poll interval is common to all external status types
      if (ext.pollIntervalSeconds !== undefined && !Number.isNaN(ext.pollIntervalSeconds)) {
        extConfig.pollIntervalSeconds = ext.pollIntervalSeconds;
      }

      // AWS config
      if (submittedType === "external_aws" && ext.aws) {
        const awsConfig: Record<string, unknown> = {};
        if (ext.aws.regions?.length) awsConfig.regions = ext.aws.regions;
        if (ext.aws.services?.length) awsConfig.services = ext.aws.services;
        if (Object.keys(awsConfig).length > 0) extConfig.aws = awsConfig;
      }

      // GCP config
      if (submittedType === "external_gcp" && ext.gcp) {
        const gcpConfig: Record<string, unknown> = {};
        if (ext.gcp.zones?.length) gcpConfig.zones = ext.gcp.zones;
        if (ext.gcp.products?.length) gcpConfig.products = ext.gcp.products;
        if (Object.keys(gcpConfig).length > 0) extConfig.gcp = gcpConfig;
      }

      // Azure config
      if (submittedType === "external_azure" && ext.azure) {
        const azureConfig: Record<string, unknown> = {};
        if (ext.azure.regions?.length) azureConfig.regions = ext.azure.regions;
        if (ext.azure.services?.length) azureConfig.services = ext.azure.services;
        if (Object.keys(azureConfig).length > 0) extConfig.azure = azureConfig;
      }

      // Cloudflare config
      if (submittedType === "external_cloudflare" && ext.cloudflare) {
        const cloudflareConfig: Record<string, unknown> = {};
        if (ext.cloudflare.components?.length) cloudflareConfig.components = ext.cloudflare.components;
        if (Object.keys(cloudflareConfig).length > 0) extConfig.cloudflare = cloudflareConfig;
      }

      // Okta config
      if (submittedType === "external_okta" && ext.okta) {
        const oktaConfig: Record<string, unknown> = {};
        if (ext.okta.cell) oktaConfig.cell = ext.okta.cell;
        if (Object.keys(oktaConfig).length > 0) extConfig.okta = oktaConfig;
      }

      // Auth0 config
      if (submittedType === "external_auth0" && ext.auth0) {
        const auth0Config: Record<string, unknown> = {};
        if (ext.auth0.region) auth0Config.region = ext.auth0.region;
        if (Object.keys(auth0Config).length > 0) extConfig.auth0 = auth0Config;
      }

      // Stripe config
      if (submittedType === "external_stripe" && ext.stripe) {
        const stripeConfig: Record<string, unknown> = {};
        if (ext.stripe.components?.length) stripeConfig.components = ext.stripe.components;
        if (Object.keys(stripeConfig).length > 0) extConfig.stripe = stripeConfig;
      }

      // Twilio config
      if (submittedType === "external_twilio" && ext.twilio) {
        const twilioConfig: Record<string, unknown> = {};
        if (ext.twilio.components?.length) twilioConfig.components = ext.twilio.components;
        if (Object.keys(twilioConfig).length > 0) extConfig.twilio = twilioConfig;
      }

      // Statuspage.io config
      if (submittedType === "external_statuspage" && ext.statuspage) {
        const statuspageConfig: Record<string, unknown> = {};
        if (ext.statuspage.baseUrl) statuspageConfig.baseUrl = ext.statuspage.baseUrl;
        if (ext.statuspage.components?.length) statuspageConfig.components = ext.statuspage.components;
        if (Object.keys(statuspageConfig).length > 0) extConfig.statuspage = statuspageConfig;
      }

      // Custom status endpoint config
      if (submittedType === "external_custom" && ext.custom) {
        const customConfig: Record<string, unknown> = {};
        if (ext.custom.statusUrl) customConfig.statusUrl = ext.custom.statusUrl;
        if (ext.custom.jsonPath) customConfig.jsonPath = ext.custom.jsonPath;
        if (ext.custom.statusMapping && Object.keys(ext.custom.statusMapping).length > 0) {
          customConfig.statusMapping = ext.custom.statusMapping;
        }
        if (Object.keys(customConfig).length > 0) extConfig.custom = customConfig;
      }

      if (Object.keys(extConfig).length > 0) {
        config.externalStatus = extConfig;
      }
    }

    // Aggregate monitor config
    const isAggregateSubmit = submittedType === "aggregate";
    if (isAggregateSubmit && data.config?.aggregate) {
      const aggConfig: Record<string, unknown> = {};
      const agg = data.config.aggregate;

      if (agg.thresholdMode) aggConfig.thresholdMode = agg.thresholdMode;
      if (agg.degradedThresholdCount !== undefined && !Number.isNaN(agg.degradedThresholdCount)) {
        aggConfig.degradedThresholdCount = agg.degradedThresholdCount;
      }
      if (agg.downThresholdCount !== undefined && !Number.isNaN(agg.downThresholdCount)) {
        aggConfig.downThresholdCount = agg.downThresholdCount;
      }
      if (agg.degradedThresholdPercent !== undefined && !Number.isNaN(agg.degradedThresholdPercent)) {
        aggConfig.degradedThresholdPercent = agg.degradedThresholdPercent;
      }
      if (agg.downThresholdPercent !== undefined && !Number.isNaN(agg.downThresholdPercent)) {
        aggConfig.downThresholdPercent = agg.downThresholdPercent;
      }
      if (agg.countDegradedAsDown !== undefined) {
        aggConfig.countDegradedAsDown = agg.countDegradedAsDown;
      }

      if (Object.keys(aggConfig).length > 0) {
        config.aggregate = aggConfig;
      }
    }

    // Determine threshold - default to 1000ms for HTTP types if not set
    const thresholdMs = (data.degradedThresholdMs && !isNaN(data.degradedThresholdMs))
      ? data.degradedThresholdMs
      : (isHttpSubmit ? 1000 : undefined);

    // Only include assertions for HTTP types
    const assertions = isHttpSubmit
      ? (advancedMode ? {
          statusCode: data.assertions?.statusCode,
          responseTime: data.assertions?.responseTime || undefined,
          headers: data.assertions?.headers,
          body: data.assertions?.body?.contains || data.assertions?.body?.regex
            ? data.assertions.body
            : undefined,
        } : {
          statusCode: data.assertions?.statusCode,
          responseTime: data.assertions?.responseTime || undefined,
        })
      : undefined;

    const payload = {
      name: data.name,
      description: data.description?.trim() ?? "",
      url: data.url,
      type: data.type,
      method: isHttpSubmit ? data.method : "GET",
      intervalSeconds: data.intervalSeconds,
      timeoutMs: data.timeoutMs,
      regions: data.regions,
      degradedThresholdMs: thresholdMs,
      degradedAfterCount: data.degradedAfterCount || 1,
      downAfterCount: data.downAfterCount || 1,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: methodSupportsBody && data.body ? data.body : undefined,
      config: Object.keys(config).length > 0 ? config : undefined,
      assertions,
    };

    if (mode === "create") {
      await createMonitor.mutateAsync(payload);
      router.push("/monitors");
    } else if (monitor) {
      // Update monitor first
      await updateMonitor.mutateAsync({ id: monitor.id, data: payload });

      // Handle dependency changes (batch save)
      // Delete removed dependencies
      for (const depId of removedDependencyIds) {
        await deleteDependency.mutateAsync(depId);
      }

      // Create new dependencies
      if (pendingUpstreamIds.length > 0) {
        await bulkCreateDependencies.mutateAsync({
          downstreamMonitorId: monitor.id,
          upstreamMonitorIds: pendingUpstreamIds,
        });
      }

      router.push(`/monitors/${monitor.id}`);
    }
  };

  const toggleRegion = (region: string) => {
    const current = watch("regions");
    const updated = current.includes(region)
      ? current.filter((r) => r !== region)
      : [...current, region];
    if (updated.length > 0) {
      setValue("regions", updated);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Configure the basic settings for your monitor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="My Website"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Monitor Type</Label>
              <Select
                value={watch("type")}
                onOpenChange={() => setHasTypeInteracted(true)}
                onValueChange={(v) => {
                  setHasTypeInteracted(true);
                  setValue("type", v as MonitorFormData["type"]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONITOR_TYPE_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.types.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            {(() => {
              const urlConfig = getUrlInputConfig(watchedType);
              return (
                <>
                  <Label htmlFor="url">{urlConfig.label} *</Label>
                  <Input
                    id="url"
                    placeholder={urlConfig.placeholder}
                    {...register("url")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {urlConfig.hint}
                  </p>
                </>
              );
            })()}
            {errors.url && (
              <p className="text-sm text-destructive">{errors.url.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description for this monitor"
              {...register("description")}
            />
          </div>
        </CardContent>
      </Card>

      {/* HTTP Request Configuration (only for http/https) */}
      {isHttpType && (
        <Card>
          <CardHeader>
            <CardTitle>Request Configuration</CardTitle>
            <CardDescription>
              Configure the HTTP request settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>HTTP Method</Label>
              <Select
                value={watch("method")}
                onValueChange={(v) => setValue("method", v as MonitorFormData["method"])}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Headers Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowHeaders(!showHeaders)}
                className="flex items-center gap-2 text-sm font-medium"
              >
                {showHeaders ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Headers
                {headerFields.length > 0 && (
                  <Badge variant="secondary">{headerFields.length}</Badge>
                )}
              </button>

              {showHeaders && (
                <div className="space-y-2 pl-6">
                  {headerFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder="Header name"
                        {...register(`headers.${index}.key`)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Value"
                        {...register(`headers.${index}.value`)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHeader(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendHeader({ key: "", value: "" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Header
                  </Button>
                </div>
              )}
            </div>

            {/* Body Section (only for POST/PUT/PATCH) */}
            {methodSupportsBody && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowBody(!showBody)}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  {showBody ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Request Body
                </button>

                {showBody && (
                  <div className="pl-6">
                    <textarea
                      placeholder='{"key": "value"}'
                      {...register("body")}
                      className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CDN / Edge vs Origin */}
      {isHttpType && (
        <Card>
          <CardHeader>
            <CardTitle>CDN / Edge vs Origin</CardTitle>
            <CardDescription>
              Probe edge endpoints and compare against origin for drift or regression.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cdn-origin">Origin URL *</Label>
                <Input
                  id="cdn-origin"
                  placeholder="https://origin.example.com"
                  {...register("config.cdn.originUrl")}
                />
                <p className="text-xs text-muted-foreground">
                  Direct origin endpoint for comparison.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cdn-edge">Edge URL (optional)</Label>
                <Input
                  id="cdn-edge"
                  placeholder="https://cdn.example.com"
                  {...register("config.cdn.edgeUrl")}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to monitor URL if left blank.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cdn-tolerance">Latency Tolerance (ms)</Label>
                <Input
                  id="cdn-tolerance"
                  type="number"
                  min={1}
                  max={60000}
                  {...register("config.cdn.compareToleranceMs", { setValueAs: parseOptionalNumber })}
                />
                <p className="text-xs text-muted-foreground">
                  Mark degraded if edge exceeds origin by this delta.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Require Status Match</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={watch("config.cdn.requireStatusMatch") ?? false}
                    onCheckedChange={(checked) => setValue("config.cdn.requireStatusMatch", checked)}
                  />
                  <span className="text-sm text-muted-foreground">Edge and origin must match</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Edge Headers (optional)</Label>
                <div className="space-y-2">
                  {edgeHeaderFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder="Header"
                        {...register(`config.cdn.edgeHeaders.${index}.key` as const)}
                      />
                      <Input
                        placeholder="Value"
                        {...register(`config.cdn.edgeHeaders.${index}.value` as const)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEdgeHeader(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendEdgeHeader({ key: "", value: "" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Edge Header
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Origin Headers (optional)</Label>
                <div className="space-y-2">
                  {originHeaderFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder="Header"
                        {...register(`config.cdn.originHeaders.${index}.key` as const)}
                      />
                      <Input
                        placeholder="Value"
                        {...register(`config.cdn.originHeaders.${index}.value` as const)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOriginHeader(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendOriginHeader({ key: "", value: "" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Origin Header
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TCP Configuration */}
      {isTcpType && (
        <Card>
          <CardHeader>
            <CardTitle>TCP Configuration</CardTitle>
            <CardDescription>
              Configure TCP port monitoring settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                TCP monitoring checks if a port is open and accepting connections.
                The check succeeds if a TCP connection can be established within the timeout period.
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                <span className="font-medium">Advanced TCP Options (Optional)</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tcpSend">Send Data After Connection</Label>
                <Input
                  id="tcpSend"
                  placeholder="PING\r\n"
                  {...register("assertions.tcpOptions.send" as any)}
                />
                <p className="text-xs text-muted-foreground">
                  Data to send after connection is established
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tcpExpect">Expected Response Pattern</Label>
                <Input
                  id="tcpExpect"
                  placeholder="PONG"
                  className="font-mono"
                  {...register("assertions.tcpOptions.expect" as any)}
                />
                <p className="text-xs text-muted-foreground">
                  Regex pattern to match against response (optional)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DNS Configuration */}
      {isDnsType && (
        <Card>
          <CardHeader>
            <CardTitle>DNS Configuration</CardTitle>
            <CardDescription>
              Configure DNS lookup settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DNSConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* Heartbeat Configuration */}
      {isHeartbeatType && (
        <Card>
          <CardHeader>
            <CardTitle>Heartbeat Configuration</CardTitle>
            <CardDescription>
              Configure expected ping intervals for cron jobs and services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HeartbeatConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* Database Configuration */}
      {isDatabaseType && (
        <Card>
          <CardHeader>
            <CardTitle>Database Configuration</CardTitle>
            <CardDescription>
              Configure database connection and health check
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DatabaseConfigSection form={{ register, watch, setValue, control } as any} monitorType={watchedType} />
          </CardContent>
        </Card>
      )}

      {/* Email Server Configuration */}
      {isEmailServerType && (
        <Card>
          <CardHeader>
            <CardTitle>Email Server Configuration</CardTitle>
            <CardDescription>
              Configure {watchedType.toUpperCase()} server connection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailServerConfigSection form={{ register, watch, setValue, control } as any} monitorType={watchedType} />
          </CardContent>
        </Card>
      )}

      {/* Email Authentication Configuration (SPF/DKIM/DMARC) */}
      {isEmailAuthType && (
        <Card>
          <CardHeader>
            <CardTitle>Email Authentication Configuration</CardTitle>
            <CardDescription>
              Configure SPF/DKIM/DMARC record checks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailAuthConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* gRPC Configuration */}
      {isGrpcType && (
        <Card>
          <CardHeader>
            <CardTitle>gRPC Configuration</CardTitle>
            <CardDescription>
              Configure gRPC service health check
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GrpcConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* WebSocket Configuration */}
      {isWebsocketType && (
        <Card>
          <CardHeader>
            <CardTitle>WebSocket Configuration</CardTitle>
            <CardDescription>
              Configure WebSocket connection test
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebsocketConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* Protocol Configuration (SSH/LDAP/RDP) */}
      {isProtocolType && (
        <Card>
          <CardHeader>
            <CardTitle>{watchedType.toUpperCase()} Configuration</CardTitle>
            <CardDescription>
              Configure {watchedType.toUpperCase()} connection settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProtocolConfigSection form={{ register, watch, setValue, control } as any} monitorType={watchedType} />
          </CardContent>
        </Card>
      )}

      {/* Broker Configuration (MQTT/AMQP) */}
      {isBrokerType && (
        <Card>
          <CardHeader>
            <CardTitle>{watchedType === "mqtt" ? "MQTT" : "AMQP"} Configuration</CardTitle>
            <CardDescription>
              Configure message broker connection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrokerConfigSection form={{ register, watch, setValue, control } as any} monitorType={watchedType} />
          </CardContent>
        </Card>
      )}

      {/* Prometheus / Metrics Configuration */}
      {isPrometheusType && (
        <Card>
          <CardHeader>
            <CardTitle>Prometheus Configuration</CardTitle>
            <CardDescription>
              Configure blackbox probes, PromQL queries, or remote write thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrometheusConfigSection form={{ register, watch, setValue, control } as any} monitorType={watchedType} />
          </CardContent>
        </Card>
      )}

      {/* External Status Configuration */}
      {isExternalStatusType && (
        <Card>
          <CardHeader>
            <CardTitle>External Status Configuration</CardTitle>
            <CardDescription>
              Configure external service status monitoring settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExternalStatusConfigSection form={{ register, watch, setValue, control } as any} monitorType={watchedType} />
          </CardContent>
        </Card>
      )}

      {/* Aggregate Monitor Configuration */}
      {watchedType === "aggregate" && (
        <Card>
          <CardHeader>
            <CardTitle>Aggregate Configuration</CardTitle>
            <CardDescription>
              Configure how dependent monitor statuses are aggregated into a single status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AggregateConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* Traceroute Configuration */}
      {isTracerouteType && (
        <Card>
          <CardHeader>
            <CardTitle>Traceroute Configuration</CardTitle>
            <CardDescription>
              Configure network path tracing settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TracerouteConfigSection form={{ register, watch, setValue, control } as any} />
          </CardContent>
        </Card>
      )}

      {/* SSL Certificate Configuration */}
      {(watchedType === "ssl" || watchedType === "https") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Certificate Monitoring
            </CardTitle>
            <CardDescription>
              Configure certificate expiry alerts and validation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable certificate monitoring</Label>
                <p className="text-xs text-muted-foreground">
                  Run certificate checks on the daily schedule for this monitor.
                </p>
              </div>
              <Switch
                checked={certificateMonitoringEnabled}
                onCheckedChange={(checked) => setValue("config.ssl.enabled", checked)}
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expiryWarningDays">Warning Threshold (days)</Label>
                <Input
                  id="expiryWarningDays"
                  type="number"
                  min={1}
                  max={365}
                  {...register("config.ssl.expiryWarningDays", { setValueAs: parseOptionalNumber })}
                />
                <p className="text-xs text-muted-foreground">
                  Alert when certificate expires within this many days
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryErrorDays">Error Threshold (days)</Label>
                <Input
                  id="expiryErrorDays"
                  type="number"
                  min={1}
                  max={90}
                  {...register("config.ssl.expiryErrorDays", { setValueAs: parseOptionalNumber })}
                />
                <p className="text-xs text-muted-foreground">
                  Mark as failure when certificate expires within this many days
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Verify Certificate Chain</Label>
                  <p className="text-xs text-muted-foreground">
                    Check that the certificate chain is valid and trusted
                  </p>
                </div>
                <Switch
                  checked={watch("config.ssl.checkChain") ?? true}
                  onCheckedChange={(checked) => setValue("config.ssl.checkChain", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Verify Hostname</Label>
                  <p className="text-xs text-muted-foreground">
                    Check that the certificate matches the requested hostname
                  </p>
                </div>
                <Switch
                  checked={watch("config.ssl.checkHostname") ?? true}
                  onCheckedChange={(checked) => setValue("config.ssl.checkHostname", checked)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minTlsVersion">Minimum TLS Version</Label>
                <Select
                  value={watch("config.ssl.minTlsVersion") ?? "TLSv1.2"}
                  onValueChange={(v) => setValue("config.ssl.minTlsVersion", v as "TLSv1.2" | "TLSv1.3")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select minimum version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TLSv1.2">TLS 1.2</SelectItem>
                    <SelectItem value="TLSv1.3">TLS 1.3</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Fail if the negotiated protocol is below this version
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="allowed-ciphers">Allowed Ciphers (one per line)</Label>
                  <textarea
                    id="allowed-ciphers"
                    placeholder="TLS_AES_128_GCM_SHA256"
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    {...register("config.ssl.allowedCiphersInput")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to allow any; restrict to specific suites to audit compliance.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blocked-ciphers">Blocked Ciphers (one per line)</Label>
                  <textarea
                    id="blocked-ciphers"
                    placeholder="TLS_RSA_WITH_3DES_EDE_CBC_SHA"
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    {...register("config.ssl.blockedCiphersInput")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Any cipher listed here will fail the check if negotiated.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Require OCSP Stapling</Label>
                      <p className="text-xs text-muted-foreground">
                        Degrade when the server does not staple an OCSP response.
                      </p>
                    </div>
                    <Switch
                      checked={watch("config.ssl.requireOcspStapling") ?? false}
                      onCheckedChange={(checked) => setValue("config.ssl.requireOcspStapling", checked)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>OCSP Responder Check</Label>
                      <p className="text-xs text-muted-foreground">
                        Reachability check for OCSP responder URLs in the certificate.
                      </p>
                    </div>
                    <Switch
                      checked={watch("config.ssl.ocspCheck") ?? false}
                      onCheckedChange={(checked) => setValue("config.ssl.ocspCheck", checked)}
                    />
                  </div>
                  {watch("config.ssl.ocspCheck") && (
                    <div className="space-y-2">
                      <Label htmlFor="ocsp-timeout">OCSP Timeout (ms)</Label>
                      <Input
                        id="ocsp-timeout"
                        type="number"
                        min={500}
                        max={30000}
                        placeholder="5000"
                        {...register("config.ssl.ocspResponderTimeoutMs", { setValueAs: parseOptionalNumber })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Check CRL Distribution</Label>
                    <p className="text-xs text-muted-foreground">
                      Attempt to reach CRL distribution points published in the certificate.
                    </p>
                  </div>
                  <Switch
                    checked={watch("config.ssl.checkCrl") ?? false}
                    onCheckedChange={(checked) => setValue("config.ssl.checkCrl", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Complete Chain</Label>
                    <p className="text-xs text-muted-foreground">
                      Fail when intermediates are missing from the presented chain.
                    </p>
                  </div>
                  <Switch
                    checked={watch("config.ssl.requireCompleteChain") ?? false}
                    onCheckedChange={(checked) => setValue("config.ssl.requireCompleteChain", checked)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>CAA Validation</Label>
                    <p className="text-xs text-muted-foreground">
                      Check CAA records and optionally restrict to allowed issuers.
                    </p>
                  </div>
                  <Switch
                    checked={watch("config.ssl.caaCheck") ?? false}
                    onCheckedChange={(checked) => setValue("config.ssl.caaCheck", checked)}
                  />
                </div>
                {watch("config.ssl.caaCheck") && (
                  <div className="space-y-2">
                    <Label htmlFor="caa-issuers">Allowed Issuers (comma separated)</Label>
                    <Input
                      id="caa-issuers"
                      placeholder="digicert.com, letsencrypt.org"
                      {...register("config.ssl.caaIssuersInput")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to accept any issuer permitted by DNS CAA policy.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PageSpeed Insights Configuration */}
      {isHttpType && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              PageSpeed Insights
            </CardTitle>
            <CardDescription>
              Enable Lighthouse scores and Core Web Vitals monitoring
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable PageSpeed Insights</Label>
                <p className="text-xs text-muted-foreground">
                  Collect Lighthouse scores and Web Vitals on each check
                </p>
              </div>
              <Switch
                checked={watch("config.pagespeed.enabled") ?? false}
                onCheckedChange={(checked) => setValue("config.pagespeed.enabled", checked)}
              />
            </div>

            {watch("config.pagespeed.enabled") && (
              <>
                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Analysis Strategy</Label>
                    <Select
                      value={watch("config.pagespeed.strategy") ?? "mobile"}
                      onValueChange={(v) => setValue("config.pagespeed.strategy", v as "mobile" | "desktop" | "both")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mobile">Mobile Only</SelectItem>
                        <SelectItem value="desktop">Desktop Only</SelectItem>
                        <SelectItem value="both">Mobile and Desktop</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose which device strategy to analyze
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Categories to Monitor</Label>
                    <div className="flex flex-wrap gap-2">
                      {(["performance", "accessibility", "best-practices", "seo"] as const).map((category) => {
                        const categories = watch("config.pagespeed.categories") ?? ["performance"];
                        const isSelected = categories.includes(category);
                        const categoryLabels: Record<string, string> = {
                          "performance": "Performance",
                          "accessibility": "Accessibility",
                          "best-practices": "Best Practices",
                          "seo": "SEO",
                        };
                        return (
                          <Badge
                            key={category}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              const newCategories = isSelected
                                ? categories.filter((c) => c !== category)
                                : [...categories, category];
                              if (newCategories.length > 0) {
                                setValue("config.pagespeed.categories", newCategories);
                              }
                            }}
                          >
                            {categoryLabels[category]}
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select which Lighthouse categories to include in reports
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      <span className="font-medium">Score Thresholds (Optional)</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mark monitor as degraded when scores fall below these thresholds (0-100)
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="threshold-performance">Performance</Label>
                        <Input
                          id="threshold-performance"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="e.g. 90"
                          {...register("config.pagespeed.thresholds.performance", { setValueAs: parseOptionalNumber })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="threshold-accessibility">Accessibility</Label>
                        <Input
                          id="threshold-accessibility"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="e.g. 90"
                          {...register("config.pagespeed.thresholds.accessibility", { setValueAs: parseOptionalNumber })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="threshold-best-practices">Best Practices</Label>
                        <Input
                          id="threshold-best-practices"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="e.g. 90"
                          {...register("config.pagespeed.thresholds.bestPractices", { setValueAs: parseOptionalNumber })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="threshold-seo">SEO</Label>
                        <Input
                          id="threshold-seo"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="e.g. 90"
                          {...register("config.pagespeed.thresholds.seo", { setValueAs: parseOptionalNumber })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Web Vitals Thresholds */}
                  <WebVitalsThresholdsSection form={{ register, watch, setValue, control } as any} />
                </div>

                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium mb-2">PageSpeed API Key</p>
                  <p className="text-muted-foreground">
                    Configure your Google API key in{" "}
                    <a href="/settings" className="text-primary hover:underline">
                      Organisation Settings
                    </a>{" "}
                    to enable PageSpeed monitoring with higher rate limits.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Security Headers Configuration */}
      {isHttpType && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Headers
            </CardTitle>
            <CardDescription>
              Analyze HTTP security headers and get scored recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Security Headers Check</Label>
                <p className="text-xs text-muted-foreground">
                  Analyze headers like CSP, HSTS, X-Frame-Options on each check
                </p>
              </div>
              <Switch
                checked={watch("config.securityHeaders.enabled") ?? false}
                onCheckedChange={(checked) => setValue("config.securityHeaders.enabled", checked)}
              />
            </div>

            {watch("config.securityHeaders.enabled") && (
              <>
                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="securityMinScore">Minimum Score Threshold</Label>
                    <Input
                      id="securityMinScore"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="e.g. 70"
                      {...register("config.securityHeaders.minScore", { setValueAs: parseOptionalNumber })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Mark as degraded when security score falls below this value (0-100)
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Check HSTS Preload Status</Label>
                      <p className="text-xs text-muted-foreground">
                        Verify if the domain is on the HSTS preload list (adds latency)
                      </p>
                    </div>
                    <Switch
                      checked={watch("config.securityHeaders.checkHstsPreload") ?? false}
                      onCheckedChange={(checked) => setValue("config.securityHeaders.checkHstsPreload", checked)}
                    />
                  </div>

                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="font-medium mb-2">Headers Checked</p>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>Content-Security-Policy (CSP)</li>
                      <li>Strict-Transport-Security (HSTS)</li>
                      <li>X-Content-Type-Options</li>
                      <li>X-Frame-Options</li>
                      <li>X-XSS-Protection</li>
                      <li>Referrer-Policy</li>
                      <li>Permissions-Policy</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* HTTP Enhancements */}
      {isHttpType && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              HTTP Enhancements
            </CardTitle>
            <CardDescription>
              Cache validation, response sizing, GraphQL, multi-step flows, synthetic browser, and contract checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Cache */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Cache Header Validation</Label>
                  <p className="text-xs text-muted-foreground">
                    Validate Cache-Control and ETag directives to enforce caching rules.
                  </p>
                </div>
                <Switch
                  checked={watch("config.http.cache.requireCacheControl") ?? false}
                  onCheckedChange={(checked) => setValue("config.http.cache.requireCacheControl", checked)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="allowed-cache">Allowed Cache-Control directives</Label>
                  <Input
                    id="allowed-cache"
                    placeholder="public, max-age=60"
                    {...register("config.http.cache.allowedCacheControlInput")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list; responses outside this set are marked degraded.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-age-limit">Max-Age Limit (seconds)</Label>
                  <Input
                    id="max-age-limit"
                    type="number"
                    min={0}
                    placeholder="300"
                    {...register("config.http.cache.maxAgeSeconds", { setValueAs: parseOptionalNumber })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Require ETag</Label>
                    <Switch
                      checked={watch("config.http.cache.requireEtag") ?? false}
                      onCheckedChange={(checked) => setValue("config.http.cache.requireEtag", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Allow no-store</Label>
                    <Switch
                      checked={watch("config.http.cache.allowNoStore") ?? false}
                      onCheckedChange={(checked) => setValue("config.http.cache.allowNoStore", checked)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Response Size */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="warn-bytes">Response Size Warning (bytes)</Label>
                <Input
                  id="warn-bytes"
                  type="number"
                  min={1}
                  placeholder="1048576"
                  {...register("config.http.responseSize.warnBytes", { setValueAs: parseOptionalNumber })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="error-bytes">Response Size Error (bytes)</Label>
                <Input
                  id="error-bytes"
                  type="number"
                  min={1}
                  placeholder="5242880"
                  {...register("config.http.responseSize.errorBytes", { setValueAs: parseOptionalNumber })}
                />
              </div>
            </div>

            <Separator />

            {/* GraphQL */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>GraphQL Operations</Label>
                  <p className="text-xs text-muted-foreground">
                    Execute queries, mutations, or introspection checks as part of the monitor.
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => appendGraphqlOperation({ type: "query", query: "" } as any)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Operation
                </Button>
              </div>

              {graphqlOperationFields.length === 0 && (
                <p className="text-xs text-muted-foreground">No GraphQL operations configured.</p>
              )}

              <div className="space-y-4">
                {graphqlOperationFields.map((field, idx) => (
                  <div key={field.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">Operation {idx + 1}</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeGraphqlOperation(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          placeholder="User Query"
                          {...register(`config.http.graphql.operations.${idx}.name` as const)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={watch(`config.http.graphql.operations.${idx}.type` as const) ?? "query"}
                          onValueChange={(v) =>
                            setValue(
                              `config.http.graphql.operations.${idx}.type` as const,
                              v as "query" | "mutation" | "introspection"
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="query">Query</SelectItem>
                            <SelectItem value="mutation">Mutation</SelectItem>
                            <SelectItem value="introspection">Introspection</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Endpoint Override (optional)</Label>
                        <Input
                          placeholder="https://api.example.com/graphql"
                          {...register(`config.http.graphql.operations.${idx}.urlOverride` as const)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="flex items-center justify-between">
                        <Label>Expect Errors</Label>
                        <Switch
                          checked={watch(`config.http.graphql.operations.${idx}.expectErrors` as const) ?? false}
                          onCheckedChange={(checked) => setValue(`config.http.graphql.operations.${idx}.expectErrors` as const, checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>Expect Introspection Enabled</Label>
                        <Switch
                          checked={watch(`config.http.graphql.operations.${idx}.expectIntrospectionEnabled` as const) ?? true}
                          onCheckedChange={(checked) => setValue(`config.http.graphql.operations.${idx}.expectIntrospectionEnabled` as const, checked)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>GraphQL Query</Label>
                      <textarea
                        className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        placeholder="{ __typename }"
                        {...register(`config.http.graphql.operations.${idx}.query` as const)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Variables (JSON, optional)</Label>
                      <textarea
                        className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        placeholder='{"id": "123"}'
                        {...register(`config.http.graphql.operations.${idx}.variablesInput` as const)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* API Flows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Multi-Step API Flows</Label>
                  <p className="text-xs text-muted-foreground">
                    Chain dependent API requests and extract values between steps.
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => appendApiFlow({ method: "GET" } as any)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>

              {apiFlowFields.length === 0 && (
                <p className="text-xs text-muted-foreground">No flow steps defined.</p>
              )}

              <div className="space-y-4">
                {apiFlowFields.map((field, idx) => (
                  <div key={field.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">Step {idx + 1}</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeApiFlow(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          placeholder="Authenticate"
                          {...register(`config.http.apiFlows.${idx}.name` as const)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Method</Label>
                        <Select
                          value={watch(`config.http.apiFlows.${idx}.method` as const) ?? "GET"}
                          onValueChange={(v) =>
                            setValue(`config.http.apiFlows.${idx}.method` as const, v as (typeof HTTP_METHODS)[number])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HTTP_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Expect Status (comma)</Label>
                        <Input
                          placeholder="200,201"
                          {...register(`config.http.apiFlows.${idx}.expectStatusInput` as const)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input
                        placeholder="https://api.example.com/login"
                        {...register(`config.http.apiFlows.${idx}.url` as const)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Headers (JSON, optional)</Label>
                      <Input
                        placeholder='{"Content-Type":"application/json"}'
                        {...register(`config.http.apiFlows.${idx}.headers` as const)}
                      />
                      <p className="text-xs text-muted-foreground">Supports template variables like {"{{token}}" }.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Body (optional)</Label>
                      <textarea
                        className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        placeholder='{"username":"user","password":"pass"}'
                        {...register(`config.http.apiFlows.${idx}.body` as const)}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Save Response As</Label>
                        <Input
                          placeholder="authResponse"
                          {...register(`config.http.apiFlows.${idx}.saveAs` as const)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Extract (one per line: name=path)</Label>
                        <textarea
                          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="token=data.token"
                          {...register(`config.http.apiFlows.${idx}.extractInput` as const)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Synthetic Browser */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Synthetic Browser (Puppeteer)</Label>
                  <p className="text-xs text-muted-foreground">
                    Run scripted browser steps and optionally perform visual regression detection.
                  </p>
                </div>
                <Switch
                  checked={watch("config.http.syntheticBrowser.enabled") ?? false}
                  onCheckedChange={(checked) => setValue("config.http.syntheticBrowser.enabled", checked)}
                />
              </div>

              {watch("config.http.syntheticBrowser.enabled") && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center justify-between">
                      <Label>Capture Screenshot</Label>
                      <Switch
                        checked={watch("config.http.syntheticBrowser.screenshot") ?? false}
                        onCheckedChange={(checked) => setValue("config.http.syntheticBrowser.screenshot", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Visual Regression</Label>
                      <Switch
                        checked={watch("config.http.syntheticBrowser.visualRegression") ?? false}
                        onCheckedChange={(checked) => setValue("config.http.syntheticBrowser.visualRegression", checked)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="synthetic-timeout">Max Wait (ms)</Label>
                      <Input
                        id="synthetic-timeout"
                        type="number"
                        min={1000}
                        max={60000}
                        placeholder="10000"
                        {...register("config.http.syntheticBrowser.maxWaitMs", { setValueAs: parseOptionalNumber })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="font-medium">Steps</Label>
                    <Button type="button" variant="secondary" size="sm" onClick={() => appendSyntheticStep({ action: "goto", target: watchedUrl } as any)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Step
                    </Button>
                  </div>

                  {syntheticStepFields.length === 0 && (
                    <p className="text-xs text-muted-foreground">Default: single goto to the monitor URL.</p>
                  )}

                  <div className="space-y-3">
                    {syntheticStepFields.map((field, idx) => (
                      <div key={field.id} className="grid gap-2 md:grid-cols-[1fr_2fr_2fr_auto] items-center">
                        <Select
                          value={watch(`config.http.syntheticBrowser.steps.${idx}.action` as const) ?? "goto"}
                          onValueChange={(v) =>
                            setValue(
                              `config.http.syntheticBrowser.steps.${idx}.action` as const,
                              v as "goto" | "click" | "type" | "waitForSelector" | "waitForTimeout"
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="goto">Goto</SelectItem>
                            <SelectItem value="click">Click</SelectItem>
                            <SelectItem value="type">Type</SelectItem>
                            <SelectItem value="waitForSelector">Wait for Selector</SelectItem>
                            <SelectItem value="waitForTimeout">Wait (ms)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Target (URL or selector)"
                          {...register(`config.http.syntheticBrowser.steps.${idx}.target` as const)}
                        />
                        <Input
                          placeholder="Value (for type or wait)"
                          {...register(`config.http.syntheticBrowser.steps.${idx}.value` as const)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSyntheticStep(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* API Contract */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>API Contract Validation</Label>
                  <p className="text-xs text-muted-foreground">
                    Validate response shape against expected fields (lightweight OpenAPI contract).
                  </p>
                </div>
                <Switch
                  checked={watch("config.http.contract.enabled") ?? false}
                  onCheckedChange={(checked) => setValue("config.http.contract.enabled", checked)}
                />
              </div>

              {watch("config.http.contract.enabled") && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Path (optional)</Label>
                    <Input
                      placeholder="/v1/users"
                      {...register("config.http.contract.path")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select
                      value={watch("config.http.contract.method") ?? "get"}
                      onValueChange={(v) =>
                        setValue(
                          "config.http.contract.method",
                          v as "get" | "post" | "put" | "patch" | "delete" | "head" | "options"
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="get">GET</SelectItem>
                        <SelectItem value="post">POST</SelectItem>
                        <SelectItem value="put">PUT</SelectItem>
                        <SelectItem value="patch">PATCH</SelectItem>
                        <SelectItem value="delete">DELETE</SelectItem>
                        <SelectItem value="head">HEAD</SelectItem>
                        <SelectItem value="options">OPTIONS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status Code</Label>
                    <Input
                      type="number"
                      min={100}
                      max={599}
                      placeholder="200"
                      {...register("config.http.contract.statusCode", { setValueAs: parseOptionalNumber })}
                    />
                  </div>
                </div>
              )}

              {watch("config.http.contract.enabled") && (
                <div className="space-y-2">
                  <Label>Required Fields (one per line: path or path:type)</Label>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    placeholder="data.id:number&#10;data.email:string"
                    {...register("config.http.contract.requiredFieldsInput")}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ping Configuration */}
      {isPingType && (
        <Card>
          <CardHeader>
            <CardTitle>Ping Configuration</CardTitle>
            <CardDescription>
              Configure ICMP ping monitoring settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Ping monitoring sends ICMP packets to check host availability.
                A host is considered down if all packets are lost, and degraded if some packets are lost.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Packet Count</Label>
                <Select
                  value={watch("assertions.pingOptions.packetCount" as any)?.toString() || "3"}
                  onValueChange={(v) => setValue("assertions.pingOptions.packetCount" as any, parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 packet</SelectItem>
                    <SelectItem value="3">3 packets (default)</SelectItem>
                    <SelectItem value="5">5 packets</SelectItem>
                    <SelectItem value="10">10 packets</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Number of ping packets to send
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timing Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Check Settings</CardTitle>
          <CardDescription>
            Configure check interval and timeout
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Check Interval</Label>
              <Select
                value={watch("intervalSeconds").toString()}
                onValueChange={(v) => setValue("intervalSeconds", parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((interval) => (
                    <SelectItem key={interval.value} value={interval.value.toString()}>
                      {interval.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                min={1000}
                max={60000}
                {...register("timeoutMs", { setValueAs: parseOptionalNumber })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Monitoring Regions</Label>
            {regionsLoading ? (
              <p className="text-sm text-muted-foreground">Loading available regions...</p>
            ) : hasNoProbes ? (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">
                  No probes are currently connected. Please set up a probe to enable monitoring.
                </p>
              </div>
            ) : isSingleRegion ? (
              <Badge variant="default">{availableRegions[0]?.label}</Badge>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableRegions.map((region) => (
                  <Badge
                    key={region.value}
                    variant={watch("regions").includes(region.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleRegion(region.value)}
                  >
                    {region.label}
                  </Badge>
                ))}
              </div>
            )}
            {errors.regions && (
              <p className="text-sm text-destructive">{errors.regions.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assertions - only show for HTTP types */}
      {isHttpType && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Assertions</CardTitle>
                <CardDescription>
                  Define success criteria for your monitor
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="advanced-mode" className="text-sm">
                  Advanced Mode
                </Label>
                <Switch
                  id="advanced-mode"
                  checked={advancedMode}
                  onCheckedChange={setAdvancedMode}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Simple Mode */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Expected Status Codes</Label>
                <Input
                  placeholder="200, 201, 204"
                  defaultValue={watch("assertions.statusCode")?.join(", ")}
                  onChange={(e) => {
                    const codes = e.target.value
                      .split(",")
                      .map((s) => parseInt(s.trim()))
                      .filter((n) => !isNaN(n));
                    setValue("assertions.statusCode", codes);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of valid status codes
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="responseTime">Max Response Time (ms)</Label>
                <Input
                  id="responseTime"
                  type="number"
                  placeholder="1000"
                  {...register("assertions.responseTime", { setValueAs: parseOptionalNumber })}
                />
                <p className="text-xs text-muted-foreground">
                  Mark as degraded if response exceeds this
                </p>
              </div>
            </div>

            {/* Advanced Mode */}
            {advancedMode && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  <span className="font-medium">Advanced Assertions</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bodyContains">Response Body Contains</Label>
                  <Input
                    id="bodyContains"
                    placeholder="Expected text in response"
                    {...register("assertions.body.contains")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bodyNotContains">Response Body Does NOT Contain</Label>
                  <Input
                    id="bodyNotContains"
                    placeholder="Text that should NOT appear"
                    {...register("assertions.body.notContains")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bodyRegex">Response Body Regex</Label>
                  <Input
                    id="bodyRegex"
                    placeholder="^{.*}$"
                    className="font-mono"
                    {...register("assertions.body.regex")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Regular expression to match against response body
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="degradedAfterCount">Degraded After (checks)</Label>
                    <Input
                      id="degradedAfterCount"
                      type="number"
                      min={1}
                      max={10}
                      placeholder="1"
                      {...register("degradedAfterCount", { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Mark degraded after N consecutive slow responses
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="downAfterCount">Down After (checks)</Label>
                    <Input
                      id="downAfterCount"
                      type="number"
                      min={1}
                      max={10}
                      placeholder="1"
                      {...register("downAfterCount", { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Mark down after N consecutive failures
                    </p>
                  </div>
                </div>

              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Dependencies Section (only in edit mode) */}
      {mode === "edit" && monitor && (
        <MonitorDependenciesSection
          monitorId={monitor.id}
          monitorName={watch("name") || monitor.name}
          pendingUpstreamIds={pendingUpstreamIds}
          removedDependencyIds={removedDependencyIds}
          onAddDependencies={(ids) => setPendingUpstreamIds((prev) => [...prev, ...ids])}
          onRemoveDependency={(depId, upstreamMonitorId) => {
            // If it's a pending dependency, just remove from pending list
            if (depId.startsWith("pending-")) {
              setPendingUpstreamIds((prev) => prev.filter((id) => id !== upstreamMonitorId));
            } else {
              // Mark existing dependency for removal
              setRemovedDependencyIds((prev) => [...prev, depId]);
            }
          }}
        />
      )}

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Monitor"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
