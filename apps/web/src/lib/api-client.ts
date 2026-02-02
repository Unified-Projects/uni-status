import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from "./api";
import type {
  CreateMonitorInput,
  UpdateMonitorInput,
  CreateIncidentInput,
  UpdateIncidentInput,
  CreateIncidentUpdateInput,
  CreateStatusPageInput,
  UpdateStatusPageInput,
  CreateAlertChannelInput,
  CreateAlertPolicyInput,
  CreateOrganizationInput,
  InviteMemberInput,
  CreateMaintenanceWindowInput,
  UpdateMaintenanceWindowInput,
  UpdateOrganizationCredentialsInput,
  CredentialType,
  MonitorConfig,
} from "@uni-status/shared/validators";
import type { TemplateConfig, IncidentSeverity, IncidentStatus, MaintenanceStatus } from "@uni-status/shared";
import type { BadgeTemplateConfig, BadgeTemplateData, BadgeType, BadgeStyleType } from "@uni-status/shared/types";
import type { MaskedOrganizationCredentials } from "@uni-status/shared/types/credentials";

// Types inferred from database schema
export interface Monitor {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  url: string;
  type: "http" | "https" | "dns" | "ssl" | "tcp" | "ping" | "heartbeat" | "database_postgres" | "database_mysql" | "database_mongodb" | "database_redis" | "database_elasticsearch" | "grpc" | "websocket" | "smtp" | "imap" | "pop3" | "email_auth" | "ssh" | "ldap" | "rdp" | "mqtt" | "amqp" | "traceroute" | "prometheus_blackbox" | "prometheus_promql" | "prometheus_remote_write";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | null;
  headers: Record<string, string>;
  body: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  regions: string[];
  assertions: {
    statusCode?: number[];
    responseTime?: number;
    headers?: Record<string, string>;
    body?: {
      contains?: string;
      notContains?: string;
      regex?: string;
      jsonPath?: { path: string; value: unknown }[];
    };
  };
  degradedThresholdMs: number | null;
  status: "active" | "degraded" | "down" | "paused" | "pending";
  paused: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  config?: MonitorConfig | null;
  // Stats from enriched API response
  uptimePercentage?: number | null;
  avgResponseTime?: number | null;
}

