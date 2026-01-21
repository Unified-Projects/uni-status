import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

// Enums
export const monitorTypeEnum = pgEnum("monitor_type", [
  "http",
  "https",
  "dns",
  "ssl",
  "tcp",
  "ping",
  // New monitor types
  "heartbeat",
  "database_postgres",
  "database_mysql",
  "database_mongodb",
  "database_redis",
  "database_elasticsearch",
  "grpc",
  "websocket",
  "smtp",
  "imap",
  "pop3",
  "ssh",
  "ldap",
  "rdp",
  "mqtt",
  "amqp",
  "traceroute",
  "prometheus_blackbox",
  "prometheus_promql",
  "prometheus_remote_write",
  "email_auth",
  // External status provider types
  "external_aws",
  "external_gcp",
  "external_azure",
  "external_cloudflare",
  "external_okta",
  "external_auth0",
  "external_stripe",
  "external_twilio",
  "external_statuspage",
  "external_custom",
  // Aggregate monitor - aggregates status of dependent monitors
  "aggregate",
]);

export const monitorStatusEnum = pgEnum("monitor_status", [
  "active",
  "degraded",
  "down",
  "paused",
  "pending",
]);

export const httpMethodEnum = pgEnum("http_method", [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export const checkStatusEnum = pgEnum("check_status", [
  "success",
  "degraded",
  "failure",
  "timeout",
  "error",
]);

// Monitors
export const monitors = pgTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    url: text("url").notNull(),
    type: monitorTypeEnum("type").notNull().default("https"),
    method: httpMethodEnum("method").default("GET"),
    headers: jsonb("headers").$type<Record<string, string>>().default({}),
    body: text("body"),
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    timeoutMs: integer("timeout_ms").notNull().default(30000),
    regions: jsonb("regions").$type<string[]>().notNull().default(["uk"]),
    assertions: jsonb("assertions").$type<{
      statusCode?: number[];
      responseTime?: number;
      headers?: Record<string, string>;
      body?: {
        contains?: string;
        notContains?: string;
        regex?: string;
        jsonPath?: { path: string; value: unknown }[];
      };
    }>().default({}),
    // Extended configuration for different monitor types (encrypted secrets stored here)
    config: jsonb("config").$type<{
      // DNS config
      dns?: {
        recordType: "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "SRV" | "NS" | "SOA" | "PTR";
        nameserver?: string;  // Custom DNS server to query
        expectedValue?: string;  // Expected value in response
        // Multi-resolver/advanced DNS options
        resolvers?: Array<{
          endpoint: string;              // IP or URL for resolver/DoH/DoT
          type?: "udp" | "doh" | "dot";  // Resolver type (default: udp)
          region?: string;               // Region hint for propagation coverage
          name?: string;                 // Friendly name/checkpoint label
        }>;
        propagationCheck?: boolean;      // Compare answers across resolvers
        resolverStrategy?: "any" | "quorum" | "all"; // Consensus policy for propagation
        dnssecValidation?: boolean;      // Validate DNSSEC (DoH AD flag)
        dohEndpoint?: string;            // DoH endpoint for reachability/DNSSEC
        dotEndpoint?: string;            // DoT endpoint for reachability (host[:port])
        anycastCheck?: boolean;          // Expect consistent anycast answers
        regionTargets?: string[];        // Regions that must have resolver coverage
      };
      // SSL/TLS config
      ssl?: {
        enabled?: boolean;         // Enable/disable certificate monitoring
        expiryWarningDays?: number;  // Days before expiry to trigger warning (default: 30)
        expiryErrorDays?: number;    // Days before expiry to trigger error (default: 7)
        checkChain?: boolean;        // Verify certificate chain
        checkHostname?: boolean;     // Verify hostname matches certificate
        minTlsVersion?: "TLSv1.2" | "TLSv1.3"; // Enforce minimum TLS version
        allowedCiphers?: string[];   // Acceptable cipher suites (optional allow-list)
        blockedCiphers?: string[];   // Cipher suites that should fail the check
        requireOcspStapling?: boolean; // Require stapled OCSP response
        ocspCheck?: boolean;         // Query OCSP responder for revocation status
        ocspResponderTimeoutMs?: number; // Timeout for OCSP responder reachability
        checkCrl?: boolean;          // Attempt CRL distribution point reachability
        requireCompleteChain?: boolean; // Fail when intermediates are missing
        caaCheck?: boolean;          // Validate CAA records against issuer/allow list
        caaIssuers?: string[];       // Explicitly allowed CAA issuers
      };
      // Certificate Transparency monitoring
      certificateTransparency?: {
        enabled?: boolean;                // Toggle CT monitoring
        expectedIssuers?: string[];       // Allow-list of issuers
        alertOnNewCertificates?: boolean; // Alert when new CT entries appear
        alertOnUnexpectedIssuers?: boolean; // Alert when issuer not on allow-list
      };
      // HTTP-specific enhancements
      http?: {
        cache?: {
          requireCacheControl?: boolean;  // Require Cache-Control header
          allowedCacheControl?: string[]; // Allowed Cache-Control directives
          requireEtag?: boolean;          // Require ETag header
          maxAgeSeconds?: number;         // Maximum acceptable max-age
          allowNoStore?: boolean;         // Permit no-store responses
        };
        responseSize?: {
          warnBytes?: number;   // Warn when response exceeds this size
          errorBytes?: number;  // Fail when response exceeds this size
        };
        graphql?: {
          operations?: Array<{
            name?: string;
            type?: "query" | "mutation" | "introspection";
            query: string;
            variables?: Record<string, unknown>;
            expectErrors?: boolean;            // If true, errors are expected not fatal
            expectIntrospectionEnabled?: boolean; // Whether introspection should be allowed
            urlOverride?: string;             // Optional override URL
          }>;
        };
        apiFlows?: Array<{
          name?: string;
          method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
          url?: string;
          headers?: Record<string, string>;
          body?: string;
          expectStatus?: number[];
          saveAs?: string; // Key used to store the response JSON payload
          extract?: Array<{ path: string; name: string }>; // Dot-path extraction into context
        }>;
        syntheticBrowser?: {
          enabled?: boolean;
          steps?: Array<{
            action: "goto" | "click" | "type" | "waitForSelector" | "waitForTimeout";
            target?: string;
            value?: string;
          }>;
          screenshot?: boolean;        // Capture a screenshot
          visualRegression?: boolean;  // Compare to last screenshot hash
          maxWaitMs?: number;          // Overall timeout for browser flow
        };
        contract?: {
          enabled?: boolean;
          openapi?: Record<string, unknown>; // OpenAPI document (object form)
          operationId?: string;              // OperationId to validate
          path?: string;                     // Path template (e.g., /v1/users)
          method?: "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
          statusCode?: number;               // Expected response status code schema to use
          requiredFields?: Array<{ path: string; type?: "string" | "number" | "boolean" | "object" | "array" }>;
        };
      };
      // Heartbeat config
      heartbeat?: {
        expectedInterval: number;  // seconds between pings
        gracePeriod: number;       // grace period before "late"
        timezone?: string;
      };
      // Database config (password is AES encrypted)
      database?: {
        host: string;
        port: number;
        database?: string;
        username?: string;
        password?: string;  // Encrypted
        ssl?: boolean;
        query?: string;
        expectedRowCount?: number;
      };
      // gRPC config
      grpc?: {
        service: string;
        method?: string;
        requestMessage?: Record<string, unknown>;
        tls?: boolean;
        metadata?: Record<string, string>;
      };
      // WebSocket config
      websocket?: {
        headers?: Record<string, string>;
        sendMessage?: string;
        expectMessage?: string;
        closeTimeout?: number;
      };
      // Email server config (password is AES encrypted)
      emailServer?: {
        host: string;
        port: number;
        tls?: boolean;
        starttls?: boolean;
        username?: string;
        password?: string;  // Encrypted
        authMethod?: "plain" | "login" | "cram-md5";
      };
      // Protocol config (SSH/LDAP/RDP)
      protocol?: {
        host: string;
        port?: number;
        expectBanner?: string;
        ldapBaseDn?: string;
        ldapFilter?: string;
        username?: string;
        password?: string;  // Encrypted
      };
      // Broker config (MQTT/AMQP - password is AES encrypted)
      broker?: {
        username?: string;
        password?: string;  // Encrypted
        topic?: string;
        queue?: string;
        vhost?: string;
        tls?: boolean;
      };
      // Traceroute config
      traceroute?: {
        maxHops?: number;
        timeout?: number;
        protocol?: "icmp" | "udp" | "tcp";
      };
      // Email Authentication config (SPF/DKIM/DMARC)
      emailAuth?: {
        domain: string;              // Domain to check (required)
        dkimSelectors?: string[];    // DKIM selectors to check (e.g., ["google", "default"])
        nameserver?: string;         // Custom DNS server (optional)
        validatePolicy?: boolean;    // Validate policy strength
      };
      // PageSpeed Insights config
      pagespeed?: {
        enabled?: boolean;              // Enable PageSpeed checks for this monitor
        strategy?: "mobile" | "desktop" | "both";  // Which device to test
        categories?: ("performance" | "accessibility" | "best-practices" | "seo")[];
        // Threshold scores that trigger alerts (0-100)
        thresholds?: {
          performance?: number;
          accessibility?: number;
          bestPractices?: number;
          seo?: number;
        };
        // Core Web Vitals thresholds
        webVitalsThresholds?: {
          lcp?: number;   // ms, default 2500 (good), 4000 (needs improvement)
          fid?: number;   // ms, default 100 (good), 300 (needs improvement)
          cls?: number;   // unitless, default 0.1 (good), 0.25 (needs improvement)
        };
      };
      // CDN/Edge vs Origin comparison
      cdn?: {
        edgeUrl?: string;                   // Optional override for CDN edge URL (default: monitor.url)
        originUrl: string;                  // Direct origin URL to compare against
        edgeHeaders?: Record<string, string>;
        originHeaders?: Record<string, string>;
        compareToleranceMs?: number;        // Allowed latency delta before degraded
        requireStatusMatch?: boolean;       // Require identical status codes
      };
      // Prometheus / metrics configuration
      prometheus?: {
        exporterUrl?: string;                // Blackbox exporter endpoint override
        prometheusUrl?: string;              // Prometheus base URL override for PromQL
        module?: string;                     // Blackbox exporter module (default http_2xx)
        probePath?: string;                  // Path for probe handler (default /probe)
        targets?: string[];                  // Multi-target exporter pattern support
        timeoutSeconds?: number;             // Probe timeout in seconds
        multiTargetStrategy?: "any" | "quorum" | "all";  // How to evaluate partial failures
        preferOrgEmbedded?: boolean;         // Prefer org-level embedded/agent exporter
        labels?: Record<string, string>;     // Additional labels to include
        promql?: {
          query: string;                     // Custom PromQL query to evaluate
          lookbackSeconds?: number;          // Range lookback window
          stepSeconds?: number;              // Step interval for range queries
          authToken?: string;                // Bearer token override
          prometheusUrl?: string;            // Query-specific Prometheus URL override
        };
        thresholds?: {
          degraded?: number;                 // Degraded threshold for SLI/metric value
          down?: number;                     // Down threshold for SLI/metric value
          comparison?: "gte" | "lte";        // Whether higher or lower is healthier
          normalizePercent?: boolean;        // Treat 0-1 values as percentages
        };
        remoteWrite?: {
          expectedSeries?: string[];         // Expected metric names when ingesting remote write
          regionLabel?: string;              // Label key to treat as region
        };
      };
      // External status provider config
      externalStatus?: {
        // Provider-specific configurations
        aws?: {
          regions?: string[];                // AWS regions to monitor (e.g., ["us-east-1", "eu-west-1"])
          services?: string[];               // AWS services to monitor (e.g., ["EC2", "S3", "Lambda"])
        };
        gcp?: {
          zones?: string[];                  // GCP zones to monitor
          products?: string[];               // GCP products to monitor
        };
        azure?: {
          regions?: string[];                // Azure regions to monitor
          services?: string[];               // Azure services to monitor
        };
        cloudflare?: {
          components?: string[];             // Cloudflare components to monitor
        };
        okta?: {
          cell?: string;                     // Okta cell/datacenter
        };
        auth0?: {
          region?: string;                   // Auth0 region
        };
        stripe?: {
          components?: string[];             // Stripe components to monitor
        };
        twilio?: {
          components?: string[];             // Twilio components to monitor
        };
        // Statuspage.io based providers
        statuspage?: {
          baseUrl: string;                   // Statuspage.io base URL (e.g., https://status.stripe.com)
          components?: string[];             // Specific component IDs to monitor
        };
        // Custom status page config
        custom?: {
          statusUrl: string;                 // URL to fetch status from
          jsonPath?: string;                 // JSONPath to extract status value
          statusMapping?: Record<string, string>;  // Map provider status values to our status
        };
        // Common polling config
        pollIntervalSeconds?: number;        // Override default poll interval (60-3600)
      };
    }>(),
    degradedThresholdMs: integer("degraded_threshold_ms"),
    // Number of consecutive degraded checks before marking as degraded (default: 1)
    degradedAfterCount: integer("degraded_after_count").notNull().default(1),
    // Number of consecutive failed checks before marking as down (default: 1)
    downAfterCount: integer("down_after_count").notNull().default(1),
    // Current consecutive degraded/failure count for status transitions
    consecutiveDegradedCount: integer("consecutive_degraded_count").notNull().default(0),
    consecutiveFailureCount: integer("consecutive_failure_count").notNull().default(0),
    // Heartbeat token for public ping URLs (only used for heartbeat monitors)
    heartbeatToken: text("heartbeat_token"),
    status: monitorStatusEnum("status").notNull().default("pending"),
    paused: boolean("paused").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at"),
    nextCheckAt: timestamp("next_check_at"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("monitors_org_id_idx").on(table.organizationId),
    statusIdx: index("monitors_status_idx").on(table.status),
    nextCheckIdx: index("monitors_next_check_idx").on(table.nextCheckAt),
  })
);

