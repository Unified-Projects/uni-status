// Re-export roles
export * from "./roles";

// Re-export organization types
export * from "../types/organization";

// Monitoring Regions
export const MONITORING_REGIONS = {
  "us-east": { name: "US East", location: "Virginia", flag: "us" },
  "us-west": { name: "US West", location: "California", flag: "us" },
  "eu-west": { name: "EU West", location: "Ireland", flag: "ie" },
  "eu-central": { name: "EU Central", location: "Frankfurt", flag: "de" },
  "ap-southeast": { name: "Asia Pacific", location: "Singapore", flag: "sg" },
  "ap-northeast": { name: "Asia Northeast", location: "Tokyo", flag: "jp" },
  "sa-east": { name: "South America", location: "Sao Paulo", flag: "br" },
  "au-southeast": { name: "Australia", location: "Sydney", flag: "au" },
} as const;

export type MonitoringRegion = keyof typeof MONITORING_REGIONS;

// Check Intervals (in seconds)
export const CHECK_INTERVALS = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
] as const;

// HTTP Status Codes for validation
export const HTTP_STATUS_CODES = {
  SUCCESS: [200, 201, 202, 203, 204],
  REDIRECT: [301, 302, 303, 307, 308],
  CLIENT_ERROR: [400, 401, 403, 404, 405, 408, 429],
  SERVER_ERROR: [500, 501, 502, 503, 504],
} as const;

// Default timeouts (in milliseconds)
export const TIMEOUTS = {
  CHECK_DEFAULT: 30000,
  CHECK_MIN: 1000,
  CHECK_MAX: 60000,
  DNS_LOOKUP: 5000,
  TCP_CONNECT: 10000,
  TLS_HANDSHAKE: 10000,
} as const;

// Data Retention (in days)
export const DATA_RETENTION = {
  CHECK_RESULTS: 45,
  AUDIT_LOGS: 365,
  INCIDENT_HISTORY: -1, // forever
  HOURLY_AGGREGATES: -1, // forever
  DAILY_AGGREGATES: -1, // forever
} as const;

// Plan Limits
/**
 * @deprecated Use ORG_TYPE_LIMITS instead.
 * This is kept for backward compatibility during migration.
 */
export const PLAN_LIMITS = {
  free: {
    monitors: 5,
    statusPages: 1,
    alertChannels: 2,
    teamMembers: 1,
    checkInterval: 300, // 5 minutes minimum
    dataRetention: 7,
    regions: 1,
  },
  pro: {
    monitors: 50,
    statusPages: 5,
    alertChannels: 10,
    teamMembers: 10,
    checkInterval: 60, // 1 minute minimum
    dataRetention: 45,
    regions: 3,
  },
  enterprise: {
    monitors: -1, // unlimited
    statusPages: -1,
    alertChannels: -1,
    teamMembers: -1,
    checkInterval: 30,
    dataRetention: 365,
    regions: -1,
  },
} as const;

import type { OrganizationType, OrganizationLimits } from "../types/organization";

/**
 * Organization type limits.
 *
 * Defines resource limits for each organization type:
 * - SELF_HOSTED: Unlimited everything, no enterprise features
 * - SELF_HOSTED_ENTERPRISE: Unlimited everything + enterprise features
 * - FREE: Limited resources for hosted free tier
 * - PROFESSIONAL: Moderate limits for paid tier
 * - ENTERPRISE: License-defined limits with all enterprise features
 *
 * Note: These limits only apply to hosted mode. Self-hosted mode
 * always gets unlimited resources (enterprise features are license-gated).
 */
