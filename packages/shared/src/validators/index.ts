import { z } from "zod";

// Common validators
export const idSchema = z.string().min(1);
export const slugSchema = z.string().min(3).max(50).regex(/^[a-z0-9-]+$/);
export const emailSchema = z.string().email();
export const urlSchema = z.string().url();
export const assetUrlSchema = z.string().refine(
  (val) => {
    if (val === "") return true;
    if (val.startsWith("/")) return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid URL or a relative path starting with /" }
);

// Monitor validators
export const monitorTypeSchema = z.enum([
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
  "email_auth",
  "ssh",
  "ldap",
  "rdp",
  "mqtt",
  "amqp",
  "traceroute",
  "prometheus_blackbox",
  "prometheus_promql",
  "prometheus_remote_write",
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
  // Aggregate monitor
  "aggregate",
]);
export const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
export const monitorStatusSchema = z.enum(["active", "degraded", "down", "paused", "pending"]);

export const monitorAssertionSchema = z.object({
  statusCode: z.array(z.number()).optional(),
  responseTime: z.number().positive().optional(),
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
});

// Monitor config schemas for different monitor types
export const heartbeatConfigSchema = z.object({
  expectedInterval: z.number().min(60).max(86400),  // 1 min to 24 hours
  gracePeriod: z.number().min(0).max(3600).default(60),  // up to 1 hour grace
  timezone: z.string().optional(),
});

export const databaseConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),  // Will be encrypted
  ssl: z.boolean().optional(),
  query: z.string().optional(),
  expectedRowCount: z.number().int().min(0).optional(),
});

export const grpcConfigSchema = z.object({
  service: z.string().min(1),
  method: z.string().optional(),
  requestMessage: z.record(z.string(), z.unknown()).optional(),
  tls: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const websocketConfigSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  sendMessage: z.string().optional(),
  expectMessage: z.string().optional(),  // Regex pattern
  closeTimeout: z.number().min(1000).max(60000).optional(),
});

export const emailServerConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  tls: z.boolean().optional(),
  starttls: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),  // Will be encrypted
  authMethod: z.enum(["plain", "login", "cram-md5"]).optional(),
});

export const protocolConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535).optional(),
  expectBanner: z.string().optional(),
  ldapBaseDn: z.string().optional(),
  ldapFilter: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),  // Will be encrypted
});

export const brokerConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().optional(),
  username: z.string().optional(),
  password: z.string().optional(),  // Will be encrypted
  topic: z.string().optional(),
  queue: z.string().optional(),
  vhost: z.string().optional(),
  tls: z.boolean().optional(),
  ssl: z.boolean().optional(),
  clientId: z.string().optional(),
  qos: z.number().min(0).max(2).optional(),
});

export const tracerouteConfigSchema = z.object({
  maxHops: z.number().min(1).max(64).optional(),
  timeout: z.number().min(1000).max(30000).optional(),
  protocol: z.enum(["icmp", "udp", "tcp"]).optional(),
});

// Prometheus / metrics schemas
export const prometheusThresholdSchema = z.object({
  degraded: z.number().optional(),
  down: z.number().optional(),
  comparison: z.enum(["gte", "lte"]).optional(),
  normalizePercent: z.boolean().optional(),
});

export const prometheusPromqlSchema = z.object({
  query: z.string().min(1),
  lookbackSeconds: z.number().min(30).max(86400).optional(),
  stepSeconds: z.number().min(5).max(3600).optional(),
  authToken: z.string().optional(),
  prometheusUrl: z.string().url().optional(),
});

export const certificateTransparencyConfigSchema = z.object({
  enabled: z.boolean().default(true).optional(),
  expectedIssuers: z.array(z.string().min(1)).max(10).optional(),
  alertOnNewCertificates: z.boolean().default(true).optional(),
  alertOnUnexpectedIssuers: z.boolean().default(true).optional(),
});

export const prometheusConfigSchema = z.object({
  exporterUrl: z.string().url().optional(),
  prometheusUrl: z.string().url().optional(),
  module: z.string().optional(),
  probePath: z.string().optional(),
  targets: z.array(z.string().min(1)).optional(),
  timeoutSeconds: z.number().min(1).max(300).optional(),
  multiTargetStrategy: z.enum(["any", "quorum", "all"]).optional(),
  preferOrgEmbedded: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  promql: prometheusPromqlSchema.optional(),
  thresholds: prometheusThresholdSchema.optional(),
  remoteWrite: z.object({
    expectedSeries: z.array(z.string()).optional(),
    regionLabel: z.string().optional(),
  }).optional(),
});

// External status provider config schema
export const externalStatusConfigSchema = z.object({
  // AWS Health Dashboard config
  aws: z.object({
    regions: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
  }).optional(),
  // Google Cloud Status config
  gcp: z.object({
    zones: z.array(z.string()).optional(),
    products: z.array(z.string()).optional(),
  }).optional(),
  // Azure Status config
  azure: z.object({
    regions: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
  }).optional(),
  // Cloudflare Status config
  cloudflare: z.object({
    components: z.array(z.string()).optional(),
  }).optional(),
  // Okta Status config
  okta: z.object({
    cell: z.string().optional(),
  }).optional(),
  // Auth0 Status config
  auth0: z.object({
    region: z.string().optional(),
  }).optional(),
  // Stripe Status config
  stripe: z.object({
    components: z.array(z.string()).optional(),
  }).optional(),
  // Twilio Status config
  twilio: z.object({
    components: z.array(z.string()).optional(),
  }).optional(),
  // Generic Statuspage.io config
  statuspage: z.object({
    baseUrl: z.string().url(),
    components: z.array(z.string()).optional(),
  }).optional(),
  // Custom status endpoint config
  custom: z.object({
    statusUrl: z.string().url(),
    jsonPath: z.string().optional(),
    statusMapping: z.record(z.string(), z.string()).optional(),
  }).optional(),
  // Common polling config
  pollIntervalSeconds: z.number().min(60).max(3600).default(300),
});