// Check Results (Time-series data)
export const checkResults = pgTable(
  "check_results",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    status: checkStatusEnum("status").notNull(),
    responseTimeMs: integer("response_time_ms"),
    statusCode: integer("status_code"),
    dnsMs: integer("dns_ms"),
    tcpMs: integer("tcp_ms"),
    tlsMs: integer("tls_ms"),
    ttfbMs: integer("ttfb_ms"),
    transferMs: integer("transfer_ms"),
    responseSize: integer("response_size"),
    errorMessage: text("error_message"),
    errorCode: text("error_code"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    certificateInfo: jsonb("certificate_info").$type<{
      issuer?: string;
      subject?: string;
      validFrom?: string;
      validTo?: string;
      daysUntilExpiry?: number;
    }>(),
    // Google PageSpeed Insights scores (0-100)
    pagespeedScores: jsonb("pagespeed_scores").$type<{
      performance?: number;
      accessibility?: number;
      bestPractices?: number;
      seo?: number;
    }>(),
    // Core Web Vitals and additional metrics
    webVitals: jsonb("web_vitals").$type<{
      lcp?: number;   // Largest Contentful Paint (ms)
      fid?: number;   // First Input Delay (ms)
      inp?: number;   // Interaction to Next Paint (ms)
      cls?: number;   // Cumulative Layout Shift (unitless)
      fcp?: number;   // First Contentful Paint (ms)
      ttfb?: number;  // Time to First Byte (ms)
      si?: number;    // Speed Index
      tbt?: number;   // Total Blocking Time (ms)
    }>(),
    // Email Authentication (SPF/DKIM/DMARC) check results
    emailAuthDetails: jsonb("email_auth_details").$type<{
      domain: string;
      spf: {
        record: string | null;
        valid: boolean;
        status: "pass" | "fail" | "none" | "error";
        mechanisms?: string[];
        policy?: "fail" | "softfail" | "neutral" | "none";
      };
      dkim: {
        selectors: Array<{
          selector: string;
          record: string | null;
          valid: boolean;
          keyBits?: number;
          algorithm?: string;
        }>;
        status: "pass" | "partial" | "fail" | "none" | "error";
      };
      dmarc: {
        record: string | null;
        valid: boolean;
        status: "pass" | "fail" | "none" | "error";
        policy?: "none" | "quarantine" | "reject";
        subdomainPolicy?: "none" | "quarantine" | "reject";
        percentage?: number;
        alignment?: { spf: "strict" | "relaxed"; dkim: "strict" | "relaxed" };
      };
      overallScore: number;  // 0-100 composite score
    }>(),
    // HTTP Security Headers analysis results
    securityHeaders: jsonb("security_headers").$type<{
      overallScore: number;  // 0-100 composite score
      grade: "A+" | "A" | "B" | "C" | "D" | "F";
      headers: Record<string, {
        status: "present" | "missing" | "invalid" | "warning";
        value: string | null;
        score: number;
        recommendations?: string[];
      }>;
      checkedAt: string;
    }>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(), // Generic metadata (per-target metrics, remote write context)
    // External status provider check results
    externalStatusDetails: jsonb("external_status_details").$type<{
      providerStatus: string;                // Raw status from provider (e.g., "operational", "degraded_performance")
      mappedStatus: "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
      statusText?: string;                   // Human-readable status text
      affectedComponents?: Array<{
        id?: string;
        name: string;
        status: string;
        description?: string;
      }>;
      activeIncident?: {
        id?: string;
        name?: string;
        status?: string;
        impact?: string;
        body?: string;
        startedAt?: string;
        updatedAt?: string;
        resolvedAt?: string;
      };
      scheduledMaintenance?: Array<{
        id?: string;
        name?: string;
        status?: string;
        scheduledFor?: string;
        scheduledUntil?: string;
      }>;
    }>(),
    // Links failed check to the incident that was active at the time
    // FK constraint: REFERENCES incidents(id) ON DELETE SET NULL
    incidentId: text("incident_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    monitorIdIdx: index("check_results_monitor_id_idx").on(table.monitorId),
    createdAtIdx: index("check_results_created_at_idx").on(table.createdAt),
    monitorCreatedIdx: index("check_results_monitor_created_idx").on(
      table.monitorId,
      table.createdAt
    ),
    incidentIdIdx: index("check_results_incident_id_idx").on(table.incidentId),
  })
);