export interface CheckResult {
  id: string;
  monitorId: string;
  region: string;
  status: "success" | "degraded" | "failure" | "timeout" | "error";
  responseTimeMs: number | null;
  statusCode: number | null;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  transferMs: number | null;
  responseSize: number | null;
  errorMessage: string | null;
  errorCode: string | null;
  headers: Record<string, string> | null;
  certificateInfo: {
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysUntilExpiry?: number;
  } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Incident {
  id: string;
  organizationId: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  message: string;
  createdBy: string;
  createdAt: string;
}

export interface StatusPage {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  customDomain: string | null;
  published: boolean;
  passwordHash: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  theme: {
    name: string;
    useCustomTheme?: boolean;
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    customCss?: string;
    colorMode?: "system" | "light" | "dark";
  };
  settings: {
    showUptimePercentage?: boolean;
    showResponseTime?: boolean;
    showIncidentHistory?: boolean;
    showServicesPage?: boolean;
    showGeoMap?: boolean;
    uptimeDays?: number;
    uptimeGranularity?: "minute" | "hour" | "day" | "auto";
    headerText?: string;
    footerText?: string;
    supportUrl?: string;
    hideBranding?: boolean;
    defaultTimezone?: string;
    localization?: {
      defaultLocale?: string;
      supportedLocales?: string[];
      rtlLocales?: string[];
      translations?: Record<string, Record<string, string>>;
    };
    displayMode?: "bars" | "graph" | "both";
    graphTooltipMetrics?: {
      avg?: boolean;
      min?: boolean;
      max?: boolean;
      p50?: boolean;
      p90?: boolean;
      p99?: boolean;
    };
  };
  authConfig?: {
    protectionMode: "none" | "password" | "oauth" | "both";
    oauthMode?: "org_members" | "allowlist" | "any_authenticated";
    allowedEmails?: string[];
    allowedDomains?: string[];
    allowedRoles?: Array<"owner" | "admin" | "member" | "viewer">;
  };
  template?: TemplateConfig;
  seo?: {
    title?: string;
    description?: string;
    ogImage?: string;
    ogTemplate?: "classic" | "modern" | "minimal" | "dashboard" | "hero" | "compact";
  };
  createdAt: string;
  updatedAt: string;
}

export interface StatusPageMonitor {
  id: string;
  statusPageId: string;
  monitorId: string;
  displayName: string | null;
  description: string | null;
  order: number;
  group: string | null;
  showResponseTime: boolean;
}

export interface Subscriber {
  id: string;
  statusPageId: string;
  email: string | null;
  webhookUrl: string | null;
  phoneNumber: string | null;
  channels: string[];
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface CrowdsourcedSettings {
  id?: string;
  statusPageId?: string;
  enabled: boolean;
  reportThreshold: number;
  timeWindowMinutes: number;
  rateLimitPerIp: number;
  autoDegradeEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StatusPageThemeColors {
  primary: string;
  secondary?: string;
  background: string;
  backgroundDark?: string;
  text: string;
  textDark?: string;
  surface: string;
  surfaceDark?: string;
  border?: string;
  borderDark?: string;
  success: string;
  warning: string;
  error: string;
  info?: string;
}

export interface StatusPageTheme {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  colors: StatusPageThemeColors;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BadgeTemplateInput {
  name: string;
  description?: string;
  type: BadgeType;
  style: BadgeStyleType;
  config?: BadgeTemplateConfig;
  isDefault?: boolean;
}

export type UpdateBadgeTemplateInput = Partial<BadgeTemplateInput>;

export interface AlertChannel {
  id: string;
  organizationId: string;
  name: string;
  type: "email" | "slack" | "discord" | "teams" | "pagerduty" | "webhook" | "sms" | "ntfy";
  config: {
    email?: string;
    fromAddress?: string;
    toAddresses?: string[];
    webhookUrl?: string;
    channel?: string;
    routingKey?: string;
    url?: string;
    headers?: Record<string, string>;
    method?: "GET" | "POST";
    signingKey?: string;
    phoneNumber?: string;
    topic?: string;
    server?: string;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  escalationPolicyId?: string | null;
  oncallRotationId?: string | null;
  conditions: {
    consecutiveFailures?: number;
    failuresInWindow?: {
      count: number;
      windowMinutes: number;
    };
    degradedDuration?: number;
    consecutiveSuccesses?: number;
  };
  channels: string[];
  monitorIds?: string[];
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AlertHistoryRecord {
  id: string;
  alertPolicyId: string;
  monitorId: string;
  status: "triggered" | "acknowledged" | "resolved";
  triggeredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: "free" | "pro" | "enterprise";
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  customRoleId: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  customRole?: OrganizationRole | null;
}

export interface OrganizationRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  resolvedPermissions: string[];
  isSystem: boolean;
  color: string | null;
  icon?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OrganizationRolesResponse {
  predefined: OrganizationRole[];
  custom: OrganizationRole[];
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  token: string;
  expiresAt: string;
  createdAt: string;
}

// Pending invitation for the current user (from GET /users/me/invitations)
export interface PendingInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  expiresAt: string;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  inviter: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

export interface AcceptInvitationResponse {
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  role?: "owner" | "admin" | "member" | "viewer";
  membershipId?: string;
  alreadyMember?: boolean;
}

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface MaintenanceWindow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  affectedMonitors: string[];
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrence: {
    type: "none" | "daily" | "weekly" | "monthly";
    interval?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
  };
  notifySubscribers: {
    beforeStart?: number;
    onStart?: boolean;
    onEnd?: boolean;
  };
  active: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  computedStatus?: "scheduled" | "active" | "completed";
  createdByUser?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.password_change"
  | "user.mfa_enable"
  | "user.mfa_disable"
  | "organization.create"
  | "organization.update"
  | "organization.delete"
  | "organization.member_invite"
  | "organization.member_remove"
  | "organization.member_role_change"
  | "monitor.create"
  | "monitor.update"
  | "monitor.delete"
  | "monitor.pause"
  | "monitor.resume"
  | "incident.create"
  | "incident.update"
  | "incident.resolve"
  | "status_page.create"
  | "status_page.update"
  | "status_page.delete"
  | "status_page.publish"
  | "status_page.unpublish"
  | "alert_channel.create"
  | "alert_channel.update"
  | "alert_channel.delete"
  | "alert_policy.create"
  | "alert_policy.update"
  | "alert_policy.delete"
  | "api_key.create"
  | "api_key.delete"
  | "api_key.use"
  | "settings.update";

export type ResourceType =
  | "user"
  | "organization"
  | "monitor"
  | "incident"
  | "status_page"
  | "alert_channel"
  | "alert_policy"
  | "api_key"
  | "maintenance_window"
  | "subscriber";

export interface AuditLog {
  id: string;
  organizationId: string;
  userId: string | null;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string | null;
  resourceName: string | null;
  metadata: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    changes?: Array<{ field: string; from: unknown; to: unknown }>;
    reason?: string;
  };
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null;
}

export interface AuditLogsListParams {
  action?: AuditAction;
  userId?: string;
  resourceType?: ResourceType;
  resourceId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogsListResponse {
  data: AuditLog[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Generic pagination meta type
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Generic paginated response type
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// Pagination params for list endpoints
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface AuditActionCount {
  action: AuditAction;
  count: number;
}

export interface AuditUserCount {
  userId: string | null;
  name: string | null;
  email: string | null;
  count: number;
}

export interface DashboardAnalytics {
  monitors: {
    total: number;
    byStatus: Record<string, number>;
  };
  incidents: {
    active: number;
    recent: Incident[];
  };
  uptime: {
    average: number | null;
    trend: Array<{ date: string; uptime: number }>;
  };
}

export interface UptimeAnalytics {
  monitorId?: string;
  days: number;
  granularity?: "minute" | "hour" | "day";
  data: Array<{
    date: string;
    timestamp?: string;
    uptimePercentage: number | null;
    uptime?: number | null;
    successCount: number;
    degradedCount: number;
    failureCount: number;
    totalCount: number;
    incidents?: Array<{
      id: string;
      title: string;
      severity: "minor" | "major" | "critical";
    }>;
  }>;
  overall: {
    uptimePercentage: number | null;
    totalChecks: number;
    successfulChecks: number;
    failedChecks: number;
  };
}

export interface ResponseTimeAnalytics {
  monitorId: string;
  hours: number;
  granularity: "raw" | "hourly" | "4hour";
  summary: {
    avg: number | null;
    min: number | null;
    max: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
    p95: number | null;
    p99: number | null;
  };
  data: Array<{
    timestamp: string;
    avg: number | null;
    min: number | null;
    max: number | null;
    p50: number | null;
    p90: number | null;
    p99: number | null;
    count: number;
  }>;
}

export type EventType = "incident" | "maintenance";

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
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
  };
  isSubscribed?: boolean;
  subscriberCount?: number;
}

export interface EventsListParams {
  types?: EventType[];
  status?: string[];
  severity?: (IncidentSeverity | "maintenance")[];
  monitors?: string[];
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface EventsListResponse {
  events: UnifiedEvent[];
  total: number;
  hasMore: boolean;
}

export interface EventSubscription {
  id: string;
  eventType: EventType;
  eventId: string;
  userId?: string;
  email?: string;
  channels: {
    email: boolean;
    webhook?: string;
  };
  verified: boolean;
  createdAt: string;
}

export type SignupMode = "invite_only" | "domain_auto_join" | "open_with_approval";

export interface SystemStatus {
  deploymentType: string;
  isSelfHosted: boolean;
  setupCompleted: boolean;
  signupMode: SignupMode | null;
}

export interface SystemSettings {
  id: string;
  setupCompleted: boolean;
  setupCompletedAt: string | null;
  signupMode: SignupMode;
  primaryOrganization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSetupInput {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  organizationName: string;
  organizationSlug: string;
  signupMode?: SignupMode;
}

export interface PendingApproval {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewer?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewedAt: string | null;
  notes: string | null;
}

export interface PendingApprovalStatus {
  hasPendingApproval: boolean;
  status: "pending" | "approved" | "rejected" | null;
  requestedAt?: string;
  reviewedAt?: string | null;
  notes?: string | null;
  isOrganizationMember?: boolean;
}

// Helper to extract data from API response
async function unwrap<T>(
  promise: Promise<{ success: boolean; data?: T; error?: { code: string; message: string } }>
): Promise<T> {
  const response = await promise;
  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Unknown error");
  }
  return response.data;
}

// API Client with all endpoints
export const apiClient = {
  certificates: {
    list: async (params?: PaginationParams, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      const res = await apiGet<CertificateListItem[], { stats?: CertificateStats; meta: PaginationMeta }>(
        `/api/v1/certificates${query ? `?${query}` : ""}`,
        { organizationId }
      );
      if (!res.success) {
        throw new Error(res.error?.message || "Failed to load certificates");
      }

      return {
        data: (res.data ?? []) as CertificateListItem[],
        stats: (res as { stats?: CertificateStats }).stats,
        meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
      };
    },

    get: (monitorId: string, organizationId?: string) =>
      unwrap(apiGet<CertificateDetail>(`/api/v1/certificates/${monitorId}`, { organizationId })),
  },

  monitors: {
    list: async (params?: PaginationParams, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      const res = await apiGet<Monitor[], { meta: PaginationMeta }>(
        `/api/v1/monitors${query ? `?${query}` : ""}`,
        { organizationId }
      );
      if (!res.success) {
        throw new Error(res.error?.message || "Failed to load monitors");
      }
      return {
        data: res.data ?? [],
        meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
      };
    },

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<Monitor>(`/api/v1/monitors/${id}`, { organizationId })),

    create: (data: CreateMonitorInput, organizationId?: string) =>
      unwrap(apiPost<Monitor>("/api/v1/monitors", data, { organizationId })),

    update: (id: string, data: UpdateMonitorInput, organizationId?: string) =>
      unwrap(apiPatch<Monitor>(`/api/v1/monitors/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/monitors/${id}`, { organizationId })),

    pause: (id: string, organizationId?: string) =>
      unwrap(apiPost<Monitor>(`/api/v1/monitors/${id}/pause`, {}, { organizationId })),

    resume: (id: string, organizationId?: string) =>
      unwrap(apiPost<Monitor>(`/api/v1/monitors/${id}/resume`, {}, { organizationId })),

    checkNow: (id: string, organizationId?: string) =>
      unwrap(apiPost<{ queued: boolean }>(`/api/v1/monitors/${id}/check`, {}, { organizationId })),

    getResults: (
      id: string,
      params?: { limit?: number; offset?: number },
      organizationId?: string
    ) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      return unwrap(
        apiGet<CheckResult[]>(
          `/api/v1/monitors/${id}/results${query ? `?${query}` : ""}`,
          { organizationId }
        )
      );
    },
  },

  incidents: {
    list: async (params?: PaginationParams & { status?: string }, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      if (params?.status) searchParams.set("status", params.status);
      const query = searchParams.toString();
      const res = await apiGet<Incident[], { meta: PaginationMeta }>(
        `/api/v1/incidents${query ? `?${query}` : ""}`,
        { organizationId }
      );
      if (!res.success) {
        throw new Error(res.error?.message || "Failed to load incidents");
      }
      return {
        data: res.data ?? [],
        meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
      };
    },

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<Incident & { updates: IncidentUpdate[]; monitors: Monitor[] }>(
        `/api/v1/incidents/${id}`,
        { organizationId }
      )),

    create: (data: CreateIncidentInput, organizationId?: string) =>
      unwrap(apiPost<Incident>("/api/v1/incidents", data, { organizationId })),

    update: (id: string, data: UpdateIncidentInput, organizationId?: string) =>
      unwrap(apiPatch<Incident>(`/api/v1/incidents/${id}`, data, { organizationId })),

    addUpdate: (id: string, data: CreateIncidentUpdateInput, organizationId?: string) =>
      unwrap(apiPost<IncidentUpdate>(`/api/v1/incidents/${id}/updates`, data, { organizationId })),

    resolve: (id: string, organizationId?: string) =>
      unwrap(apiPost<Incident>(`/api/v1/incidents/${id}/resolve`, {}, { organizationId })),
  },

  statusPages: {
    list: async (params?: PaginationParams, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      const res = await apiGet<(StatusPage & { monitors: StatusPageMonitor[] })[], { meta: PaginationMeta }>(
        `/api/v1/status-pages${query ? `?${query}` : ""}`,
        { organizationId }
      );
      if (!res.success) {
        throw new Error(res.error?.message || "Failed to load status pages");
      }
      return {
        data: res.data ?? [],
        meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
      };
    },

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<StatusPage & { monitors: StatusPageMonitor[] }>(
        `/api/v1/status-pages/${id}`,
        { organizationId }
      )),

    create: (data: CreateStatusPageInput, organizationId?: string) =>
      unwrap(apiPost<StatusPage>("/api/v1/status-pages", data, { organizationId })),

    update: (id: string, data: UpdateStatusPageInput, organizationId?: string) =>
      unwrap(apiPatch<StatusPage>(`/api/v1/status-pages/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/status-pages/${id}`, { organizationId })),

    addMonitor: (
      id: string,
      data: { monitorId: string; displayName?: string; order?: number; group?: string },
      organizationId?: string
    ) =>
      unwrap(apiPost<StatusPageMonitor>(`/api/v1/status-pages/${id}/monitors`, data, { organizationId })),

    updateMonitor: (
      id: string,
      monitorId: string,
      data: { displayName?: string; description?: string; order?: number; group?: string | null },
      organizationId?: string
    ) =>
      unwrap(apiPatch<StatusPageMonitor>(`/api/v1/status-pages/${id}/monitors/${monitorId}`, data, { organizationId })),

    removeMonitor: (id: string, monitorId: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(
        `/api/v1/status-pages/${id}/monitors/${monitorId}`,
        { organizationId }
      )),

    getSubscribers: (id: string, organizationId?: string) =>
      unwrap(apiGet<Subscriber[]>(`/api/v1/status-pages/${id}/subscribers`, { organizationId })),

    getCrowdsourcedSettings: (id: string, organizationId?: string) =>
      unwrap(apiGet<CrowdsourcedSettings>(`/api/v1/status-pages/${id}/crowdsourced`, { organizationId })),

    updateCrowdsourcedSettings: (
      id: string,
      data: Partial<CrowdsourcedSettings>,
      organizationId?: string
    ) =>
      unwrap(apiPatch<CrowdsourcedSettings>(`/api/v1/status-pages/${id}/crowdsourced`, data, { organizationId })),
  },

  statusPageThemes: {
    list: (organizationId?: string) =>
      unwrap(apiGet<StatusPageTheme[]>("/api/v1/status-page-themes", { organizationId })),

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<StatusPageTheme>(`/api/v1/status-page-themes/${id}`, { organizationId })),

    create: (
      data: { name: string; description?: string; colors: StatusPageThemeColors; isDefault?: boolean },
      organizationId?: string
    ) =>
      unwrap(apiPost<StatusPageTheme>("/api/v1/status-page-themes", data, { organizationId })),

    update: (
      id: string,
      data: Partial<{ name: string; description?: string; colors: StatusPageThemeColors; isDefault?: boolean }>,
      organizationId?: string
    ) =>
      unwrap(apiPatch<StatusPageTheme>(`/api/v1/status-page-themes/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/status-page-themes/${id}`, { organizationId })),
  },

  badgeTemplates: {
    list: (organizationId?: string) =>
      unwrap(apiGet<BadgeTemplateData[]>("/api/v1/embeds/badge-templates", { organizationId })),

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<BadgeTemplateData>(`/api/v1/embeds/badge-templates/${id}`, { organizationId })),

    create: (data: BadgeTemplateInput, organizationId?: string) =>
      unwrap(apiPost<BadgeTemplateData>("/api/v1/embeds/badge-templates", data, { organizationId })),

    update: (id: string, data: UpdateBadgeTemplateInput, organizationId?: string) =>
      unwrap(apiPut<BadgeTemplateData>(`/api/v1/embeds/badge-templates/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/embeds/badge-templates/${id}`, { organizationId })),
  },