// SSL config schema
export const sslConfigSchema = z.object({
  enabled: z.boolean().optional(),
  expiryWarningDays: z.number().min(1).max(365).optional(),
  expiryErrorDays: z.number().min(1).max(90).optional(),
  checkChain: z.boolean().optional(),
  checkHostname: z.boolean().optional(),
  minTlsVersion: z.enum(["TLSv1.2", "TLSv1.3"]).optional(),
  allowedCiphers: z.array(z.string().min(1)).optional(),
  blockedCiphers: z.array(z.string().min(1)).optional(),
  requireOcspStapling: z.boolean().optional(),
  ocspCheck: z.boolean().optional(),
  ocspResponderTimeoutMs: z.number().min(500).max(30000).optional(),
  checkCrl: z.boolean().optional(),
  requireCompleteChain: z.boolean().optional(),
  caaCheck: z.boolean().optional(),
  caaIssuers: z.array(z.string().min(1)).optional(),
});

const dnsResolverSchema = z.object({
  endpoint: z.string().min(1, "Resolver endpoint is required"),
  type: z.enum(["udp", "doh", "dot"]).optional(),
  region: z.string().optional(),
  name: z.string().optional(),
});

// DNS config schema
export const dnsConfigSchema = z.object({
  recordType: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "SRV", "NS", "SOA", "PTR"]),
  nameserver: z.string().optional(),
  expectedValue: z.string().optional(),
  resolvers: z.array(dnsResolverSchema).optional(),
  propagationCheck: z.boolean().optional(),
  resolverStrategy: z.enum(["any", "quorum", "all"]).optional(),
  dnssecValidation: z.boolean().optional(),
  dohEndpoint: z.string().optional(),
  dotEndpoint: z.string().optional(),
  anycastCheck: z.boolean().optional(),
  regionTargets: z.array(z.string()).optional(),
});

// PageSpeed Insights config schema
export const pagespeedCategorySchema = z.enum(["performance", "accessibility", "best-practices", "seo"]);
export const pagespeedStrategySchema = z.enum(["mobile", "desktop", "both"]);

export const pagespeedThresholdsSchema = z.object({
  performance: z.number().min(0).max(100).optional(),
  accessibility: z.number().min(0).max(100).optional(),
  bestPractices: z.number().min(0).max(100).optional(),
  seo: z.number().min(0).max(100).optional(),
});

export const webVitalsThresholdsSchema = z.object({
  lcp: z.number().min(0).optional(),   // Largest Contentful Paint (ms)
  fid: z.number().min(0).optional(),   // First Input Delay (ms)
  cls: z.number().min(0).max(1).optional(),  // Cumulative Layout Shift
});

export const pagespeedConfigSchema = z.object({
  enabled: z.boolean().optional(),
  strategy: pagespeedStrategySchema.optional(),
  categories: z.array(pagespeedCategorySchema).optional(),
  thresholds: pagespeedThresholdsSchema.optional(),
  webVitalsThresholds: webVitalsThresholdsSchema.optional(),
});

// HTTP Security Headers config schema
export const securityHeadersConfigSchema = z.object({
  enabled: z.boolean().optional(),
  minScore: z.number().min(0).max(100).optional(),
  checkHstsPreload: z.boolean().optional(),
});

// HTTP behavioral config schemas
export const httpCacheConfigSchema = z.object({
  requireCacheControl: z.boolean().optional(),
  allowedCacheControl: z.array(z.string().min(1)).optional(),
  requireEtag: z.boolean().optional(),
  maxAgeSeconds: z.number().min(0).optional(),
  allowNoStore: z.boolean().optional(),
});

export const httpResponseSizeConfigSchema = z.object({
  warnBytes: z.number().min(1).optional(),
  errorBytes: z.number().min(1).optional(),
});

export const graphqlOperationSchema = z.object({
  name: z.string().optional(),
  type: z.enum(["query", "mutation", "introspection"]).optional(),
  query: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
  expectErrors: z.boolean().optional(),
  expectIntrospectionEnabled: z.boolean().optional(),
  urlOverride: z.string().url().optional(),
});

export const apiFlowStepSchema = z.object({
  name: z.string().optional(),
  method: httpMethodSchema.optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  expectStatus: z.array(z.number()).optional(),
  saveAs: z.string().optional(),
  extract: z
    .array(
      z.object({
        path: z.string().min(1),
        name: z.string().min(1),
      })
    )
    .optional(),
});

export const syntheticBrowserStepSchema = z.object({
  action: z.enum(["goto", "click", "type", "waitForSelector", "waitForTimeout"]),
  target: z.string().optional(),
  value: z.string().optional(),
});

export const httpContractConfigSchema = z.object({
  enabled: z.boolean().optional(),
  openapi: z.record(z.string(), z.unknown()).optional(),
  operationId: z.string().optional(),
  path: z.string().optional(),
  method: z.enum(["get", "post", "put", "patch", "delete", "head", "options"]).optional(),
  statusCode: z.number().optional(),
  requiredFields: z
    .array(
      z.object({
        path: z.string().min(1),
        type: z.enum(["string", "number", "boolean", "object", "array"]).optional(),
      })
    )
    .optional(),
});

export const httpConfigSchema = z.object({
  cache: httpCacheConfigSchema.optional(),
  responseSize: httpResponseSizeConfigSchema.optional(),
  graphql: z
    .object({
      operations: z.array(graphqlOperationSchema).optional(),
    })
    .optional(),
  apiFlows: z.array(apiFlowStepSchema).optional(),
  syntheticBrowser: z
    .object({
      enabled: z.boolean().optional(),
      steps: z.array(syntheticBrowserStepSchema).optional(),
      screenshot: z.boolean().optional(),
      visualRegression: z.boolean().optional(),
      maxWaitMs: z.number().min(1000).max(60000).optional(),
    })
    .optional(),
  contract: httpContractConfigSchema.optional(),
});

