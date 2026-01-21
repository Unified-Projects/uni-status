/**
 * Uni-status Enterprise Features
 *
 * This package contains enterprise-only features for Uni-status.
 * See LICENSE file for licensing terms.
 *
 * Features included:
 * - Audit Logs
 * - Custom Roles (Fine-grained Role Management)
 * - API Keys
 * - On-Call Management
 * - Escalation Policies
 * - SLO (Service Level Objectives)
 * - Reports & Analytics
 */

// Database schemas
export * from "./database/schema";

// API routes
export * from "./api/routes";

// Worker processors - NOT re-exported from main index to avoid
// pulling in puppeteer and other heavy dependencies.
// Use "@uni-status/enterprise/workers" subpath import instead.

// Shared utilities
export * from "./lib";

// Feature detection
export const ENTERPRISE_VERSION = "0.0.1";

export const ENTERPRISE_FEATURES = {
  AUDIT_LOGS: "audit_logs",
  CUSTOM_ROLES: "custom_roles",
  API_KEYS: "api_keys",
  ONCALL: "oncall",
  ESCALATIONS: "escalations",
  SLO: "slo",
  REPORTS: "reports",
  ANALYTICS: "analytics",
} as const;

export type EnterpriseFeature =
  (typeof ENTERPRISE_FEATURES)[keyof typeof ENTERPRISE_FEATURES];

export function isEnterpriseAvailable(): boolean {
  return true;
}

export function getEnabledFeatures(): EnterpriseFeature[] {
  return Object.values(ENTERPRISE_FEATURES);
}