  alerts: {
    channels: {
      list: async (params?: PaginationParams, organizationId?: string) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        const query = searchParams.toString();
        const res = await apiGet<AlertChannel[], { meta: PaginationMeta }>(
          `/api/v1/alerts/channels${query ? `?${query}` : ""}`,
          { organizationId }
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load alert channels");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
        };
      },

      get: (id: string, organizationId?: string) =>
        unwrap(apiGet<AlertChannel>(`/api/v1/alerts/channels/${id}`, { organizationId })),

      create: (data: CreateAlertChannelInput, organizationId?: string) =>
        unwrap(apiPost<AlertChannel>("/api/v1/alerts/channels", data, { organizationId })),

      update: (id: string, data: Partial<CreateAlertChannelInput>, organizationId?: string) =>
        unwrap(apiPatch<AlertChannel>(`/api/v1/alerts/channels/${id}`, data, { organizationId })),

      delete: (id: string, organizationId?: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/alerts/channels/${id}`, { organizationId })),

      test: (id: string, organizationId?: string) =>
        unwrap(apiPost<{ queued: boolean }>(`/api/v1/alerts/channels/${id}/test`, {}, { organizationId })),
    },

    policies: {
      list: async (params?: PaginationParams, organizationId?: string) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        const query = searchParams.toString();
        const res = await apiGet<AlertPolicy[], { meta: PaginationMeta }>(
          `/api/v1/alerts/policies${query ? `?${query}` : ""}`,
          { organizationId }
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load alert policies");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
        };
      },

      get: (id: string, organizationId?: string) =>
        unwrap(apiGet<AlertPolicy & { channels: AlertChannel[] }>(
          `/api/v1/alerts/policies/${id}`,
          { organizationId }
        )),

      create: (data: CreateAlertPolicyInput, organizationId?: string) =>
        unwrap(apiPost<AlertPolicy>("/api/v1/alerts/policies", data, { organizationId })),

      update: (id: string, data: Partial<CreateAlertPolicyInput>, organizationId?: string) =>
        unwrap(apiPatch<AlertPolicy>(`/api/v1/alerts/policies/${id}`, data, { organizationId })),

      delete: (id: string, organizationId?: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/alerts/policies/${id}`, { organizationId })),

      monitorCounts: (organizationId?: string) =>
        unwrap(apiGet<Record<string, number>>("/api/v1/alerts/policies/monitor-counts", { organizationId })),
    },

    history: {
      list: async (params?: { limit?: number; offset?: number; status?: string }, organizationId?: string) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        if (params?.status) searchParams.set("status", params.status);
        const query = searchParams.toString();
        const res = await apiGet<AlertHistoryRecord[], { meta: PaginationMeta }>(
          `/api/v1/alerts/history${query ? `?${query}` : ""}`,
          { organizationId }
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load alert history");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 50, offset: 0, hasMore: false },
        };
      },