// CDN/Edge vs Origin comparison config
export const cdnConfigSchema = z.object({
  edgeUrl: z.string().optional(),
  originUrl: z.string().min(1),
  edgeHeaders: z.record(z.string(), z.string()).optional(),
  originHeaders: z.record(z.string(), z.string()).optional(),
  compareToleranceMs: z.number().min(1).max(60000).optional(),
  requireStatusMatch: z.boolean().optional(),
});

// PageSpeed scores schema (for storing results)
export const pagespeedScoresSchema = z.object({
  performance: z.number().min(0).max(100).optional(),
  accessibility: z.number().min(0).max(100).optional(),
  bestPractices: z.number().min(0).max(100).optional(),
  seo: z.number().min(0).max(100).optional(),
});

// Core Web Vitals schema (for storing results)
export const webVitalsSchema = z.object({
  lcp: z.number().min(0).optional(),   // Largest Contentful Paint (ms)
  fid: z.number().min(0).optional(),   // First Input Delay (ms)
  inp: z.number().min(0).optional(),   // Interaction to Next Paint (ms)
  cls: z.number().min(0).optional(),   // Cumulative Layout Shift
  fcp: z.number().min(0).optional(),   // First Contentful Paint (ms)
  ttfb: z.number().min(0).optional(),  // Time to First Byte (ms)
  si: z.number().min(0).optional(),    // Speed Index
  tbt: z.number().min(0).optional(),   // Total Blocking Time (ms)
});

// Organization integrations schema (for storing API keys)
export const organizationIntegrationsSchema = z.object({
  pagespeed: z.object({
    apiKey: z.string().optional(),
    enabled: z.boolean().optional(),
  }).optional(),
  prometheus: z.object({
    defaultUrl: z.string().url().optional(),
    bearerToken: z.string().optional(),
    blackboxUrl: z.string().url().optional(),
    alloyEmbedUrl: z.string().url().optional(),
    defaultModule: z.string().optional(),
    remoteWriteToken: z.string().min(12).optional(),
  }).optional(),
  // Future integrations can be added here
});

export const updateOrganizationIntegrationsSchema = z.object({
  pagespeed: z.object({
    apiKey: z.string().optional(),
    enabled: z.boolean().optional(),
  }).optional(),
  prometheus: z.object({
    defaultUrl: z.string().url().optional(),
    bearerToken: z.string().optional(),
    blackboxUrl: z.string().url().optional(),
    alloyEmbedUrl: z.string().url().optional(),
    defaultModule: z.string().optional(),
    remoteWriteToken: z.string().min(12).optional(),
  }).optional(),
});

// SMTP Credentials Schema
export const smtpCredentialsSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  fromAddress: z.string().email("Valid email address required"),
  fromName: z.string().max(100).optional(),
  secure: z.boolean().optional(),
  enabled: z.boolean().default(true),
});

// Resend Credentials Schema
export const resendCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  fromAddress: z.string().email("Valid email address required"),
  enabled: z.boolean().default(true),
});

// Twilio Credentials Schema
export const twilioCredentialsSchema = z.object({
  accountSid: z.string().min(1, "Account SID is required"),
  authToken: z.string().min(1, "Auth token is required"),
  fromNumber: z.string().min(1, "From number is required"),
  enabled: z.boolean().default(true),
});

// Ntfy Credentials Schema
export const ntfyCredentialsSchema = z.object({
  serverUrl: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  enabled: z.boolean().default(true),
});

// IRC Credentials Schema
export const ircCredentialsSchema = z.object({
  defaultServer: z.string().optional(),
  defaultPort: z.number().min(1).max(65535).optional(),
  defaultNickname: z.string().max(20).optional(),
  defaultPassword: z.string().optional(),
  useSsl: z.boolean().optional(),
  enabled: z.boolean().default(true),
});

// Twitter Credentials Schema
export const twitterCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  apiSecret: z.string().min(1, "API secret is required"),
  accessToken: z.string().min(1, "Access token is required"),
  accessSecret: z.string().min(1, "Access secret is required"),
  enabled: z.boolean().default(true),
});

// Webhook Credentials Schema
export const webhookCredentialsSchema = z.object({
  defaultSigningKey: z.string().min(32).max(256).optional(),
  enabled: z.boolean().default(true),
});

// Combined credentials update schema
export const updateOrganizationCredentialsSchema = z.object({
  smtp: smtpCredentialsSchema.optional(),
  resend: resendCredentialsSchema.optional(),
  twilio: twilioCredentialsSchema.optional(),
  ntfy: ntfyCredentialsSchema.optional(),
  irc: ircCredentialsSchema.optional(),
  twitter: twitterCredentialsSchema.optional(),
  webhook: webhookCredentialsSchema.optional(),
});

// Credential type enum for endpoint validation
export const credentialTypeSchema = z.enum(["smtp", "resend", "twilio", "ntfy", "irc", "twitter", "webhook"]);

// Test credentials schema (for testing a specific credential type)
export const testCredentialsSchema = z.object({
  type: credentialTypeSchema,
  testDestination: z.string().optional(), // e.g., email address or phone number for test
});

// Email authentication config (SPF, DKIM, DMARC checks)
export const emailAuthConfigSchema = z.object({
  domain: z.string().min(1),
  dkimSelectors: z.array(z.string()).optional(),
  validatePolicy: z.boolean().optional(),
});

