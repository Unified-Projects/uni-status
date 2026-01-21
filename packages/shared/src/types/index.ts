// Re-export credential types
export * from "./credentials";

// Re-export permission types
export * from "./permissions";

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// Monitor Types
export type MonitorType =
  | "http"
  | "https"
  | "dns"
  | "ssl"
  | "tcp"
  | "ping"
  | "heartbeat"
  | "database_postgres"
  | "database_mysql"
  | "database_mongodb"
  | "database_redis"
  | "database_elasticsearch"
  | "grpc"
  | "websocket"
  | "smtp"
  | "imap"
  | "pop3"
  | "email_auth"
  | "ssh"
  | "ldap"
  | "rdp"
  | "mqtt"
  | "amqp"
  | "traceroute"
  | "prometheus_blackbox"
  | "prometheus_promql"
  | "prometheus_remote_write";
export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type CheckStatus = "success" | "degraded" | "failure" | "timeout" | "error";

export interface MonitorAssertion {
  statusCode?: number[];
  responseTime?: number;
  headers?: Record<string, string>;
  body?: {
    contains?: string;
    notContains?: string;
    regex?: string;
    jsonPath?: Array<{ path: string; value: unknown }>;
  };
}

export interface SslConfig {
  expiryWarningDays?: number;
  expiryErrorDays?: number;
  checkChain?: boolean;
  checkHostname?: boolean;
  minTlsVersion?: "TLSv1.2" | "TLSv1.3";
  allowedCiphers?: string[];
  blockedCiphers?: string[];
  requireOcspStapling?: boolean;
  ocspCheck?: boolean;
  ocspResponderTimeoutMs?: number;
  checkCrl?: boolean;
  requireCompleteChain?: boolean;
  caaCheck?: boolean;
  caaIssuers?: string[];
}

export interface HttpCacheConfig {
  requireCacheControl?: boolean;
  allowedCacheControl?: string[];
  requireEtag?: boolean;
  maxAgeSeconds?: number;
  allowNoStore?: boolean;
}

export interface HttpResponseSizeConfig {
  warnBytes?: number;
  errorBytes?: number;
}

export interface GraphqlOperationConfig {
  name?: string;
  type?: "query" | "mutation" | "introspection";
  query: string;
  variables?: Record<string, unknown>;
  expectErrors?: boolean;
  expectIntrospectionEnabled?: boolean;
  urlOverride?: string;
}

export interface ApiFlowStep {
  name?: string;
  method?: HttpMethod;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  expectStatus?: number[];
  saveAs?: string;
  extract?: Array<{ path: string; name: string }>;
}

export type SyntheticBrowserAction = "goto" | "click" | "type" | "waitForSelector" | "waitForTimeout";

export interface SyntheticBrowserStep {
  action: SyntheticBrowserAction;
  target?: string;
  value?: string;
}

export interface HttpContractConfig {
  enabled?: boolean;
  openapi?: Record<string, unknown>;
  operationId?: string;
  path?: string;
  method?: "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
  statusCode?: number;
  requiredFields?: Array<{ path: string; type?: "string" | "number" | "boolean" | "object" | "array" }>;
}

export interface HttpConfig {
  cache?: HttpCacheConfig;
  responseSize?: HttpResponseSizeConfig;
  graphql?: {
    operations?: GraphqlOperationConfig[];
  };
  apiFlows?: ApiFlowStep[];
  syntheticBrowser?: {
    enabled?: boolean;
    steps?: SyntheticBrowserStep[];
    screenshot?: boolean;
    visualRegression?: boolean;
    maxWaitMs?: number;
  };
  contract?: HttpContractConfig;
}

// Incident Types
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical";

// Incident summary for embedding in other data structures
export interface IncidentSummary {
  id: string;
  title: string;
  severity: IncidentSeverity;
}

// Uptime Data Types
export type UptimeStatus = "success" | "degraded" | "down" | "unknown" | "maintenance";

export interface UptimeDataPoint {
  date: string;
  uptimePercentage: number | null;
  status: UptimeStatus;
  successCount?: number;
  failureCount?: number;
  totalCount?: number;
  // Incidents that were active on this date (used to show context for downtime)
  incidents?: IncidentSummary[];
}

// Alert Types
export type AlertChannelType =
  | "email"
  | "slack"
  | "discord"
  | "teams"
  | "pagerduty"
  | "webhook"
  | "sms"
  | "ntfy"
  | "irc"
  | "twitter";

export type AlertStatus = "triggered" | "acknowledged" | "resolved";

export interface AlertConditions {
  consecutiveFailures?: number;
  failuresInWindow?: {
    count: number;
    windowMinutes: number;
  };
  degradedDuration?: number;
  consecutiveSuccesses?: number;
}

export interface EscalationSeverityOverrides {
  minor?: { ackTimeoutMinutes?: number };
  major?: { ackTimeoutMinutes?: number };
  critical?: { ackTimeoutMinutes?: number };
}

