/**
 * Enterprise Database Schemas
 *
 * These schemas are part of the Uni-status Enterprise package
 * and require an enterprise license for production use.
 */

// Audit Logs
export * from "./audit";

// On-Call Management
export * from "./oncall";

// Escalation Policies
export * from "./escalation";

// SLO (Service Level Objectives)
export * from "./slo";

// Reports & Analytics
export * from "./reports";

// Custom Roles (Fine-grained Role Management)
export * from "./roles";

// Licensing & Billing
export * from "./licensing";

// Re-export apiKeys from core (table is in core for auth, management endpoints are enterprise)
export { apiKeys, apiKeysRelations, type ApiKey, type NewApiKey } from "@uni-status/database/schema";