// Aggregate monitor config - aggregates status of dependent monitors
export const aggregateConfigSchema = z.object({
  thresholdMode: z.enum(["absolute", "percentage"]).default("absolute"),
  // Absolute thresholds (when thresholdMode = "absolute")
  degradedThresholdCount: z.number().int().min(1).optional(),
  downThresholdCount: z.number().int().min(1).optional(),
  // Percentage thresholds (when thresholdMode = "percentage")
  degradedThresholdPercent: z.number().min(1).max(100).optional(),
  downThresholdPercent: z.number().min(1).max(100).optional(),
  // Options
  countDegradedAsDown: z.boolean().default(false),
}).refine((data) => {
  // Validate that at least one threshold is set based on mode
  if (data.thresholdMode === "absolute") {
    return data.degradedThresholdCount !== undefined || data.downThresholdCount !== undefined;
  } else {
    return data.degradedThresholdPercent !== undefined || data.downThresholdPercent !== undefined;
  }
}, {
  message: "At least one threshold must be set for the selected mode",
});

export const monitorConfigSchema = z.object({
  heartbeat: heartbeatConfigSchema.optional(),
  database: databaseConfigSchema.optional(),
  grpc: grpcConfigSchema.optional(),
  websocket: websocketConfigSchema.optional(),
  emailServer: emailServerConfigSchema.optional(),
  emailAuth: emailAuthConfigSchema.optional(),
  protocol: protocolConfigSchema.optional(),
  broker: brokerConfigSchema.optional(),
  traceroute: tracerouteConfigSchema.optional(),
  ssl: sslConfigSchema.optional(),
  certificateTransparency: certificateTransparencyConfigSchema.optional(),
  dns: dnsConfigSchema.optional(),
  http: httpConfigSchema.optional(),
  pagespeed: pagespeedConfigSchema.optional(),
  securityHeaders: securityHeadersConfigSchema.optional(),
  cdn: cdnConfigSchema.optional(),
  prometheus: prometheusConfigSchema.optional(),
  externalStatus: externalStatusConfigSchema.optional(),
  aggregate: aggregateConfigSchema.optional(),
});

const DEFAULT_MONITOR_REGION = process.env.MONITOR_DEFAULT_REGION || "uk";

export const createMonitorSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  url: z.string().min(1),  // Can be URL, host:port, or identifier depending on type
  type: monitorTypeSchema.default("https"),
  method: httpMethodSchema.default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  intervalSeconds: z.number().min(30).max(86400).default(60),  // Up to 24 hours for heartbeat
  timeoutMs: z.number().min(1000).max(60000).default(30000),
  regions: z.array(z.string()).min(1).default([DEFAULT_MONITOR_REGION]),
  assertions: monitorAssertionSchema.optional(),
  config: monitorConfigSchema.optional(),  // Extended config for new monitor types
  degradedThresholdMs: z.number().positive().optional(),
  degradedAfterCount: z.number().int().min(1).max(10).optional(),
  downAfterCount: z.number().int().min(1).max(10).optional(),
  dependsOn: z.array(idSchema).optional(),
});

export const updateMonitorSchema = createMonitorSchema.partial();

// Incident validators
export const incidentStatusSchema = z.enum(["investigating", "identified", "monitoring", "resolved"]);
export const incidentSeveritySchema = z.enum(["minor", "major", "critical"]);

export const createIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  status: incidentStatusSchema.default("investigating"),
  severity: incidentSeveritySchema.default("minor"),
  message: z.string().max(5000).optional(),
  affectedMonitors: z.array(idSchema).optional(),
});

export const updateIncidentSchema = createIncidentSchema.partial();

export const createIncidentUpdateSchema = z.object({
  status: incidentStatusSchema,
  message: z.string().min(1).max(5000),
});

// Incident Document validators
export const incidentDocumentTypeSchema = z.enum([
  "postmortem",
  "rca",
  "timeline",
  "report",
  "other",
]);

export const createIncidentDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  documentUrl: urlSchema,
  documentType: incidentDocumentTypeSchema.default("postmortem"),
  description: z.string().max(1000).optional(),
});

export const updateIncidentDocumentSchema = createIncidentDocumentSchema.partial();

// Status Page validators
export const statusPageThemeSchema = z.object({
  name: z.string(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  customCss: z.string().max(10000).optional(),
  colorMode: z.enum(["system", "light", "dark"]).optional(),
});

export const statusPageSettingsSchema = z.object({
  showUptimePercentage: z.boolean().optional(),
  showResponseTime: z.boolean().optional(),
  showIncidentHistory: z.boolean().optional(),
  showServicesPage: z.boolean().optional(),
  showGeoMap: z.boolean().optional(),
  uptimeDays: z.number().min(7).max(90).optional(),
  headerText: z.string().max(500).optional(),
  footerText: z.string().max(500).optional(),
  supportUrl: urlSchema.optional(),
  hideBranding: z.boolean().optional(),
  displayMode: z.enum(["bars", "graph", "both"]).optional(),
  graphTooltipMetrics: z.object({
    avg: z.boolean().optional(),
    min: z.boolean().optional(),
    max: z.boolean().optional(),
    p50: z.boolean().optional(),
    p90: z.boolean().optional(),
    p99: z.boolean().optional(),
  }).optional(),
});

// Template style enums
export const layoutTypeSchema = z.enum(["list", "cards", "sidebar", "single-page"]);
export const indicatorStyleSchema = z.enum(["dot", "badge", "pill", "bar"]);
export const incidentStyleSchema = z.enum(["timeline", "cards", "compact", "expanded"]);
export const monitorStyleSchema = z.enum(["minimal", "detailed", "card", "row"]);
export const borderRadiusSchema = z.enum(["none", "sm", "md", "lg", "xl"]);
export const shadowSchema = z.enum(["none", "sm", "md", "lg"]);
export const spacingSchema = z.enum(["compact", "normal", "relaxed"]);

export const statusPageTemplateSchema = z.object({
  id: z.string(),
  layout: layoutTypeSchema,
  indicatorStyle: indicatorStyleSchema,
  incidentStyle: incidentStyleSchema,
  monitorStyle: monitorStyleSchema,
  borderRadius: borderRadiusSchema,
  shadow: shadowSchema,
  spacing: spacingSchema,
});

// Auth config for status page OAuth protection
export const statusPageAuthConfigSchema = z.object({
  protectionMode: z.enum(["none", "password", "oauth", "both"]).default("none"),
  oauthMode: z.enum(["org_members", "allowlist", "any_authenticated"]).optional(),
  allowedEmails: z.array(z.string().email()).optional(),
  allowedDomains: z.array(z.string()).optional(),
  allowedRoles: z.array(z.enum(["owner", "admin", "member", "viewer"])).optional(),
});

// SEO settings schema for status pages
export const statusPageSeoSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  ogImage: assetUrlSchema.optional(),
  ogTemplate: z.enum(["classic", "modern", "minimal", "dashboard", "hero", "compact"]).optional(),
});