      acknowledge: (id: string, organizationId?: string) =>
        unwrap(apiPost<AlertHistoryRecord>(`/api/v1/alerts/history/${id}/acknowledge`, {}, { organizationId })),
    },
  },

  organizations: {
    list: () => unwrap(apiGet<Organization[]>("/api/v1/organizations")),

    get: (id: string) => unwrap(apiGet<Organization>(`/api/v1/organizations/${id}`)),

    create: (data: CreateOrganizationInput) =>
      unwrap(apiPost<Organization>("/api/v1/organizations", data)),

    update: (id: string, data: Partial<CreateOrganizationInput>) =>
      unwrap(apiPatch<Organization>(`/api/v1/organizations/${id}`, data)),

    delete: (id: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/organizations/${id}`)),

    members: {
      list: async (orgId: string, params?: PaginationParams) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        const query = searchParams.toString();
        const res = await apiGet<OrganizationMember[], { meta: PaginationMeta }>(
          `/api/v1/organizations/${orgId}/members${query ? `?${query}` : ""}`
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load members");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
        };
      },

      updateRole: (orgId: string, memberId: string, role: string) =>
        unwrap(apiPatch<OrganizationMember>(
          `/api/v1/organizations/${orgId}/members/${memberId}`,
          { role }
        )),

      remove: (orgId: string, memberId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(
          `/api/v1/organizations/${orgId}/members/${memberId}`
        )),
    },

    invitations: {
      list: async (orgId: string, params?: PaginationParams) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        const query = searchParams.toString();
        const res = await apiGet<OrganizationInvitation[], { meta: PaginationMeta }>(
          `/api/v1/organizations/${orgId}/invitations${query ? `?${query}` : ""}`
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load invitations");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
        };
      },

      create: (orgId: string, data: InviteMemberInput) =>
        unwrap(apiPost<OrganizationInvitation>(`/api/v1/organizations/${orgId}/invitations`, data)),

      cancel: (orgId: string, invitationId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(
          `/api/v1/organizations/${orgId}/invitations/${invitationId}`
        )),

      resend: (orgId: string, invitationId: string) =>
        unwrap(apiPost<OrganizationInvitation>(
          `/api/v1/organizations/${orgId}/invitations/${invitationId}/resend`,
          {}
        )),
    },

    apiKeys: {
      list: (orgId: string) =>
        unwrap(apiGet<ApiKey[]>(`/api/v1/organizations/${orgId}/api-keys`)),

      create: (orgId: string, data: { name: string; scopes?: string[]; expiresIn?: number }) =>
        unwrap(apiPost<ApiKey & { key: string }>(`/api/v1/organizations/${orgId}/api-keys`, data)),

      delete: (orgId: string, keyId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/organizations/${orgId}/api-keys/${keyId}`)),
    },

    getIntegrations: (orgId?: string) =>
      unwrap(apiGet<{
        pagespeed: {
          enabled: boolean;
          hasApiKey: boolean;
          apiKeyPreview: string | null;
        };
      }>(`/api/v1/organizations/${orgId}/integrations`, { organizationId: orgId })),

    updateIntegrations: (orgId?: string, data?: {
      pagespeed?: {
        enabled?: boolean;
        apiKey?: string;
      };
    }) =>
      unwrap(apiPatch<{
        pagespeed: {
          enabled: boolean;
          hasApiKey: boolean;
          apiKeyPreview: string | null;
        };
      }>(`/api/v1/organizations/${orgId}/integrations`, data, { organizationId: orgId })),

    credentials: {
      get: (orgId: string) =>
        unwrap(apiGet<MaskedOrganizationCredentials>(`/api/v1/organizations/${orgId}/credentials`)),

      update: (orgId: string, data: UpdateOrganizationCredentialsInput) =>
        unwrap(apiPatch<MaskedOrganizationCredentials>(`/api/v1/organizations/${orgId}/credentials`, data)),

      delete: (orgId: string, type: CredentialType) =>
        unwrap(apiDelete<{ deleted: boolean; type: CredentialType }>(`/api/v1/organizations/${orgId}/credentials/${type}`)),

      test: (orgId: string, type: CredentialType, testDestination?: string) =>
        unwrap(apiPost<{ success: boolean; message: string }>(
          `/api/v1/organizations/${orgId}/credentials/test`,
          { type, testDestination }
        )),
    },

    roles: {
      list: (orgId: string) =>
        unwrap(apiGet<OrganizationRolesResponse>(`/api/v1/organizations/${orgId}/roles`)),

      get: (orgId: string, roleId: string) =>
        unwrap(apiGet<OrganizationRole>(`/api/v1/organizations/${orgId}/roles/${roleId}`)),

      create: (orgId: string, data: { name: string; description?: string; permissions: string[]; color?: string }) =>
        unwrap(apiPost<OrganizationRole>(`/api/v1/organizations/${orgId}/roles`, data)),

      update: (orgId: string, roleId: string, data: { name?: string; description?: string; permissions?: string[]; color?: string }) =>
        unwrap(apiPatch<OrganizationRole>(`/api/v1/organizations/${orgId}/roles/${roleId}`, data)),

      delete: (orgId: string, roleId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/organizations/${orgId}/roles/${roleId}`)),

      assignToMember: (orgId: string, memberId: string, roleId: string) =>
        unwrap(apiPatch<{ id: string; role: string; customRoleId: string | null }>(
          `/api/v1/organizations/${orgId}/members/${memberId}/role`,
          { roleId }
        )),
    },
  },

  // User-facing invitations (for accepting/declining invitations sent to the user)
  invitations: {
    // Get all pending invitations for the current user
    listPending: () =>
      unwrap(apiGet<PendingInvitation[]>("/api/v1/invitations/users/me/invitations")),

    // Accept an invitation
    accept: (invitationId: string) =>
      unwrap(apiPost<AcceptInvitationResponse>(`/api/v1/invitations/${invitationId}/accept`, {})),

    // Decline an invitation
    decline: (invitationId: string) =>
      unwrap(apiPost<{ declined: boolean }>(`/api/v1/invitations/${invitationId}/decline`, {})),
  },

  analytics: {
    dashboard: (organizationId?: string) =>
      unwrap(apiGet<DashboardAnalytics>("/api/v1/analytics/dashboard", { organizationId })),

    uptime: async (params?: { monitorId?: string; days?: number; granularity?: "minute" | "hour" | "day" | "auto" }, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.monitorId) searchParams.set("monitorId", params.monitorId);
      if (params?.days) searchParams.set("days", params.days.toString());
      if (params?.granularity) searchParams.set("granularity", params.granularity);
      const query = searchParams.toString();

      const raw: {
        success: boolean;
        data?: {
          uptimePercentage: number;
          days: number;
          granularity: "minute" | "hour" | "day";
          totals: { success: number; degraded: number; failure: number; total: number };
          intervals: Array<{
            timestamp: string;
            uptime: number | null;
            successCount: number;
            degradedCount: number;
            failureCount: number;
            totalCount: number;
            incidents?: Array<{
              id: string;
              title: string;
              severity: "minor" | "major" | "critical";
            }>;
          }>;
          daily: Array<{
            date: string;
            uptime: number | null;
            successCount: number;
            degradedCount: number;
            failureCount: number;
            totalCount: number;
            incidents?: Array<{
              id: string;
              title: string;
              severity: "minor" | "major" | "critical";
            }>;
          }>;
        };
        error?: { code: string; message: string };
      } = await apiGet(
        `/api/v1/analytics/uptime${query ? `?${query}` : ""}`,
        { organizationId }
      );

      const data = raw.data;
      if (!raw.success || !data) {
        throw new Error(raw.error?.message || "Failed to load uptime analytics");
      }

      // Use intervals if available (new API), fallback to daily (legacy)
      const intervals = data.intervals ?? data.daily;

      return {
        monitorId: params?.monitorId,
        days: data.days,
        granularity: data.granularity ?? "day",
        data: intervals.map((interval) => {
          // Handle both 'intervals' (has timestamp) and 'daily' (has date) formats
          const rawTimestamp = interval.timestamp ?? (interval as any).date;
          let timestampStr: string;
          if (typeof rawTimestamp === "string") {
            timestampStr = rawTimestamp;
          } else if (rawTimestamp && typeof rawTimestamp === "object" && "toISOString" in rawTimestamp) {
            timestampStr = (rawTimestamp as Date).toISOString();
          } else {
            timestampStr = String(rawTimestamp);
          }

          return {
            date: timestampStr.split("T")[0],
            timestamp: timestampStr,
            uptimePercentage: interval.uptime,
            successCount: interval.successCount,
            degradedCount: interval.degradedCount,
            failureCount: interval.failureCount,
            totalCount: interval.totalCount,
            incidents: interval.incidents,
          };
        }),
        overall: {
          uptimePercentage: data.uptimePercentage,
          totalChecks: data.totals.total,
          successfulChecks: data.totals.success,
          failedChecks: data.totals.failure,
        },
      } satisfies UptimeAnalytics;
    },

    responseTimes: async (monitorId: string, hours?: number, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      searchParams.set("monitorId", monitorId);
      if (hours) searchParams.set("hours", hours.toString());

      const raw: {
        success: boolean;
        data?: {
          monitorId: string;
          hours: number;
          granularity: "raw" | "hourly" | "4hour";
          summary: {
            p50: number | null;
            p75: number | null;
            p90: number | null;
            p95: number | null;
            p99: number | null;
            avg: number | null;
            min: number | null;
            max: number | null;
          };
          points: Array<{
            timestamp: string;
            avg: number | null;
            min: number | null;
            max: number | null;
            p50: number | null;
            p90: number | null;
            p99: number | null;
            count: number;
          }>;
        };
        error?: { code: string; message: string };
      } = await apiGet(
        `/api/v1/analytics/response-times?${searchParams.toString()}`,
        { organizationId }
      );

      const data = raw.data;
      if (!raw.success || !data) {
        throw new Error(raw.error?.message || "Failed to load response time analytics");
      }

      return {
        monitorId,
        hours: data.hours,
        granularity: data.granularity,
        summary: data.summary,
        data: data.points.map((p) => ({
          timestamp: typeof p.timestamp === 'string' ? p.timestamp : new Date(p.timestamp).toISOString(),
          avg: p.avg,
          min: p.min,
          max: p.max,
          p50: p.p50,
          p90: p.p90,
          p99: p.p99,
          count: p.count,
        })),
      } satisfies ResponseTimeAnalytics;
    },

    pagespeed: async (monitorId: string, days?: number, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      searchParams.set("monitorId", monitorId);
      if (days) searchParams.set("days", days.toString());

      const raw = await apiGet<{
        monitorId: string;
        days: number;
        totalChecks: number;
        latest: {
          performance?: number;
          accessibility?: number;
          bestPractices?: number;
          seo?: number;
        } | null;
        averages: {
          performance: number | null;
          accessibility: number | null;
          bestPractices: number | null;
          seo: number | null;
        };
        history: Array<{
          timestamp: string;
          scores: {
            performance?: number;
            accessibility?: number;
            bestPractices?: number;
            seo?: number;
          };
        }>;
      }, { error?: { code: string; message: string } }>(
        `/api/v1/analytics/pagespeed?${searchParams.toString()}`,
        { organizationId }
      );

      if (!raw.success || !raw.data) {
        const message = !raw.success ? raw.error?.message : undefined;
        throw new Error(message || "Failed to load PageSpeed analytics");
      }
      return raw.data;
    },

    webVitals: async (monitorId: string, days?: number, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      searchParams.set("monitorId", monitorId);
      if (days) searchParams.set("days", days.toString());

      const raw = await apiGet<{
        monitorId: string;
        days: number;
        totalChecks: number;
        latest: {
          lcp?: number;
          fid?: number;
          inp?: number;
          cls?: number;
          fcp?: number;
          ttfb?: number;
          si?: number;
          tbt?: number;
        } | null;
        averages: {
          lcp: number | null;
          fid: number | null;
          inp: number | null;
          cls: number | null;
          fcp: number | null;
          ttfb: number | null;
          si: number | null;
          tbt: number | null;
        };
        assessment: {
          lcp: "good" | "needs-improvement" | "poor" | "unknown";
          fid: "good" | "needs-improvement" | "poor" | "unknown";
          inp: "good" | "needs-improvement" | "poor" | "unknown";
          cls: "good" | "needs-improvement" | "poor" | "unknown";
          fcp: "good" | "needs-improvement" | "poor" | "unknown";
          ttfb: "good" | "needs-improvement" | "poor" | "unknown";
        };
        history: Array<{
          timestamp: string;
          vitals: {
            lcp?: number;
            fid?: number;
            inp?: number;
            cls?: number;
            fcp?: number;
            ttfb?: number;
            si?: number;
            tbt?: number;
          };
        }>;
      }, { error?: { code: string; message: string } }>(
        `/api/v1/analytics/web-vitals?${searchParams.toString()}`,
        { organizationId }
      );

      if (!raw.success || !raw.data) {
        const message = !raw.success ? raw.error?.message : undefined;
        throw new Error(message || "Failed to load Web Vitals analytics");
      }
      return raw.data;
    },
  },

  maintenanceWindows: {
    list: (status?: string, organizationId?: string) => {
      const query = status ? `?status=${status}` : "";
      return unwrap(apiGet<MaintenanceWindow[]>(`/api/v1/maintenance-windows${query}`, { organizationId }));
    },

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<MaintenanceWindow>(`/api/v1/maintenance-windows/${id}`, { organizationId })),

    create: (data: CreateMaintenanceWindowInput, organizationId?: string) =>
      unwrap(apiPost<MaintenanceWindow>("/api/v1/maintenance-windows", data, { organizationId })),

    update: (id: string, data: UpdateMaintenanceWindowInput, organizationId?: string) =>
      unwrap(apiPatch<MaintenanceWindow>(`/api/v1/maintenance-windows/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ id: string }>(`/api/v1/maintenance-windows/${id}`, { organizationId })),

    endEarly: (id: string, organizationId?: string) =>
      unwrap(apiPost<MaintenanceWindow>(`/api/v1/maintenance-windows/${id}/end-early`, {}, { organizationId })),

    getActiveMonitors: (organizationId?: string) =>
      unwrap(apiGet<{ monitorIds: string[]; activeWindows: number }>(
        "/api/v1/maintenance-windows/active/monitors",
        { organizationId }
      )),
  },

  auditLogs: {
    list: (params?: AuditLogsListParams, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.action) searchParams.set("action", params.action);
      if (params?.userId) searchParams.set("userId", params.userId);
      if (params?.resourceType) searchParams.set("resourceType", params.resourceType);
      if (params?.resourceId) searchParams.set("resourceId", params.resourceId);
      if (params?.from) searchParams.set("from", params.from);
      if (params?.to) searchParams.set("to", params.to);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      return apiGet<AuditLogsListResponse>(
        `/api/v1/audit-logs${query ? `?${query}` : ""}`,
        { organizationId }
      ).then((res) => {
        if (!res.success) throw new Error(res.error?.message || "Unknown error");
        return res;
      });
    },

    export: (format: "json" | "csv", params?: { from?: string; to?: string }, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      searchParams.set("format", format);
      if (params?.from) searchParams.set("from", params.from);
      if (params?.to) searchParams.set("to", params.to);
      if (organizationId) searchParams.set("organizationId", organizationId);
      const query = searchParams.toString();
      // Return URL for download instead of fetching content
      // Use consistent URL construction that handles BASE_INCLUDES_API case
      const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
      const API_URL = RAW_API_URL.replace(/\/$/, "");
      const BASE_INCLUDES_API = API_URL.endsWith("/api");
      const endpoint = "/api/v1/audit-logs/export";
      const normalizedEndpoint = BASE_INCLUDES_API ? endpoint.replace(/^\/api/, "") : endpoint;
      return `${API_URL}${normalizedEndpoint}?${query}`;
    },

    actions: (organizationId?: string) =>
      unwrap(apiGet<AuditActionCount[]>("/api/v1/audit-logs/actions", { organizationId })),

    users: (organizationId?: string) =>
      unwrap(apiGet<AuditUserCount[]>("/api/v1/audit-logs/users", { organizationId })),
  },

  slo: {
    list: (organizationId?: string) =>
      unwrap(apiGet<SloTarget[]>("/api/v1/slo", { organizationId })),

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<SloTarget>(`/api/v1/slo/${id}`, { organizationId })),

    create: (data: { name: string; monitorId: string; targetPercentage: number; window?: string; gracePeriodMinutes?: number; alertThresholds?: number[] }, organizationId?: string) =>
      unwrap(apiPost<SloTarget>("/api/v1/slo", data, { organizationId })),

    update: (id: string, data: Partial<{ name: string; monitorId: string; targetPercentage: number; window: string; gracePeriodMinutes: number; alertThresholds: number[]; active: boolean }>, organizationId?: string) =>
      unwrap(apiPatch<SloTarget>(`/api/v1/slo/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/slo/${id}`, { organizationId })),

    getBudgets: (id: string, params?: { limit?: number; offset?: number }, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      return unwrap(apiGet<ErrorBudget[]>(`/api/v1/slo/${id}/budgets${query ? `?${query}` : ""}`, { organizationId }));
    },

    dashboard: (organizationId?: string) =>
      unwrap(apiGet<SloDashboardSummary>("/api/v1/slo/summary/dashboard", { organizationId })),
  },

  reports: {
    list: async (params?: { type?: string; status?: string; limit?: number; offset?: number }, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.type) searchParams.set("type", params.type);
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      const res = await apiGet<SlaReport[], { meta: PaginationMeta }>(
        `/api/v1/reports${query ? `?${query}` : ""}`,
        { organizationId }
      );
      if (!res.success) {
        throw new Error(res.error?.message || "Failed to load reports");
      }
      return {
        data: res.data ?? [],
        meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 20, offset: 0, hasMore: false },
      };
    },

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<SlaReport>(`/api/v1/reports/${id}`, { organizationId })),

    generate: (data: { reportType: string; periodStart: string; periodEnd: string; monitorIds?: string[]; statusPageIds?: string[]; includeAllMonitors?: boolean; settingsId?: string }, organizationId?: string) =>
      unwrap(apiPost<SlaReport>("/api/v1/reports/generate", data, { organizationId })),

    settings: {
      list: async (params?: PaginationParams, organizationId?: string) => {
        const searchParams = new URLSearchParams();
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        const query = searchParams.toString();
        const res = await apiGet<ReportSettings[], { meta: PaginationMeta }>(
          `/api/v1/reports/settings${query ? `?${query}` : ""}`,
          { organizationId }
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load report settings");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
        };
      },

      create: (data: Partial<ReportSettings>, organizationId?: string) =>
        unwrap(apiPost<ReportSettings>("/api/v1/reports/settings", data, { organizationId })),

      update: (id: string, data: Partial<ReportSettings>, organizationId?: string) =>
        unwrap(apiPatch<ReportSettings>(`/api/v1/reports/settings/${id}`, data, { organizationId })),

      delete: (id: string, organizationId?: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/reports/settings/${id}`, { organizationId })),
    },
  },

  probes: {
    list: async (params?: PaginationParams, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      const res = await apiGet<Probe[], { meta: PaginationMeta }>(
        `/api/v1/probes${query ? `?${query}` : ""}`,
        { organizationId }
      );
      if (!res.success) {
        throw new Error(res.error?.message || "Failed to load probes");
      }
      return {
        data: res.data ?? [],
        meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 100, offset: 0, hasMore: false },
      };
    },

    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<Probe>(`/api/v1/probes/${id}`, { organizationId })),

    create: (data: { name: string; description?: string; region: string }, organizationId?: string) =>
      unwrap(apiPost<Probe & { authToken: string; installCommand: string }>("/api/v1/probes", data, { organizationId })),

    update: (id: string, data: Partial<{ name: string; description: string; region: string; status: string }>, organizationId?: string) =>
      unwrap(apiPatch<Probe>(`/api/v1/probes/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/probes/${id}`, { organizationId })),

    regenerateToken: (id: string, organizationId?: string) =>
      unwrap(
        apiPost<Probe & { authToken: string; installCommand: string }>(
          `/api/v1/probes/${id}/regenerate-token`,
          {},
          { organizationId }
        )
      ),

    assign: (id: string, data: { monitorId: string; priority?: number; exclusive?: boolean }, organizationId?: string) =>
      unwrap(apiPost<{ id: string }>(`/api/v1/probes/${id}/assign`, data, { organizationId })),

    unassign: (id: string, monitorId: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/probes/${id}/assign/${monitorId}`, { organizationId })),

    getStats: (id: string, hours?: number, organizationId?: string) => {
      const query = hours ? `?hours=${hours}` : "";
      return unwrap(apiGet<ProbeStats>(`/api/v1/probes/${id}/stats${query}`, { organizationId }));
    },
  },

  regions: {
    list: () =>
      unwrap(apiGet<{ regions: string[]; default: string; isEmpty: boolean }>("/api/v1/regions")),
  },

  deployments: {
    webhooks: {
      list: (organizationId?: string) =>
        unwrap(apiGet<DeploymentWebhook[]>("/api/v1/deployments/webhooks", { organizationId })),

      get: (id: string, organizationId?: string) =>
        unwrap(apiGet<DeploymentWebhook>(`/api/v1/deployments/webhooks/${id}`, { organizationId })),

      create: (data: { name: string; description?: string; active?: boolean }, organizationId?: string) =>
        unwrap(apiPost<DeploymentWebhook & { secret: string; webhookUrl: string }>("/api/v1/deployments/webhooks", data, { organizationId })),

      regenerateSecret: (id: string, organizationId?: string) =>
        unwrap(apiPost<DeploymentWebhook & { secret: string }>(`/api/v1/deployments/webhooks/${id}/regenerate-secret`, {}, { organizationId })),

      delete: (id: string, organizationId?: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/deployments/webhooks/${id}`, { organizationId })),
    },

    events: {
      list: async (params?: { service?: string; environment?: string; status?: string; limit?: number; offset?: number }, organizationId?: string) => {
        const searchParams = new URLSearchParams();
        if (params?.service) searchParams.set("service", params.service);
        if (params?.environment) searchParams.set("environment", params.environment);
        if (params?.status) searchParams.set("status", params.status);
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());
        const query = searchParams.toString();
        const res = await apiGet<DeploymentEvent[], { meta: PaginationMeta }>(
          `/api/v1/deployments/events${query ? `?${query}` : ""}`,
          { organizationId }
        );
        if (!res.success) {
          throw new Error(res.error?.message || "Failed to load deployment events");
        }
        return {
          data: res.data ?? [],
          meta: (res as { meta?: PaginationMeta }).meta ?? { total: 0, limit: 50, offset: 0, hasMore: false },
        };
      },

      get: (id: string, organizationId?: string) =>
        unwrap(apiGet<DeploymentEvent>(`/api/v1/deployments/events/${id}`, { organizationId })),

      create: (data: { service: string; version?: string; environment?: string; status: string; deployedAt: string; deployedBy?: string; commitSha?: string; commitMessage?: string; branch?: string; affectedMonitors?: string[]; metadata?: Record<string, unknown>; allowDuringIncident?: boolean }, organizationId?: string) =>
        unwrap(apiPost<DeploymentEvent>("/api/v1/deployments/events", data, { organizationId })),

      linkIncident: (id: string, incidentId: string, notes?: string, organizationId?: string) =>
        unwrap(apiPost<{ id: string }>(`/api/v1/deployments/events/${id}/link-incident`, { incidentId, notes }, { organizationId })),

      unlinkIncident: (id: string, incidentId: string, organizationId?: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/deployments/events/${id}/link-incident/${incidentId}`, { organizationId })),

      rollback: (id: string, organizationId?: string) =>
        unwrap(apiPost<DeploymentEvent>(`/api/v1/deployments/events/${id}/rollback`, {}, { organizationId })),
    },

    timeline: (hours?: number, organizationId?: string) => {
      const query = hours ? `?hours=${hours}` : "";
      return unwrap(apiGet<Array<{ type: "deployment" | "incident"; timestamp: string; data: unknown }>>(`/api/v1/deployments/timeline${query}`, { organizationId }));
    },

    byIncident: (incidentId: string, hours?: number, organizationId?: string) => {
      const query = hours ? `?hours=${hours}` : "";
      return unwrap(apiGet<DeploymentEvent[]>(`/api/v1/deployments/incident/${incidentId}${query}`, { organizationId }));
    },

    stats: (days?: number, organizationId?: string) => {
      const query = days ? `?days=${days}` : "";
      return unwrap(apiGet<DeploymentStats>(`/api/v1/deployments/stats${query}`, { organizationId }));
    },
  },

  escalations: {
    list: (organizationId?: string) =>
      unwrap(apiGet<EscalationPolicy[]>("/api/v1/escalations", { organizationId })),
    get: (id: string, organizationId?: string) =>
      unwrap(apiGet<EscalationPolicy>(`/api/v1/escalations/${id}`, { organizationId })),
    create: (data: Partial<EscalationPolicy> & { steps: Array<Omit<EscalationStep, "id" | "policyId">> }, organizationId?: string) =>
      unwrap(apiPost<EscalationPolicy>("/api/v1/escalations", data, { organizationId })),
    update: (id: string, data: Partial<EscalationPolicy> & { steps?: Array<Omit<EscalationStep, "id" | "policyId">> }, organizationId?: string) =>
      unwrap(apiPatch<EscalationPolicy>(`/api/v1/escalations/${id}`, data, { organizationId })),
    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/escalations/${id}`, { organizationId })),
  },

  oncall: {
    listRotations: (organizationId?: string) =>
      unwrap(apiGet<OncallRotation[]>("/api/v1/oncall/rotations", { organizationId })),
    createRotation: (data: Partial<OncallRotation>, organizationId?: string) =>
      unwrap(apiPost<OncallRotation>("/api/v1/oncall/rotations", data, { organizationId })),
    updateRotation: (id: string, data: Partial<OncallRotation>, organizationId?: string) =>
      unwrap(apiPatch<OncallRotation>(`/api/v1/oncall/rotations/${id}`, data, { organizationId })),
    deleteRotation: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/oncall/rotations/${id}`, { organizationId })),
    createOverride: (rotationId: string, data: { userId: string; startAt: string; endAt: string; reason?: string }, organizationId?: string) =>
      unwrap(apiPost(`/api/v1/oncall/rotations/${rotationId}/overrides`, data, { organizationId })),
    coverage: (rotationId: string, organizationId?: string) =>
      unwrap(apiGet<{ gaps: Array<{ start: string; end: string; reason: string }>; hasGaps: boolean }>(`/api/v1/oncall/rotations/${rotationId}/coverage`, { organizationId })),
    calendar: (rotationId: string, days?: number, organizationId?: string) => {
      const query = days ? `?days=${days}` : "";
      return unwrap(apiGet<{ schedule: Array<{ userId: string; start: string; end: string }>; overrides: any[] }>(`/api/v1/oncall/rotations/${rotationId}/calendar${query}`, { organizationId }));
    },
    handoff: (rotationId: string, organizationId?: string) =>
      unwrap(apiPost<{ notified: boolean; channels: string[] }>(`/api/v1/oncall/rotations/${rotationId}/handoff`, {}, { organizationId })),
    getCurrentForRotation: (rotationId: string, organizationId?: string) =>
      unwrap(apiGet<{
        currentUserId: string | null;
        isOverride: boolean;
        shiftStart: string | null;
        shiftEnd: string | null;
        overrideReason?: string;
        reason?: string;
      }>(`/api/v1/oncall/rotations/${rotationId}/current`, { organizationId })),
    getCurrentAll: (organizationId?: string) =>
      unwrap(apiGet<Array<{
        rotationId: string;
        rotationName: string;
        currentUserId: string;
        isOverride: boolean;
        shiftStart: string;
        shiftEnd: string;
      }>>("/api/v1/oncall/current", { organizationId })),
  },

  events: {
    list: (params?: EventsListParams, organizationId?: string) => {
      const searchParams = new URLSearchParams();
      if (params?.types?.length) searchParams.set("types", params.types.join(","));
      if (params?.status?.length) searchParams.set("status", params.status.join(","));
      if (params?.severity?.length) searchParams.set("severity", params.severity.join(","));
      if (params?.monitors?.length) searchParams.set("monitors", params.monitors.join(","));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.startDate) searchParams.set("startDate", params.startDate);
      if (params?.endDate) searchParams.set("endDate", params.endDate);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      return unwrap(apiGet<EventsListResponse>(`/api/v1/events${query ? `?${query}` : ""}`, { organizationId }));
    },

    get: (type: EventType, id: string, organizationId?: string) =>
      unwrap(apiGet<UnifiedEvent>(`/api/v1/events/${type}/${id}`, { organizationId })),

    subscribe: (type: EventType, id: string, organizationId?: string) =>
      unwrap(apiPost<{ message: string }>(`/api/v1/events/${type}/${id}/subscribe`, {}, { organizationId })),

    unsubscribe: (type: EventType, id: string, organizationId?: string) =>
      unwrap(apiDelete<{ message: string }>(`/api/v1/events/${type}/${id}/subscribe`, { organizationId })),

    subscriptions: (organizationId?: string) =>
      unwrap(apiGet<EventSubscription[]>("/api/v1/events/subscriptions", { organizationId })),

    export: (type: EventType, id: string, format: "ics" | "json", organizationId?: string) => {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
      return `${baseUrl}/v1/events/${type}/${id}/export?format=${format}`;
    },
  },

  monitorDependencies: {
    list: (organizationId?: string) =>
      unwrap(apiGet<MonitorDependency[]>("/api/v1/monitor-dependencies", { organizationId })),

    getForMonitor: (monitorId: string, organizationId?: string) =>
      unwrap(
        apiGet<{ upstream: MonitorDependencyWithMonitor[]; downstream: MonitorDependencyWithMonitor[] }>(
          `/api/v1/monitor-dependencies/monitor/${monitorId}`,
          { organizationId }
        )
      ),

    create: (
      data: { downstreamMonitorId: string; upstreamMonitorId: string; description?: string },
      organizationId?: string
    ) =>
      unwrap(apiPost<MonitorDependency>("/api/v1/monitor-dependencies", data, { organizationId })),

    bulkCreate: (
      data: { downstreamMonitorId: string; upstreamMonitorIds: string[]; description?: string },
      organizationId?: string
    ) =>
      unwrap(apiPost<MonitorDependency[]>("/api/v1/monitor-dependencies/bulk", data, { organizationId })),

    update: (id: string, data: { description?: string }, organizationId?: string) =>
      unwrap(apiPatch<MonitorDependency>(`/api/v1/monitor-dependencies/${id}`, data, { organizationId })),

    delete: (id: string, organizationId?: string) =>
      unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/monitor-dependencies/${id}`, { organizationId })),
  },

  sso: {
    providers: {
      list: (orgId: string) =>
        unwrap(apiGet<SSOProvider[]>(`/api/v1/sso/organizations/${orgId}/providers`)),

      create: (orgId: string, data: CreateSSOProviderInput) =>
        unwrap(apiPost<SSOProvider>(`/api/v1/sso/organizations/${orgId}/providers`, data)),

      update: (orgId: string, providerId: string, data: UpdateSSOProviderInput) =>
        unwrap(apiPatch<SSOProvider>(`/api/v1/sso/organizations/${orgId}/providers/${providerId}`, data)),

      delete: (orgId: string, providerId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/sso/organizations/${orgId}/providers/${providerId}`)),

      test: (orgId: string, providerId: string) =>
        unwrap(apiPost<{ status: string; message: string; issuer?: string }>(
          `/api/v1/sso/organizations/${orgId}/providers/${providerId}/test`,
          {}
        )),
    },

    domains: {
      list: (orgId: string) =>
        unwrap(apiGet<OrganizationDomain[]>(`/api/v1/sso/organizations/${orgId}/domains`)),

      add: (orgId: string, data: AddDomainInput) =>
        unwrap(apiPost<OrganizationDomain & {
          verificationInstructions: {
            type: string;
            record: string;
            name: string;
            value: string;
            ttl: number;
          };
        }>(`/api/v1/sso/organizations/${orgId}/domains`, data)),

      update: (orgId: string, domainId: string, data: UpdateDomainInput) =>
        unwrap(apiPatch<OrganizationDomain>(`/api/v1/sso/organizations/${orgId}/domains/${domainId}`, data)),

      verify: (orgId: string, domainId: string) =>
        unwrap(apiPost<DomainVerificationResult>(
          `/api/v1/sso/organizations/${orgId}/domains/${domainId}/verify`,
          {}
        )),

      delete: (orgId: string, domainId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(`/api/v1/sso/organizations/${orgId}/domains/${domainId}`)),
    },

    resourceScopes: {
      list: (orgId: string, memberId: string) =>
        unwrap(apiGet<ResourceScope[]>(`/api/v1/sso/organizations/${orgId}/members/${memberId}/scopes`)),

      create: (orgId: string, memberId: string, data: CreateResourceScopeInput) =>
        unwrap(apiPost<ResourceScope>(
          `/api/v1/sso/organizations/${orgId}/members/${memberId}/scopes`,
          data
        )),

      delete: (orgId: string, memberId: string, scopeId: string) =>
        unwrap(apiDelete<{ deleted: boolean }>(
          `/api/v1/sso/organizations/${orgId}/members/${memberId}/scopes/${scopeId}`
        )),
    },
  },

  // System (self-hosted mode)
  system: {
    getStatus: () =>
      unwrap(apiGet<SystemStatus>("/api/v1/system/status")),

    setup: (data: SystemSetupInput) =>
      unwrap(apiPost<{ userId: string; organizationId: string; message: string }>(
        "/api/v1/system/setup",
        data
      )),

    getSettings: () =>
      unwrap(apiGet<SystemSettings>("/api/v1/system/settings")),

    updateSettings: (data: { signupMode?: string }) =>
      unwrap(apiPatch<SystemSettings>("/api/v1/system/settings", data)),
  },

  // Pending Approvals (self-hosted mode)
  pendingApprovals: {
    list: (status?: string) => {
      const query = status ? `?status=${status}` : "";
      return unwrap(apiGet<PendingApproval[]>(`/api/v1/pending-approvals${query}`));
    },

    getMyStatus: () =>
      unwrap(apiGet<PendingApprovalStatus>("/api/v1/pending-approvals/me")),

    approve: (id: string, data?: { role?: string; notes?: string }) =>
      unwrap(apiPost<{ message: string; userId: string; role: string }>(
        `/api/v1/pending-approvals/${id}/approve`,
        data || {}
      )),

    reject: (id: string, data?: { notes?: string }) =>
      unwrap(apiPost<{ message: string; userId: string }>(
        `/api/v1/pending-approvals/${id}/reject`,
        data || {}
      )),
  },
};