export interface EscalationStep {
  id: string;
  policyId: string;
  stepNumber: number;
  delayMinutes: number;
  channels: string[];
  oncallRotationId?: string | null;
  notifyOnAckTimeout: boolean;
  skipIfAcknowledged: boolean;
}

export interface EscalationPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  ackTimeoutMinutes: number;
  severityOverrides?: EscalationSeverityOverrides;
  active: boolean;
  steps?: EscalationStep[];
}

export interface OncallRotation {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  timezone: string;
  rotationStart: string;
  shiftDurationMinutes: number;
  participants: string[];
  handoffNotificationMinutes: number;
  handoffChannels: string[];
  lastHandoffNotificationAt?: string | null;
  lastHandoffStart?: string | null;
  active: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OncallOverride {
  id: string;
  rotationId: string;
  userId: string;
  startAt: string;
  endAt: string;
  reason?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

// Status Page Types
export interface StatusPageTheme {
  name: string;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  customCss?: string;
}

export interface StatusPageSettings {
  showUptimePercentage?: boolean;
  showResponseTime?: boolean;
  showIncidentHistory?: boolean;
  showServicesPage?: boolean;
  showGeoMap?: boolean;
  uptimeDays?: number;
  headerText?: string;
  footerText?: string;
  supportUrl?: string;
  hideBranding?: boolean;
}

// Organization Types
export type OrganizationPlan = "free" | "pro" | "enterprise";
export type MemberRole = "owner" | "admin" | "member" | "viewer";

// Timing Metrics
export interface TimingMetrics {
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  transferMs?: number;
  totalMs: number;
}

// Percentile Stats
export interface PercentileStats {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

// SSE Event Types
export type SSEEventType =
  | "monitor:status"
  | "monitor:check"
  | "incident:created"
  | "incident:updated"
  | "incident:resolved"
  | "maintenance:started"
  | "maintenance:ended";

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
}

// Embed Types
export type OverallStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
export type BadgeStyle = "flat" | "plastic" | "flat-square" | "for-the-badge";
export type EmbedType = "badge" | "dot" | "card" | "widget";
export type EmbedTheme = "light" | "dark" | "auto";

export interface EmbedSettings {
  enabled: boolean;
  allowedDomains?: string[];
  showMonitorsInCard: boolean;
  showIncidentsInCard: boolean;
  defaultBadgeStyle: BadgeStyle;
  customBadgeLabel?: string;
}

export interface EmbedConfig {
  type: EmbedType;
  style?: BadgeStyle;
  theme?: EmbedTheme;
  size?: number;
  animate?: boolean;
  showMonitors?: boolean;
  showIncidents?: boolean;
  compact?: boolean;
  refreshInterval?: number;
}

export interface EmbedStatusResponse {
  status: OverallStatus;
  statusText: string;
  name: string;
  url: string;
  lastUpdatedAt: string;
  monitors?: Array<{
    id: string;
    name: string;
    status: MonitorStatus;
  }>;
  activeIncidents?: Array<{
    id: string;
    title: string;
    status: string;
    severity: string;
  }>;
}

export interface MonitorEmbedStatusResponse {
  id: string;
  name: string;
  status: MonitorStatus;
  statusText: string;
  lastUpdatedAt: string;
}

// Unified Event Types
export type EventType = "incident" | "maintenance";
export type MaintenanceStatus = "scheduled" | "active" | "completed";

export interface EventUpdate {
  id: string;
  status: string;
  message: string;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string;
  };
}

export interface EventDocument {
  id: string;
  title: string;
  documentUrl: string;
  documentType: "postmortem" | "rca" | "timeline" | "report" | "other";
  description: string | null;
  createdAt: string;
}

export interface UnifiedEvent {
  id: string;
  type: EventType;
  title: string;
  description: string | null;
  status: IncidentStatus | MaintenanceStatus;
  severity: IncidentSeverity | "maintenance";
  affectedMonitors: string[];
  affectedMonitorDetails?: Array<{
    id: string;
    name: string;
  }>;
  startedAt: string;
  endedAt: string | null;
  timezone?: string;
  updates: EventUpdate[];
  documents?: EventDocument[];
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
  };
  // Subscription info (for authenticated users)
  isSubscribed?: boolean;
  subscriberCount?: number;
  // Public status page impact scope data (optional)
  impactScope?: ImpactScopeData;
}

export interface EventsResponse {
  events: UnifiedEvent[];
  total: number;
  hasMore: boolean;
}

