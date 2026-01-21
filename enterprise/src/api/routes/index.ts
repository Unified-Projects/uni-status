/**
 * Enterprise API Routes Registration
 *
 * This module provides a function to register all enterprise routes
 * with the main API application.
 */

import type { OpenAPIHono } from "@hono/zod-openapi";
import { configureAuthMiddleware } from "../middleware/auth";
import { configureRedis } from "../lib/redis";
import { configureAudit } from "../lib/audit";
import { configureQueues } from "../lib/queues";

export type EnterpriseConfig = {
  auth: {
    requireAuth: (c: any) => any;
    requireOrganization: (c: any) => Promise<string>;
    requireRole: (c: any, roles: Array<"owner" | "admin" | "member" | "viewer">) => Promise<string>;
    requireScope: (c: any, scope: string) => void;
  };
  redis: {
    publishEvent: (channel: string, data: any) => Promise<void>;
  };
  audit: {
    createAuditLog: (c: any, params: any) => Promise<string | null>;
    createAuditLogWithChanges: (c: any, params: any) => Promise<string | null>;
    getAuditUserId: (c: any) => string | null;
  };
  queues: {
    getQueue: (name: string) => any;
  };
};

export function configureEnterprise(config: EnterpriseConfig) {
  configureAuthMiddleware(config.auth);
  configureRedis(config.redis);
  configureAudit(config.audit);
  configureQueues(config.queues);
}

export async function registerEnterpriseRoutes(app: OpenAPIHono) {
  const { auditRoutes } = await import("./audit");
  const { oncallRoutes } = await import("./oncall");
  const { escalationsRoutes } = await import("./escalations");
  const { sloRoutes } = await import("./slo");
  const { reportsRoutes } = await import("./reports");
  const { analyticsRoutes } = await import("./analytics");
  const { keygenWebhooksRoutes } = await import("./keygen-webhooks");
  const { billingRoutes } = await import("./billing");
  const { licenseRoutes } = await import("./license");

  // Protected enterprise routes (require auth middleware)
  app.route("/api/v1/audit-logs", auditRoutes);
  app.route("/api/v1/audit", auditRoutes);
  app.route("/api/v1/oncall", oncallRoutes);
  app.route("/api/v1/escalations", escalationsRoutes);
  app.route("/api/v1/slo", sloRoutes);
  app.route("/api/v1/reports", reportsRoutes);
  app.route("/api/v1/analytics", analyticsRoutes);
  app.route("/api/v1/billing", billingRoutes);
  app.route("/api/v1/license", licenseRoutes);

  // Webhook routes (no auth, uses signature verification)
  app.route("/api/webhooks/keygen", keygenWebhooksRoutes);
}

export { auditRoutes } from "./audit";
export { oncallRoutes } from "./oncall";
export { escalationsRoutes } from "./escalations";
export { sloRoutes } from "./slo";
export { reportsRoutes } from "./reports";
export { analyticsRoutes } from "./analytics";
export { keygenWebhooksRoutes } from "./keygen-webhooks";
export { billingRoutes } from "./billing";
export { licenseRoutes } from "./license";