export interface MonitorDependency {
  id: string;
  downstreamMonitorId: string;
  upstreamMonitorId: string;
  description: string | null;
  createdAt: string;
}

export interface MonitorDependencyWithMonitor extends MonitorDependency {
  monitor: {
    id: string;
    name: string;
    type: string;
    status: string;
  } | null;
}

export type SSOProviderType = "oidc" | "saml";

export type MemberRole = "owner" | "admin" | "member" | "viewer";

// Group to Role Mapping types
export interface GroupRoleMapping {
  group: string;
  role: MemberRole;
}

export interface GroupRoleMappingConfig {
  enabled: boolean;
  groupsClaim?: string;
  mappings: GroupRoleMapping[];
  defaultRole?: MemberRole;
  syncOnLogin?: boolean;
}

export interface SSOProvider {
  id: string;
  providerId: string;
  name: string;
  type: SSOProviderType;
  issuer: string | null;
  domain: string | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  hasOidcConfig?: boolean;
  hasSamlConfig?: boolean;
  groupRoleMapping?: GroupRoleMappingConfig | null;
}

export interface OIDCConfig {
  clientId: string;
  clientSecret?: string;
  discoveryEndpoint?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  scopes?: string[];
}

export interface CreateSSOProviderInput {
  providerId: string;
  name: string;
  type: SSOProviderType;
  issuer?: string;
  domain?: string;
  oidcConfig?: OIDCConfig;
  samlConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  groupRoleMapping?: GroupRoleMappingConfig;
}