export const createStatusPageSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  customDomain: z.string().optional(),
  published: z.boolean().default(false),
  password: z.string().min(6).optional(),
  passwordProtected: z.boolean().optional(), // When false, clears the password
  logo: z.union([assetUrlSchema, z.literal("")]).optional(),
  favicon: z.union([assetUrlSchema, z.literal("")]).optional(),
  theme: statusPageThemeSchema.optional(),
  settings: statusPageSettingsSchema.optional(),
  template: statusPageTemplateSchema.optional(),
  authConfig: statusPageAuthConfigSchema.optional(),
  seo: statusPageSeoSchema.optional(),
});

export const updateStatusPageSchema = createStatusPageSchema.partial();

// Status Page Theme validators
const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g., #3B82F6)");

export const statusPageThemeColorsSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema.optional(),
  background: hexColorSchema,
  backgroundDark: hexColorSchema.optional(),
  text: hexColorSchema,
  textDark: hexColorSchema.optional(),
  surface: hexColorSchema,
  surfaceDark: hexColorSchema.optional(),
  border: hexColorSchema.optional(),
  borderDark: hexColorSchema.optional(),
  success: hexColorSchema,
  warning: hexColorSchema,
  error: hexColorSchema,
  info: hexColorSchema.optional(),
});

export const createStatusPageThemeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  colors: statusPageThemeColorsSchema,
  isDefault: z.boolean().default(false),
});

export const updateStatusPageThemeSchema = createStatusPageThemeSchema.partial();

// Alert validators
export const alertChannelTypeSchema = z.enum([
  "email", "slack", "discord", "teams", "pagerduty", "webhook", "sms", "ntfy", "irc", "twitter"
]);

export const alertChannelConfigSchema = z.object({
  email: z.string().email().optional(),
  webhookUrl: urlSchema.optional(),
  channel: z.string().optional(),
  routingKey: z.string().optional(),
  url: urlSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  method: z.enum(["GET", "POST"]).optional(),
  phoneNumber: z.string().optional(),
  topic: z.string().optional(),
  server: z.string().optional(),
  // Webhook signing key for HMAC-SHA256 signatures (optional)
  signingKey: z.string().min(32).max(256).optional(),
});

// Helper function to validate webhook URLs based on channel type
function validateAlertChannelWebhookUrl(
  type: string | undefined,
  config: { webhookUrl?: string } | undefined,
  ctx: z.RefinementCtx
) {
  if (!type || !config) return;
  const webhookUrl = config.webhookUrl;
  if (!webhookUrl) return;

  if (type === "discord") {
    if (!webhookUrl.startsWith("https://discord.com/api/webhooks/") &&
        !webhookUrl.startsWith("https://discordapp.com/api/webhooks/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discord webhook URL must start with https://discord.com/api/webhooks/",
        path: ["config", "webhookUrl"],
      });
    }
  }

  if (type === "slack") {
    if (!webhookUrl.startsWith("https://hooks.slack.com/services/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slack webhook URL must start with https://hooks.slack.com/services/",
        path: ["config", "webhookUrl"],
      });
    }
  }

  if (type === "teams") {
    if (!webhookUrl.includes(".webhook.office.com/") && !webhookUrl.includes(".logic.azure.com/") && !webhookUrl.includes("outlook.office.com/webhook/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Microsoft Teams webhook URL must be a valid Office 365 or Azure Logic Apps webhook",
        path: ["config", "webhookUrl"],
      });
    }
  }
}

export const createAlertChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: alertChannelTypeSchema,
  config: alertChannelConfigSchema,
  enabled: z.boolean().default(true),
}).superRefine((data, ctx) => {
  validateAlertChannelWebhookUrl(data.type, data.config, ctx);
});

// Update schema for PATCH - all fields optional with safe validation
export const updateAlertChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: alertChannelTypeSchema.optional(),
  config: alertChannelConfigSchema.optional(),
  enabled: z.boolean().optional(),
}).superRefine((data, ctx) => {
  validateAlertChannelWebhookUrl(data.type, data.config, ctx);
});

export const alertConditionsSchema = z.object({
  consecutiveFailures: z.number().min(1).max(10).optional(),
  failuresInWindow: z.object({
    count: z.number().min(1),
    windowMinutes: z.number().min(1).max(60),
  }).optional(),
  degradedDuration: z.number().min(1).optional(),
  consecutiveSuccesses: z.number().min(1).max(10).optional(),
});

export const createAlertPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  conditions: alertConditionsSchema,
  channels: z.array(idSchema).min(0).default([]),
  cooldownMinutes: z.number().min(1).max(1440).default(15),
  escalationPolicyId: idSchema.optional(),
  oncallRotationId: idSchema.optional(),
}).refine(
  (data) => (data.channels && data.channels.length > 0) || data.oncallRotationId,
  { message: "Either channels or on-call rotation must be provided" }
);