export const ORG_TYPE_LIMITS: Record<OrganizationType, OrganizationLimits> = {
  SELF_HOSTED: {
    monitors: -1,
    statusPages: -1,
    teamMembers: -1,
    minCheckInterval: 30,
    dataRetention: -1,
    enterpriseFeatures: false,
    regions: -1,
    alertChannels: -1,
  },
  SELF_HOSTED_ENTERPRISE: {
    monitors: -1,
    statusPages: -1,
    teamMembers: -1,
    minCheckInterval: 30,
    dataRetention: -1,
    enterpriseFeatures: true,
    regions: -1,
    alertChannels: -1,
  },
  FREE: {
    monitors: 10,
    statusPages: 2,
    teamMembers: -1, // Unlimited, but user can only be in ONE free org
    minCheckInterval: 600, // 10 minutes
    dataRetention: 14,
    enterpriseFeatures: false,
    regions: 1,
    alertChannels: 3,
  },
  PROFESSIONAL: {
    monitors: 50, // Base amount, can be extended via license entitlements
    statusPages: 10,
    teamMembers: 5,
    minCheckInterval: 60, // 1 minute
    dataRetention: 90,
    enterpriseFeatures: false, // Basic ACL only, no custom roles
    regions: 3,
    alertChannels: 10,
  },
  ENTERPRISE: {
    // These are defaults; actual limits come from license entitlements
    monitors: -1,
    statusPages: -1,
    teamMembers: -1,
    minCheckInterval: 30,
    dataRetention: 365,
    enterpriseFeatures: true,
    regions: -1,
    alertChannels: -1,
  },
} as const;

// Status Page Themes
export const STATUS_PAGE_THEMES = {
  default: {
    name: "Default",
    primaryColor: "#10b981",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
  },
  dark: {
    name: "Dark",
    primaryColor: "#10b981",
    backgroundColor: "#111827",
    textColor: "#f9fafb",
  },
  github: {
    name: "GitHub",
    primaryColor: "#238636",
    backgroundColor: "#0d1117",
    textColor: "#c9d1d9",
  },
  dracula: {
    name: "Dracula",
    primaryColor: "#bd93f9",
    backgroundColor: "#282a36",
    textColor: "#f8f8f2",
  },
} as const;