export interface UpdateSSOProviderInput {
  name?: string;
  issuer?: string;
  domain?: string;
  oidcConfig?: OIDCConfig;
  samlConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
  groupRoleMapping?: GroupRoleMappingConfig;
}

export interface OrganizationDomain {
  id: string;
  domain: string;
  verified: boolean;
  verificationToken: string | null;
  verifiedAt: string | null;
  autoJoinEnabled: boolean;
  autoJoinRole: "owner" | "admin" | "member" | "viewer";
  ssoRequired: boolean;
  ssoProvider: {
    id: string;
    name: string;
    type: SSOProviderType;
  } | null;
  createdAt: string;
}

export interface AddDomainInput {
  domain: string;
}

export interface UpdateDomainInput {
  autoJoinEnabled?: boolean;
  autoJoinRole?: "owner" | "admin" | "member" | "viewer";
  ssoProviderId?: string | null;
  ssoRequired?: boolean;
}

export interface DomainVerificationResult {
  verified: boolean;
  message: string;
  verifiedAt?: string;
  expectedRecord?: {
    name: string;
    value: string;
  };
  foundRecords?: string[];
}

export interface ResourceScope {
  id: string;
  resourceType: "monitor" | "status_page" | "incident" | "all";
  resourceId: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  createdAt: string;
}