// Organization validators
export const organizationPlanSchema = z.enum(["free", "pro", "enterprise"]);
export const memberRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);

// Custom Roles validators
export const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(50, "Role name too long"),
  description: z.string().max(255).optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format").optional(),
});

export const updateRoleSchema = createRoleSchema.partial();

export const assignRoleSchema = z.object({
  roleId: z.string().min(1),
  // If roleId is a base role (owner/admin/member/viewer), it goes in the role column
  // If roleId is extended/custom, it goes in customRoleId column
});

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  logoUrl: assetUrlSchema.optional(),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: memberRoleSchema.default("member"),
});

// Pagination validators
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Date range validators
export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine(data => data.from <= data.to, {
  message: "From date must be before or equal to To date",
});

// Maintenance Window validators
export const maintenanceRecurrenceSchema = z.object({
  type: z.enum(["none", "daily", "weekly", "monthly"]),
  interval: z.number().int().positive().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  endDate: z.string().datetime().optional(),
});

// Escalation Policies
const severityOverrideSchema = z.object({
  ackTimeoutMinutes: z.number().int().min(1).max(1440).optional(),
}).passthrough();

export const escalationSeverityOverrideSchema = z.object({
  minor: severityOverrideSchema.optional(),
  major: severityOverrideSchema.optional(),
  critical: severityOverrideSchema.optional(),
}).partial();

export const createEscalationStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  delayMinutes: z.number().int().min(0).max(1440).default(0),
  channels: z.array(idSchema).optional().default([]),
  oncallRotationId: idSchema.optional(),
  notifyOnAckTimeout: z.boolean().default(true),
  skipIfAcknowledged: z.boolean().default(true),
}).refine(
  (data) => (data.channels && data.channels.length > 0) || data.oncallRotationId,
  { message: "Either channels or oncallRotationId must be provided" }
);

export const createEscalationPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ackTimeoutMinutes: z.number().int().min(1).max(1440).default(15),
  severityOverrides: escalationSeverityOverrideSchema.optional(),
  active: z.boolean().default(true),
  steps: z.array(createEscalationStepSchema).min(1),
});

// On-call rotations
export const createOncallRotationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  timezone: z.string().default("UTC"),
  rotationStart: z.string().datetime().optional(),
  shiftDurationMinutes: z.number().int().min(60).max(10080).default(720),
  participants: z.array(idSchema).default([]),
  handoffNotificationMinutes: z.number().int().min(5).max(1440).default(30),
  handoffChannels: z.array(idSchema).optional(),
  active: z.boolean().default(true),
});

// Update schema without defaults - prevents Zod from overwriting fields with defaults on partial updates
export const updateOncallRotationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  timezone: z.string().optional(),
  rotationStart: z.string().datetime().optional(),
  shiftDurationMinutes: z.number().int().min(60).max(10080).optional(),
  participants: z.array(idSchema).optional(),
  handoffNotificationMinutes: z.number().int().min(5).max(1440).optional(),
  handoffChannels: z.array(idSchema).optional(),
  active: z.boolean().optional(),
});

export const createOncallOverrideSchema = z.object({
  userId: idSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
}).refine((data) => new Date(data.endAt) > new Date(data.startAt), {
  message: "End time must be after start time",
  path: ["endAt"],
});

export const maintenanceNotifySchema = z.object({
  beforeStart: z.number().int().positive().optional(),
  onStart: z.boolean().optional(),
  onEnd: z.boolean().optional(),
});

const maintenanceWindowBaseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  affectedMonitors: z.array(idSchema),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().default("Europe/London"),
  recurrence: maintenanceRecurrenceSchema.optional(),
  notifySubscribers: maintenanceNotifySchema.optional(),
});

export const createMaintenanceWindowSchema = maintenanceWindowBaseSchema.refine(
  data => new Date(data.endsAt) > new Date(data.startsAt),
  { message: "End time must be after start time" }
);

export const updateMaintenanceWindowSchema = maintenanceWindowBaseSchema.partial();

// Embed validators
export const overallStatusSchema = z.enum(["operational", "degraded", "partial_outage", "major_outage", "maintenance"]);
export const badgeStyleSchema = z.enum(["flat", "plastic", "flat-square", "for-the-badge"]);
export const embedTypeSchema = z.enum(["badge", "dot", "card", "widget"]);
export const embedThemeSchema = z.enum(["light", "dark", "auto"]);

export const embedSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  allowedDomains: z.array(z.string()).optional(),
  showMonitorsInCard: z.boolean().default(true),
  showIncidentsInCard: z.boolean().default(true),
  defaultBadgeStyle: badgeStyleSchema.default("flat"),
  customBadgeLabel: z.string().max(50).optional(),
});

export const embedConfigSchema = z.object({
  type: embedTypeSchema,
  style: badgeStyleSchema.optional(),
  theme: embedThemeSchema.optional(),
  size: z.number().min(8).max(64).optional(),
  animate: z.boolean().optional(),
  showMonitors: z.boolean().optional(),
  showIncidents: z.boolean().optional(),
  compact: z.boolean().optional(),
  refreshInterval: z.number().min(10000).max(600000).optional(),
});

// SLO validators
export const sloWindowSchema = z.enum(["daily", "weekly", "monthly", "quarterly", "annually"]);

export const createSloTargetSchema = z.object({
  name: z.string().min(1).max(100),
  monitorId: idSchema,
  targetPercentage: z.number().min(90).max(100), // e.g., 99.9
  window: sloWindowSchema.default("monthly"),
  gracePeriodMinutes: z.number().min(0).max(60).default(0),
  alertThresholds: z.array(z.number().min(0).max(100)).optional(), // e.g., [25, 10, 5] = alert at 25%, 10%, 5% remaining
  active: z.boolean().default(true),
});