// Alert Severity Colors
export const SEVERITY_COLORS = {
  minor: { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
  major: { bg: "#fed7aa", text: "#9a3412", border: "#f97316" },
  critical: { bg: "#fecaca", text: "#991b1b", border: "#ef4444" },
} as const;

// Monitor Status Colors
export const STATUS_COLORS = {
  active: { bg: "#d1fae5", text: "#065f46", border: "#10b981" },
  degraded: { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
  down: { bg: "#fecaca", text: "#991b1b", border: "#ef4444" },
  paused: { bg: "#e5e7eb", text: "#374151", border: "#9ca3af" },
  pending: { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6" },
} as const;

// API Rate Limits
export const RATE_LIMITS = {
  default: { window: 60, max: 100 },
  auth: { window: 60, max: 10 },
  api_key: { window: 60, max: 1000 },
} as const;

// Webhook Event Types
export const WEBHOOK_EVENTS = [
  "monitor.down",
  "monitor.up",
  "monitor.degraded",
  "incident.created",
  "incident.updated",
  "incident.resolved",
  "maintenance.started",
  "maintenance.ended",
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

// Queue Names (BullMQ doesn't allow colons in queue names)
export const QUEUE_NAMES = {
  // Existing monitor queues
  MONITOR_HTTP: "monitor_http",
  MONITOR_DNS: "monitor_dns",
  MONITOR_SSL: "monitor_ssl",
  MONITOR_TCP: "monitor_tcp",
  MONITOR_PING: "monitor_ping",
  // New monitor queues
  MONITOR_HEARTBEAT: "monitor_heartbeat",
  MONITOR_DATABASE_POSTGRES: "monitor_database_postgres",
  MONITOR_DATABASE_MYSQL: "monitor_database_mysql",
  MONITOR_DATABASE_MONGODB: "monitor_database_mongodb",
  MONITOR_DATABASE_REDIS: "monitor_database_redis",
  MONITOR_DATABASE_ELASTICSEARCH: "monitor_database_elasticsearch",
  MONITOR_GRPC: "monitor_grpc",
  MONITOR_WEBSOCKET: "monitor_websocket",
  MONITOR_SMTP: "monitor_smtp",
  MONITOR_IMAP: "monitor_imap",
  MONITOR_POP3: "monitor_pop3",
  MONITOR_SSH: "monitor_ssh",
  MONITOR_LDAP: "monitor_ldap",
  MONITOR_RDP: "monitor_rdp",
  MONITOR_MQTT: "monitor_mqtt",
  MONITOR_AMQP: "monitor_amqp",
  MONITOR_TRACEROUTE: "monitor_traceroute",
  MONITOR_EMAIL_AUTH: "monitor_email_auth",
  MONITOR_PROMETHEUS_BLACKBOX: "monitor_prometheus_blackbox",
  MONITOR_PROMETHEUS_PROMQL: "monitor_prometheus_promql",
  MONITOR_CERTIFICATE_TRANSPARENCY: "monitor_certificate_transparency",
  MONITOR_AGGREGATE: "monitor_aggregate",
  // Notification queues
  NOTIFY_EMAIL: "notify_email",
  NOTIFY_SLACK: "notify_slack",
  NOTIFY_DISCORD: "notify_discord",
  NOTIFY_WEBHOOK: "notify_webhook",
  NOTIFY_TEAMS: "notify_teams",
  NOTIFY_PAGERDUTY: "notify_pagerduty",
  NOTIFY_SMS: "notify_sms",
  NOTIFY_NTFY: "notify_ntfy",
  NOTIFY_GOOGLE_CHAT: "notify_google_chat",
  NOTIFY_IRC: "notify_irc",
  NOTIFY_TWITTER: "notify_twitter",
  NOTIFY_SUBSCRIBER: "notify_subscriber",
  NOTIFY_EVENT_SUBSCRIBER: "notify_event_subscriber",
  NOTIFY_COMPONENT_SUBSCRIBERS: "notify_component_subscribers",
  // Analytics and cleanup
  ANALYTICS_AGGREGATE: "analytics_aggregate",
  ANALYTICS_DAILY_AGGREGATE: "analytics_daily_aggregate",
  CLEANUP_RESULTS: "cleanup_results",
  // Batch 7: Advanced Features
  SLO_CALCULATE: "slo_calculate",
  SLO_ALERT: "slo_alert",
  ALERT_ESCALATION: "alert_escalation",
  DEPLOYMENT_CORRELATE: "deployment_correlate",
  REPORT_GENERATE: "report_generate",
  REPORT_DELIVER: "report_deliver",
  PROBE_JOB_DISPATCH: "probe_job_dispatch",
  PROBE_RESULT_PROCESS: "probe_result_process",
  ALERT_EVALUATE: "alert_evaluate",
  // License management
  LICENSE_VALIDATION: "license_validation",
  GRACE_PERIOD_PROCESS: "grace_period_process",
  ENTITLEMENT_SYNC: "entitlement_sync",
  // Email queue (for license notifications)
  EMAIL: "email",
} as const;

// SSE Channel Prefixes
export const SSE_CHANNELS = {
  MONITOR: "monitor:",
  ORGANIZATION: "org:",
  STATUS_PAGE: "status:",
} as const;

// External Status Provider Configuration
export const EXTERNAL_STATUS_PROVIDERS = {
  aws: {
    name: "Amazon Web Services",
    statusUrl: "https://status.aws.amazon.com/data.json",
    icon: "aws",
    defaultPollInterval: 300, // 5 minutes
  },
  gcp: {
    name: "Google Cloud Platform",
    statusUrl: "https://status.cloud.google.com/incidents.json",
    icon: "gcp",
    defaultPollInterval: 300,
  },
  azure: {
    name: "Microsoft Azure",
    statusUrl: "https://status.azure.com/en-us/status/feed/",
    icon: "azure",
    defaultPollInterval: 300,
  },
  cloudflare: {
    name: "Cloudflare",
    statusUrl: "https://www.cloudflarestatus.com/api/v2/status.json",
    icon: "cloudflare",
    defaultPollInterval: 300,
  },
  okta: {
    name: "Okta",
    statusUrl: "https://status.okta.com/api/v2/status.json",
    icon: "okta",
    defaultPollInterval: 300,
  },
  auth0: {
    name: "Auth0",
    statusUrl: "https://status.auth0.com/api/v2/status.json",
    icon: "auth0",
    defaultPollInterval: 300,
  },
  stripe: {
    name: "Stripe",
    statusUrl: "https://status.stripe.com/api/v2/status.json",
    icon: "stripe",
    defaultPollInterval: 300,
  },
  twilio: {
    name: "Twilio",
    statusUrl: "https://status.twilio.com/api/v2/status.json",
    icon: "twilio",
    defaultPollInterval: 300,
  },
  statuspage_io: {
    name: "Statuspage.io (Generic)",
    statusUrl: "", // User provides base URL
    icon: "statuspage",
    defaultPollInterval: 300,
  },
  custom: {
    name: "Custom",
    statusUrl: "", // User provides URL
    icon: "custom",
    defaultPollInterval: 300,
  },
} as const;

// External Status Mapping (provider status -> internal status)
export const EXTERNAL_STATUS_MAPPING = {
  // Statuspage.io standard statuses (used by Cloudflare, Stripe, Okta, etc.)
  statuspage_io: {
    operational: "operational",
    degraded_performance: "degraded",
    partial_outage: "partial_outage",
    major_outage: "major_outage",
    under_maintenance: "maintenance",
  },
  // AWS statuses
  aws: {
    0: "operational", // Service is operating normally
    1: "degraded", // Informational message
    2: "partial_outage", // Service disruption
    3: "major_outage", // Service outage
  },
  // GCP statuses
  gcp: {
    available: "operational",
    information: "degraded",
    disruption: "partial_outage",
    outage: "major_outage",
  },
  // Azure statuses (from RSS feed)
  azure: {
    good: "operational",
    information: "degraded",
    warning: "partial_outage",
    critical: "major_outage",
  },
} as const;

// External Status Colors
export const EXTERNAL_STATUS_COLORS = {
  operational: { bg: "#d1fae5", text: "#065f46", border: "#10b981" },
  degraded: { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
  partial_outage: { bg: "#fed7aa", text: "#9a3412", border: "#f97316" },
  major_outage: { bg: "#fecaca", text: "#991b1b", border: "#ef4444" },
  maintenance: { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6" },
  unknown: { bg: "#e5e7eb", text: "#374151", border: "#9ca3af" },
} as const;

// Impact Severity Thresholds
export const IMPACT_SEVERITY_THRESHOLDS = {
  low: { minMonitors: 1, minRegions: 1, maxScore: 25 },
  medium: { minMonitors: 2, minRegions: 1, maxScore: 50 },
  high: { minMonitors: 5, minRegions: 2, maxScore: 75 },
  critical: { minMonitors: 10, minRegions: 3, maxScore: 100 },
} as const;

// Badge Default Colors
export const BADGE_DEFAULT_COLORS = {
  operational: "#22c55e", // Green
  degraded: "#f59e0b", // Amber
  partialOutage: "#f97316", // Orange
  majorOutage: "#ef4444", // Red
  maintenance: "#3b82f6", // Blue
  unknown: "#6b7280", // Gray
  label: "#555555", // Dark gray for label background
} as const;

// Badge Style Configurations
export const BADGE_STYLE_CONFIG = {
  flat: {
    height: 20,
    fontSize: 11,
    padding: 5,
    borderRadius: 3,
  },
  plastic: {
    height: 18,
    fontSize: 11,
    padding: 5,
    borderRadius: 4,
  },
  "flat-square": {
    height: 20,
    fontSize: 11,
    padding: 5,
    borderRadius: 0,
  },
  "for-the-badge": {
    height: 28,
    fontSize: 10,
    padding: 9,
    borderRadius: 3,
    uppercase: true,
  },
  modern: {
    height: 24,
    fontSize: 12,
    padding: 8,
    borderRadius: 12,
    showIcon: true,
  },
} as const;