export interface CreateResourceScopeInput {
  resourceType: "monitor" | "status_page" | "incident" | "all";
  resourceId?: string | null;
  role: "owner" | "admin" | "member" | "viewer";
}

export interface SloTarget {
  id: string;
  organizationId: string;
  monitorId: string;
  name: string;
  targetPercentage: string;
  window: "monthly" | "quarterly" | "annually";
  gracePeriodMinutes: number;
  alertThresholds: string[] | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  monitor?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  currentBudget?: {
    percentRemaining: number;
    percentConsumed: number;
    remainingMinutes: number;
    breached: boolean;
  } | null;
  periodStart?: string;
  periodEnd?: string;
}

export interface ErrorBudget {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  budgetMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  percentRemaining: number;
  percentConsumed: number;
  breached: boolean;
  breachedAt: string | null;
  lastAlertThreshold: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SloDashboardSummary {
  slos: Array<{
    id: string;
    name: string;
    targetPercentage: number;
    window: string;
    monitor: {
      id: string;
      name: string;
      status: string;
    };
    status: "healthy" | "at_risk" | "breached";
    percentRemaining: number;
    percentConsumed: number;
    breachCount: number;
  }>;
  stats: {
    total: number;
    healthy: number;
    atRisk: number;
    breached: number;
    avgBudgetRemaining: number;
  };
}

// ==========================================
// Reports
// ==========================================

export interface ReportSettings {
  id: string;
  organizationId: string;
  name: string;
  reportType: "sla" | "uptime" | "incident" | "executive";
  frequency: "weekly" | "monthly" | "quarterly" | "annually" | "on_demand";
  monitorIds: string[];
  statusPageIds: string[];
  includeAllMonitors: boolean;
  includeCharts: boolean;
  includeIncidents: boolean;
  includeMaintenanceWindows: boolean;
  includeResponseTimes: boolean;
  includeSloStatus: boolean;
  customBranding: Record<string, unknown>;
  recipients: { emails: string[] };
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timezone: string;
  active: boolean;
  nextScheduledAt: string | null;
  lastGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlaReport {
  id: string;
  organizationId: string;
  settingsId: string | null;
  reportType: string;
  status: "pending" | "generating" | "completed" | "failed";
  periodStart: string;
  periodEnd: string;
  generatedBy: string | null;
  includedMonitors: string[];
  includedStatusPages: string[];
  fileUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface Probe {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  region: string;
  status: "pending" | "active" | "inactive" | "disabled";
  version: string | null;
  lastHeartbeatAt: string | null;
  lastIp: string | null;
  metadata: Record<string, unknown>;
  authTokenPrefix: string;
  createdAt: string;
  updatedAt: string;
  assignedMonitorCount?: number;
  assignments?: Array<{
    id: string;
    monitorId: string;
    priority: number;
    exclusive: boolean;
    monitor: {
      id: string;
      name: string;
      type: string;
      status: string;
    };
  }>;
}

export interface ProbeStats {
  jobs: Record<string, number>;
  heartbeats: number;
  avgCpuUsage: number | null;
  avgMemoryUsage: number | null;
  period: {
    hours: number;
    since: string;
  };
}

export interface DeploymentWebhook {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  hasSecret: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string;
}

export interface DeploymentEvent {
  id: string;
  organizationId: string;
  webhookId: string | null;
  externalId: string | null;
  service: string;
  version: string | null;
  environment: string;
  status: "started" | "completed" | "failed" | "rolled_back";
  deployedAt: string;
  deployedBy: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  affectedMonitors: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  webhook?: { id: string; name: string };
  incidentLinks?: Array<{
    id: string;
    incident: {
      id: string;
      title: string;
      severity: string;
      status: string;
    };
  }>;
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
  severityOverrides?: {
    minor?: { ackTimeoutMinutes?: number };
    major?: { ackTimeoutMinutes?: number };
    critical?: { ackTimeoutMinutes?: number };
  };
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
  overrides?: Array<{
    id: string;
    rotationId: string;
    userId: string;
    startAt: string;
    endAt: string;
    reason?: string | null;
  }>;
}

export interface DeploymentStats {
  byStatus: Record<string, number>;
  byEnvironment: Record<string, number>;
  topServices: Array<{ service: string; count: number }>;
  correlations: Record<string, number>;
  period: {
    days: number;
    since: string;
  };
}

export interface CertificateInfo {
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
}

export interface CertificateAdditionalDetails {
  serialNumber?: string;
  fingerprint?: string;
  altNames?: string[] | string;
  protocol?: string;
  cipher?: string;
  chainValid?: boolean | string;
  hostnameValid?: boolean | string;
  chainComplete?: boolean | string;
  ocspStapled?: boolean | string;
  ocspUrl?: string;
  ocspResponder?: string;
  crlStatus?: string;
  caaStatus?: string;
  tlsVersionStatus?: string;
  cipherStatus?: string;
}

export interface CtLogEntry {
  id: string;
  loggedAt?: string;
  notBefore?: string;
  notAfter?: string;
  issuer?: string;
  commonName?: string;
  dnsNames?: string[];
  serialNumber?: string;
  caId?: number;
  source?: string;
}

export interface CertificateTransparencyStatus {
  state: "healthy" | "new" | "unexpected" | "error" | "disabled" | "unknown";
  newCount: number;
  unexpectedCount: number;
  lastChecked?: string | null;
  checkedAt?: string | null; // backward compat for list view
  message?: string | null;
  source?: string;
}

export interface CertificateListItem {
  monitorId: string;
  monitorName: string;
  url: string;
  monitorType: string;
  monitorStatus: string;
  certificateInfo: CertificateInfo | null;
  additionalCertDetails: CertificateAdditionalDetails | null;
  lastChecked: string | null;
  sslConfig: {
    expiryWarningDays?: number;
    expiryErrorDays?: number;
    checkChain?: boolean;
    checkHostname?: boolean;
  } | null;
  ctStatus?: CertificateTransparencyStatus | null;
}

export interface CertificateStats {
  total: number;
  expired: number;
  expiringSoon: number;
  healthy: number;
  unknown: number;
}

export interface CertificateDetail {
  monitor: {
    id: string;
    name: string;
    url: string;
    type: string;
    status: string;
    sslConfig: {
      expiryWarningDays?: number;
      expiryErrorDays?: number;
      checkChain?: boolean;
      checkHostname?: boolean;
    };
  };
  currentCertificate: CertificateInfo | null;
  additionalDetails: CertificateAdditionalDetails | null;
  lastChecked: string | null;
  checkStatus: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  history: Array<{
    checkedAt: string;
    daysUntilExpiry?: number;
    status: string;
    errorCode: string | null;
  }>;
  certificateChanges: Array<{
    changedAt: string;
    previousFingerprint?: string;
    newFingerprint?: string;
    daysUntilExpiry?: number;
  }>;
  ctStatus?: CertificateTransparencyStatus;
  ctRecentCertificates?: CtLogEntry[];
  ctNewCertificates?: CtLogEntry[];
  ctUnexpectedCertificates?: CtLogEntry[];
  ctHistory?: Array<{
    checkedAt: string;
    newCount: number;
    unexpectedCount: number;
    status: CertificateTransparencyStatus["state"];
  }>;
}

export const queryKeys = {
  certificates: {
    all: ["certificates"] as const,
    list: () => [...queryKeys.certificates.all, "list"] as const,
    detail: (monitorId: string) => [...queryKeys.certificates.all, "detail", monitorId] as const,
  },
  monitors: {
    all: ["monitors"] as const,
    lists: () => [...queryKeys.monitors.all, "list"] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.monitors.lists(), filters] as const,
    details: () => [...queryKeys.monitors.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.monitors.details(), id] as const,
    results: (id: string) => [...queryKeys.monitors.detail(id), "results"] as const,
  },
  incidents: {
    all: ["incidents"] as const,
    lists: () => [...queryKeys.incidents.all, "list"] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.incidents.lists(), params] as const,
    details: () => [...queryKeys.incidents.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.incidents.details(), id] as const,
  },
  statusPages: {
    all: ["statusPages"] as const,
    lists: () => [...queryKeys.statusPages.all, "list"] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.statusPages.lists(), params] as const,
    details: () => [...queryKeys.statusPages.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.statusPages.details(), id] as const,
    subscribers: (id: string) => [...queryKeys.statusPages.detail(id), "subscribers"] as const,
    crowdsourced: (id: string) => [...queryKeys.statusPages.detail(id), "crowdsourced"] as const,
  },
  statusPageThemes: {
    all: ["statusPageThemes"] as const,
    list: () => [...queryKeys.statusPageThemes.all, "list"] as const,
    detail: (id: string) => [...queryKeys.statusPageThemes.all, "detail", id] as const,
  },
  badgeTemplates: {
    all: ["badgeTemplates"] as const,
    list: () => [...queryKeys.badgeTemplates.all, "list"] as const,
    detail: (id: string) => [...queryKeys.badgeTemplates.all, "detail", id] as const,
  },
  alerts: {
    channels: {
      all: ["alertChannels"] as const,
      list: (params?: Record<string, unknown>) => [...queryKeys.alerts.channels.all, "list", params] as const,
      detail: (id: string) => [...queryKeys.alerts.channels.all, "detail", id] as const,
    },
    policies: {
      all: ["alertPolicies"] as const,
      list: (params?: Record<string, unknown>) => [...queryKeys.alerts.policies.all, "list", params] as const,
      detail: (id: string) => [...queryKeys.alerts.policies.all, "detail", id] as const,
      monitorCounts: () => [...queryKeys.alerts.policies.all, "monitorCounts"] as const,
    },
    history: {
      all: ["alertHistory"] as const,
      list: (filters?: Record<string, unknown>) => [...queryKeys.alerts.history.all, "list", filters] as const,
    },
  },
  organizations: {
    all: ["organizations"] as const,
    list: () => [...queryKeys.organizations.all, "list"] as const,
    detail: (id: string) => [...queryKeys.organizations.all, "detail", id] as const,
    members: (orgId: string, params?: Record<string, unknown>) => [...queryKeys.organizations.detail(orgId), "members", params] as const,
    invitations: (orgId: string, params?: Record<string, unknown>) => [...queryKeys.organizations.detail(orgId), "invitations", params] as const,
    apiKeys: (orgId: string) => [...queryKeys.organizations.detail(orgId), "apiKeys"] as const,
    integrations: (orgId?: string) => [...queryKeys.organizations.all, "integrations", orgId] as const,
    credentials: (orgId: string) => [...queryKeys.organizations.detail(orgId), "credentials"] as const,
    roles: (orgId: string) => [...queryKeys.organizations.detail(orgId), "roles"] as const,
    role: (orgId: string, roleId: string) => [...queryKeys.organizations.roles(orgId), roleId] as const,
  },
  // User-facing invitations (invitations sent TO the current user)
  userInvitations: {
    all: ["userInvitations"] as const,
    pending: () => [...queryKeys.userInvitations.all, "pending"] as const,
  },
  analytics: {
    dashboard: () => ["analytics", "dashboard"] as const,
    uptime: (params?: { monitorId?: string; days?: number; granularity?: string }) => ["analytics", "uptime", params?.monitorId, params?.days, params?.granularity] as const,
    responseTimes: (monitorId: string, hours?: number) => ["analytics", "responseTimes", monitorId, hours] as const,
    pagespeed: (monitorId: string, days?: number) => ["analytics", "pagespeed", monitorId, days] as const,
    webVitals: (monitorId: string, days?: number) => ["analytics", "webVitals", monitorId, days] as const,
  },
  maintenanceWindows: {
    all: ["maintenanceWindows"] as const,
    lists: () => [...queryKeys.maintenanceWindows.all, "list"] as const,
    list: (status?: string) => [...queryKeys.maintenanceWindows.lists(), { status }] as const,
    details: () => [...queryKeys.maintenanceWindows.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.maintenanceWindows.details(), id] as const,
    activeMonitors: () => [...queryKeys.maintenanceWindows.all, "activeMonitors"] as const,
  },
  auditLogs: {
    all: ["auditLogs"] as const,
    lists: () => [...queryKeys.auditLogs.all, "list"] as const,
    list: (params?: AuditLogsListParams) => [...queryKeys.auditLogs.lists(), params] as const,
    actions: () => [...queryKeys.auditLogs.all, "actions"] as const,
    users: () => [...queryKeys.auditLogs.all, "users"] as const,
  },
  events: {
    all: ["events"] as const,
    lists: () => [...queryKeys.events.all, "list"] as const,
    list: (params?: EventsListParams) => [...queryKeys.events.lists(), params] as const,
    details: () => [...queryKeys.events.all, "detail"] as const,
    detail: (type: EventType, id: string) => [...queryKeys.events.details(), type, id] as const,
    subscriptions: () => [...queryKeys.events.all, "subscriptions"] as const,
  },
  monitorDependencies: {
    all: ["monitorDependencies"] as const,
    list: () => [...queryKeys.monitorDependencies.all, "list"] as const,
    forMonitor: (monitorId: string) => [...queryKeys.monitorDependencies.all, "monitor", monitorId] as const,
  },
  sso: {
    all: ["sso"] as const,
    providers: (orgId: string) => [...queryKeys.sso.all, "providers", orgId] as const,
    domains: (orgId: string) => [...queryKeys.sso.all, "domains", orgId] as const,
    resourceScopes: (orgId: string, memberId: string) => [...queryKeys.sso.all, "scopes", orgId, memberId] as const,
  },
  system: {
    all: ["system"] as const,
    status: () => [...queryKeys.system.all, "status"] as const,
    settings: () => [...queryKeys.system.all, "settings"] as const,
  },
  pendingApprovals: {
    all: ["pendingApprovals"] as const,
    list: (status?: string) => [...queryKeys.pendingApprovals.all, "list", status] as const,
    myStatus: () => [...queryKeys.pendingApprovals.all, "myStatus"] as const,
  },
  regions: {
    all: ["regions"] as const,
    list: () => [...queryKeys.regions.all, "list"] as const,
  },
};