export const updateSloTargetSchema = createSloTargetSchema.partial();

// Deployment validators
export const deploymentStatusSchema = z.enum(["started", "completed", "failed", "rolled_back"]);
export const deploymentEnvironmentSchema = z.enum(["production", "staging", "development", "testing"]);

export const createDeploymentWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  active: z.boolean().default(true),
});

export const createDeploymentEventSchema = z.object({
  externalId: z.string().optional(),
  service: z.string().min(1).max(100),
  version: z.string().max(100).optional(),
  environment: deploymentEnvironmentSchema.default("production"),
  status: deploymentStatusSchema,
  deployedAt: z.string().datetime(),
  deployedBy: z.string().optional(),
  commitSha: z.string().max(40).optional(),
  commitMessage: z.string().max(500).optional(),
  branch: z.string().max(100).optional(),
  affectedMonitors: z.array(idSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  allowDuringIncident: z.boolean().optional(),
});

export const correlationTypeSchema = z.enum(["auto", "manual"]);

export const linkDeploymentIncidentSchema = z.object({
  deploymentId: idSchema,
  incidentId: idSchema,
  notes: z.string().max(500).optional(),
});

// Probe validators
export const probeStatusSchema = z.enum(["pending", "active", "offline", "disabled"]);

export const createProbeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  region: z.string().max(50).optional(),
});

export const updateProbeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  region: z.string().max(50).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const assignProbeToMonitorSchema = z.object({
  monitorId: idSchema,
  probeId: idSchema,
  priority: z.number().int().min(1).max(100).default(1),
  exclusive: z.boolean().default(false),
});

export const probeHeartbeatSchema = z.object({
  version: z.string().optional(),
  metrics: z.object({
    cpuUsage: z.number().min(0).max(100).optional(),
    memoryUsage: z.number().min(0).max(100).optional(),
    activeJobs: z.number().int().min(0).optional(),
    completedJobs: z.number().int().min(0).optional(),
    failedJobs: z.number().int().min(0).optional(),
    avgResponseTime: z.number().min(0).optional(),
  }).optional(),
  metadata: z.object({
    os: z.string().optional(),
    arch: z.string().optional(),
    hostname: z.string().optional(),
    cpu: z.string().optional(),
    memory: z.string().optional(),
    uptime: z.number().optional(),
  }).optional(),
});

export const probeJobResultSchema = z.object({
  jobId: idSchema,
  monitorId: idSchema,
  success: z.boolean(),
  responseTimeMs: z.number().min(0),
  statusCode: z.number().int().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Prometheus remote write ingestion schema
export const remoteWriteSampleSchema = z.object({
  value: z.number(),
  timestamp: z.number().optional(),
});

export const remoteWriteSeriesSchema = z.object({
  labels: z.record(z.string(), z.string()),
  samples: z.array(remoteWriteSampleSchema).min(1),
});

export const remoteWriteIngestSchema = z.object({
  series: z.array(remoteWriteSeriesSchema).min(1),
});

// Report validators
export const reportTypeSchema = z.enum(["sla", "uptime", "incident", "performance", "executive"]);
export const reportFrequencySchema = z.enum(["weekly", "monthly", "quarterly", "annually", "on_demand"]);
export const reportStatusSchema = z.enum(["pending", "generating", "completed", "failed", "expired"]);

export const reportBrandingSchema = z.object({
  logoUrl: assetUrlSchema.optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  companyName: z.string().max(100).optional(),
  footerText: z.string().max(200).optional(),
});

export const reportRecipientsSchema = z.object({
  emails: z.array(emailSchema),
  sendToOwner: z.boolean().optional(),
  sendToAdmins: z.boolean().optional(),
});

export const createReportSettingsSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: reportTypeSchema.default("sla"),
  frequency: reportFrequencySchema.default("monthly"),
  monitorIds: z.array(idSchema).optional(),
  statusPageIds: z.array(idSchema).optional(),
  includeAllMonitors: z.boolean().default(false),
  includeCharts: z.boolean().default(true),
  includeIncidents: z.boolean().default(true),
  includeMaintenanceWindows: z.boolean().default(true),
  includeResponseTimes: z.boolean().default(true),
  includeSloStatus: z.boolean().default(true),
  customBranding: reportBrandingSchema.optional(),
  recipients: reportRecipientsSchema.optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  timezone: z.string().default("Europe/London"),
  active: z.boolean().default(true),
});

export const updateReportSettingsSchema = createReportSettingsSchema.partial();

export const generateReportSchema = z.object({
  settingsId: idSchema.optional(),
  reportType: reportTypeSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  monitorIds: z.array(idSchema).optional(),
  statusPageIds: z.array(idSchema).optional(),
  includeAllMonitors: z.boolean().optional(),
}).refine(data => new Date(data.periodEnd) > new Date(data.periodStart), {
  message: "Period end must be after period start",
});

export const createReportTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  reportType: reportTypeSchema,
  headerHtml: z.string().max(10000).optional(),
  footerHtml: z.string().max(10000).optional(),
  cssStyles: z.string().max(50000).optional(),
  branding: z.object({
    logoUrl: assetUrlSchema.optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    fontFamily: z.string().max(100).optional(),
    companyName: z.string().max(100).optional(),
    tagline: z.string().max(200).optional(),
  }).optional(),
  isDefault: z.boolean().default(false),
});

export const updateReportTemplateSchema = createReportTemplateSchema.partial();

export const createMonitorDependencySchema = z.object({
  downstreamMonitorId: idSchema,
  upstreamMonitorId: idSchema,
  description: z.string().max(500).optional(),
});

export const updateMonitorDependencySchema = z.object({
  description: z.string().max(500).optional(),
});