// Hourly Aggregates
export const checkResultsHourly = pgTable(
  "check_results_hourly",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    hour: timestamp("hour").notNull(),
    avgResponseTimeMs: doublePrecision("avg_response_time_ms"),
    minResponseTimeMs: integer("min_response_time_ms"),
    maxResponseTimeMs: integer("max_response_time_ms"),
    p50ResponseTimeMs: integer("p50_response_time_ms"),
    p75ResponseTimeMs: integer("p75_response_time_ms"),
    p90ResponseTimeMs: integer("p90_response_time_ms"),
    p95ResponseTimeMs: integer("p95_response_time_ms"),
    p99ResponseTimeMs: integer("p99_response_time_ms"),
    successCount: integer("success_count").notNull().default(0),
    degradedCount: integer("degraded_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    uptimePercentage: doublePrecision("uptime_percentage"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    monitorHourIdx: index("check_results_hourly_monitor_hour_idx").on(
      table.monitorId,
      table.hour
    ),
    monitorHourUnique: uniqueIndex("check_results_hourly_monitor_hour_unique").on(
      table.monitorId,
      table.hour
    ),
  })
);

// Daily Aggregates
export const checkResultsDaily = pgTable(
  "check_results_daily",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    date: timestamp("date").notNull(),
    avgResponseTimeMs: doublePrecision("avg_response_time_ms"),
    minResponseTimeMs: integer("min_response_time_ms"),
    maxResponseTimeMs: integer("max_response_time_ms"),
    p50ResponseTimeMs: integer("p50_response_time_ms"),
    p95ResponseTimeMs: integer("p95_response_time_ms"),
    p99ResponseTimeMs: integer("p99_response_time_ms"),
    successCount: integer("success_count").notNull().default(0),
    degradedCount: integer("degraded_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    uptimePercentage: doublePrecision("uptime_percentage"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    monitorDateIdx: index("check_results_daily_monitor_date_idx").on(
      table.monitorId,
      table.date
    ),
    monitorDateUnique: uniqueIndex("check_results_daily_monitor_date_unique").on(
      table.monitorId,
      table.date
    ),
  })
);