export interface EventFilters {
  types?: EventType[];
  status?: string[];
  severity?: (IncidentSeverity | "maintenance")[];
  monitors?: string[];
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface EventSubscriptionChannels {
  email: boolean;
  webhook?: string;
}

export interface EventSubscription {
  id: string;
  eventType: EventType;
  eventId: string;
  userId?: string;
  email?: string;
  channels: EventSubscriptionChannels;
  verified: boolean;
  createdAt: string;
}

// Security Headers Types
export type SecurityHeaderStatus = "present" | "missing" | "invalid" | "warning";
export type SecurityGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface SecurityHeaderResult {
  header: string;
  status: SecurityHeaderStatus;
  value: string | null;
  score: number; // 0-100
  recommendations?: string[];
}

export interface SecurityHeadersAnalysis {
  overallScore: number; // 0-100
  grade: SecurityGrade;
  headers: {
    contentSecurityPolicy?: SecurityHeaderResult;
    xContentTypeOptions?: SecurityHeaderResult;
    xFrameOptions?: SecurityHeaderResult;
    xXssProtection?: SecurityHeaderResult;
    referrerPolicy?: SecurityHeaderResult;
    permissionsPolicy?: SecurityHeaderResult;
    strictTransportSecurity?: SecurityHeaderResult;
    hstsPreload?: SecurityHeaderResult;
  };
  checkedAt: string;
}

// External Status Provider Types
export type ExternalStatusProvider =
  | "aws"
  | "gcp"
  | "azure"
  | "cloudflare"
  | "okta"
  | "auth0"
  | "stripe"
  | "twilio"
  | "statuspage_io"
  | "custom";

export type ExternalMappedStatus =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
  | "unknown";

export interface ExternalStatusProviderConfig {
  aws?: {
    regions?: string[];
    services?: string[];
  };
  gcp?: {
    zones?: string[];
    products?: string[];
  };
  azure?: {
    regions?: string[];
    services?: string[];
  };
  cloudflare?: {
    components?: string[];
  };
  statuspage_io?: {
    baseUrl: string;
    components?: string[];
  };
  custom?: {
    statusUrl: string;
    jsonPath?: string;
    statusMapping?: Record<string, string>;
  };
  pollIntervalSeconds?: number;
}

export interface ExternalStatusComponent {
  id?: string;
  name: string;
  status: string;
  description?: string;
}

export interface ExternalStatusIncident {
  id?: string;
  name?: string;
  status?: string;
  impact?: string;
  body?: string;
  startedAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
}

export interface ExternalStatusProviderData {
  id: string;
  provider: ExternalStatusProvider;
  name: string;
  description?: string;
  currentStatus: ExternalMappedStatus;
  currentStatusText?: string;
  displayOnStatusPage: boolean;
  affectsMonitorIds: string[];
  lastFetchedAt?: string;
  enabled: boolean;
}

export interface ExternalStatusUpdateData {
  id: string;
  providerId: string;
  providerStatus: string;
  mappedStatus: ExternalMappedStatus;
  statusText?: string;
  affectedComponents?: ExternalStatusComponent[];
  incident?: ExternalStatusIncident;
  fetchedAt: string;
}

// Impact Scope Visualization Types (public status pages)
export type ImpactLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ImpactScopeDependency {
  monitorId: string;
  monitorName: string;
  status: string;
  description?: string;
}

export interface ImpactScopeRegion {
  region: string;
  affectedMonitors: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export interface ImpactScopeData {
  impactLevel: ImpactLevel;
  impactScore: number;
  impactPercentage: number;
  affectedMonitorCount: number;
  totalMonitorCount: number;
  affectedRegions: ImpactScopeRegion[];
  dependencies: {
    upstream: ImpactScopeDependency[];
    downstream: ImpactScopeDependency[];
  };
}

export interface EnhancedAffectedMonitorDetail {
  id: string;
  name: string;
  status?: string;
  regions?: string[];
  isRootCause?: boolean;
  upstreamDependencies?: Array<{
    id: string;
    name: string;
  }>;
  downstreamDependencies?: Array<{
    id: string;
    name: string;
  }>;
}

// Badge Template Types
export type BadgeType = "badge" | "dot";
export type BadgeStyleType = "flat" | "plastic" | "flat-square" | "for-the-badge" | "modern";

export interface BadgeStatusColors {
  operational?: string;
  degraded?: string;
  partialOutage?: string;
  majorOutage?: string;
  maintenance?: string;
  unknown?: string;
}

export interface BadgeDotConfig {
  size?: number;
  animate?: boolean;
  animationStyle?: "pulse" | "blink";
}

export interface BadgeCustomDataConfig {
  enabled: boolean;
  type: "uptime" | "response_time" | "p50" | "p90" | "p99" | "error_rate" | "custom";
  customLabel?: string;
  customValue?: string;
  thresholds?: Array<{
    value: number;
    color: string;
    comparison: "lt" | "lte" | "gt" | "gte" | "eq";
  }>;
}

export interface BadgeTemplateConfig {
  label?: string;
  labelColor?: string;
  statusColors?: BadgeStatusColors;
  textColor?: string;
  statusTextColor?: string;
  scale?: number;
  dot?: BadgeDotConfig;
  customData?: BadgeCustomDataConfig;
  showIcon?: boolean;
  customCss?: string;
}

export interface BadgeTemplateData {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: BadgeType;
  style: BadgeStyleType;
  config: BadgeTemplateConfig;
  isDefault: boolean;
  usageCount: number;
  lastUsedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