export const bulkCreateMonitorDependenciesSchema = z.object({
  downstreamMonitorId: idSchema,
  upstreamMonitorIds: z.array(idSchema).min(1),
  description: z.string().max(500).optional(),
});

// Export types from validators
export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
export type MonitorConfig = z.infer<typeof monitorConfigSchema>;
export type HeartbeatConfig = z.infer<typeof heartbeatConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type GrpcConfig = z.infer<typeof grpcConfigSchema>;
export type WebsocketConfig = z.infer<typeof websocketConfigSchema>;
export type EmailServerConfig = z.infer<typeof emailServerConfigSchema>;
export type EmailAuthConfig = z.infer<typeof emailAuthConfigSchema>;
export type ProtocolConfig = z.infer<typeof protocolConfigSchema>;
export type BrokerConfig = z.infer<typeof brokerConfigSchema>;
export type TracerouteConfig = z.infer<typeof tracerouteConfigSchema>;
export type SslConfigInput = z.infer<typeof sslConfigSchema>;
export type DnsConfig = z.infer<typeof dnsConfigSchema>;
export type DnsResolverConfig = z.infer<typeof dnsResolverSchema>;
export type PagespeedConfig = z.infer<typeof pagespeedConfigSchema>;
export type PagespeedScores = z.infer<typeof pagespeedScoresSchema>;
export type WebVitals = z.infer<typeof webVitalsSchema>;
export type PagespeedThresholds = z.infer<typeof pagespeedThresholdsSchema>;
export type WebVitalsThresholds = z.infer<typeof webVitalsThresholdsSchema>;
export type CdnConfig = z.infer<typeof cdnConfigSchema>;
export type OrganizationIntegrations = z.infer<typeof organizationIntegrationsSchema>;
export type UpdateOrganizationIntegrationsInput = z.infer<typeof updateOrganizationIntegrationsSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type CreateIncidentUpdateInput = z.infer<typeof createIncidentUpdateSchema>;
export type IncidentDocumentType = z.infer<typeof incidentDocumentTypeSchema>;
export type CreateIncidentDocumentInput = z.infer<typeof createIncidentDocumentSchema>;
export type UpdateIncidentDocumentInput = z.infer<typeof updateIncidentDocumentSchema>;
export type CreateStatusPageInput = z.infer<typeof createStatusPageSchema>;
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageSchema>;
export type StatusPageThemeColors = z.infer<typeof statusPageThemeColorsSchema>;
export type CreateStatusPageThemeInput = z.infer<typeof createStatusPageThemeSchema>;
export type UpdateStatusPageThemeInput = z.infer<typeof updateStatusPageThemeSchema>;
export type CreateAlertChannelInput = z.infer<typeof createAlertChannelSchema>;
export type CreateAlertPolicyInput = z.infer<typeof createAlertPolicySchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type CreateMaintenanceWindowInput = z.infer<typeof createMaintenanceWindowSchema>;
export type UpdateMaintenanceWindowInput = z.infer<typeof updateMaintenanceWindowSchema>;
export type EmbedSettingsInput = z.infer<typeof embedSettingsSchema>;
export type EmbedConfigInput = z.infer<typeof embedConfigSchema>;
// Batch 7: Advanced Features Types
export type CreateSloTargetInput = z.infer<typeof createSloTargetSchema>;
export type UpdateSloTargetInput = z.infer<typeof updateSloTargetSchema>;
export type CreateDeploymentWebhookInput = z.infer<typeof createDeploymentWebhookSchema>;
export type CreateDeploymentEventInput = z.infer<typeof createDeploymentEventSchema>;
export type LinkDeploymentIncidentInput = z.infer<typeof linkDeploymentIncidentSchema>;
export type CreateProbeInput = z.infer<typeof createProbeSchema>;
export type UpdateProbeInput = z.infer<typeof updateProbeSchema>;
export type AssignProbeToMonitorInput = z.infer<typeof assignProbeToMonitorSchema>;
export type ProbeHeartbeatInput = z.infer<typeof probeHeartbeatSchema>;
export type ProbeJobResultInput = z.infer<typeof probeJobResultSchema>;
export type CreateReportSettingsInput = z.infer<typeof createReportSettingsSchema>;
export type UpdateReportSettingsInput = z.infer<typeof updateReportSettingsSchema>;
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;
export type UpdateReportTemplateInput = z.infer<typeof updateReportTemplateSchema>;
// Monitor Dependencies Types
export type CreateMonitorDependencyInput = z.infer<typeof createMonitorDependencySchema>;
export type UpdateMonitorDependencyInput = z.infer<typeof updateMonitorDependencySchema>;
export type BulkCreateMonitorDependenciesInput = z.infer<typeof bulkCreateMonitorDependenciesSchema>;
// Security Headers Types
export type SecurityHeadersConfig = z.infer<typeof securityHeadersConfigSchema>;
// Organization Credentials Types
export type SmtpCredentialsInput = z.infer<typeof smtpCredentialsSchema>;
export type ResendCredentialsInput = z.infer<typeof resendCredentialsSchema>;
export type TwilioCredentialsInput = z.infer<typeof twilioCredentialsSchema>;
export type NtfyCredentialsInput = z.infer<typeof ntfyCredentialsSchema>;
export type IrcCredentialsInput = z.infer<typeof ircCredentialsSchema>;
export type TwitterCredentialsInput = z.infer<typeof twitterCredentialsSchema>;
export type WebhookCredentialsInput = z.infer<typeof webhookCredentialsSchema>;
export type UpdateOrganizationCredentialsInput = z.infer<typeof updateOrganizationCredentialsSchema>;
export type CredentialType = z.infer<typeof credentialTypeSchema>;
export type TestCredentialsInput = z.infer<typeof testCredentialsSchema>;
// Custom Roles Types
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
// External Status Types
export type ExternalStatusConfig = z.infer<typeof externalStatusConfigSchema>;