// Heartbeat Pings (for heartbeat/cron monitors)
export const heartbeatPingStatusEnum = pgEnum("heartbeat_ping_status", [
  "start",
  "complete",
  "fail",
]);

export const heartbeatPings = pgTable(
  "heartbeat_pings",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    status: heartbeatPingStatusEnum("status").notNull().default("complete"),
    durationMs: integer("duration_ms"),  // Job execution duration
    exitCode: integer("exit_code"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    monitorIdIdx: index("heartbeat_pings_monitor_id_idx").on(table.monitorId),
    createdAtIdx: index("heartbeat_pings_created_at_idx").on(table.createdAt),
    monitorCreatedIdx: index("heartbeat_pings_monitor_created_idx").on(
      table.monitorId,
      table.createdAt
    ),
  })
);

// Relations
export const monitorsRelations = relations(monitors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [monitors.organizationId],
    references: [organizations.id],
  }),
  checkResults: many(checkResults),
  hourlyAggregates: many(checkResultsHourly),
  dailyAggregates: many(checkResultsDaily),
  heartbeatPings: many(heartbeatPings),
}));

export const checkResultsRelations = relations(checkResults, ({ one }) => ({
  monitor: one(monitors, {
    fields: [checkResults.monitorId],
    references: [monitors.id],
  }),
}));

export const heartbeatPingsRelations = relations(heartbeatPings, ({ one }) => ({
  monitor: one(monitors, {
    fields: [heartbeatPings.monitorId],
    references: [monitors.id],
  }),
}));

// Type exports
export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;
export type CheckResult = typeof checkResults.$inferSelect;
export type NewCheckResult = typeof checkResults.$inferInsert;
export type CheckResultHourly = typeof checkResultsHourly.$inferSelect;
export type CheckResultDaily = typeof checkResultsDaily.$inferSelect;
export type HeartbeatPing = typeof heartbeatPings.$inferSelect;
export type NewHeartbeatPing = typeof heartbeatPings.$inferInsert;
