import type { MonitorType } from "./types";

// Types that show response/connection time
export const SHOWS_RESPONSE_TIME: MonitorType[] = [
  "http", "https", "tcp", "ping", "grpc", "websocket",
  "database_postgres", "database_mysql", "database_mongodb",
  "database_redis", "database_elasticsearch",
  "smtp", "imap", "pop3", "ssh", "ldap", "rdp", "mqtt", "amqp",
  "dns", "traceroute",
  "prometheus_blackbox", "prometheus_promql",
];

// Types that show status codes (HTTP only)
export const SHOWS_STATUS_CODE: MonitorType[] = ["http", "https"];

// Types that show certificate info
export const SHOWS_CERTIFICATE: MonitorType[] = ["ssl", "https"];

// Types that DON'T show uptime (only SSL-only)
export const NO_UPTIME: MonitorType[] = ["ssl"];

// Special types with unique displays
export const SHOWS_EMAIL_AUTH: MonitorType[] = ["email_auth"];
export const SHOWS_HEARTBEAT: MonitorType[] = ["heartbeat"];
export const SHOWS_TRACEROUTE: MonitorType[] = ["traceroute"];

// Helper functions
export function showsResponseTime(type: MonitorType): boolean {
  return SHOWS_RESPONSE_TIME.includes(type);
}

export function showsStatusCode(type: MonitorType): boolean {
  return SHOWS_STATUS_CODE.includes(type);
}

export function showsCertificate(type: MonitorType): boolean {
  return SHOWS_CERTIFICATE.includes(type);
}

export function showsUptime(type: MonitorType): boolean {
  return !NO_UPTIME.includes(type);
}

export function showsEmailAuth(type: MonitorType): boolean {
  return SHOWS_EMAIL_AUTH.includes(type);
}

export function showsHeartbeat(type: MonitorType): boolean {
  return SHOWS_HEARTBEAT.includes(type);
}

export function showsTraceroute(type: MonitorType): boolean {
  return SHOWS_TRACEROUTE.includes(type);
}

export function isHttpType(type: MonitorType): boolean {
  return type === "http" || type === "https";
}

export function isSslType(type: MonitorType): boolean {
  return type === "ssl";
}

export function isDatabaseType(type: MonitorType): boolean {
  return type.startsWith("database_");
}

export function isEmailType(type: MonitorType): boolean {
  return type === "smtp" || type === "imap" || type === "pop3";
}

// Get display label for the primary metric based on type
export function getPrimaryMetricLabel(type: MonitorType): string {
  switch (type) {
    case "ssl":
      return "Certificate";
    case "email_auth":
      return "Auth Score";
    case "heartbeat":
      return "Last Ping";
    case "dns":
      return "Query Time";
    case "ping":
      return "Latency";
    case "tcp":
    case "database_postgres":
    case "database_mysql":
    case "database_mongodb":
    case "database_redis":
    case "database_elasticsearch":
    case "ssh":
    case "ldap":
    case "rdp":
    case "mqtt":
    case "amqp":
    case "smtp":
    case "imap":
    case "pop3":
    case "grpc":
    case "websocket":
      return "Connection";
    case "traceroute":
      return "Hops";
    case "prometheus_blackbox":
      return "Probe";
    case "prometheus_promql":
    case "prometheus_remote_write":
      return "SLI";
    default:
      return "Response";
  }
}

// Get the type category for display grouping
export function getTypeCategory(type: MonitorType): string {
  switch (type) {
    case "http":
    case "https":
      return "Web";
    case "ssl":
      return "Certificate";
    case "dns":
      return "DNS";
    case "tcp":
    case "ping":
    case "traceroute":
      return "Network";
    case "heartbeat":
      return "Heartbeat";
    case "database_postgres":
    case "database_mysql":
    case "database_mongodb":
    case "database_redis":
    case "database_elasticsearch":
      return "Database";
    case "grpc":
    case "websocket":
      return "API";
    case "smtp":
    case "imap":
    case "pop3":
    case "email_auth":
      return "Email";
    case "ssh":
    case "ldap":
    case "rdp":
      return "Remote Access";
    case "mqtt":
    case "amqp":
      return "Message Broker";
    case "prometheus_blackbox":
    case "prometheus_promql":
    case "prometheus_remote_write":
      return "Metrics";
    default:
      return "Other";
  }
}
