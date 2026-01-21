import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users, resourceTypeEnum } from "@uni-status/database";

// Enums
export const auditActionEnum = pgEnum("audit_action", [
  // Auth actions
  "user.login",
  "user.logout",
  "user.password_change",
  "user.mfa_enable",
  "user.mfa_disable",
  // Organization actions
  "organization.create",
  "organization.update",
  "organization.delete",
  "organization.member_invite",
  "organization.member_remove",
  "organization.member_role_change",
  // Monitor actions
  "monitor.create",
  "monitor.update",
  "monitor.delete",
  "monitor.pause",
  "monitor.resume",
  // Incident actions
  "incident.create",
  "incident.update",
  "incident.resolve",
  "incident.document.add",
  "incident.document.delete",
  "incident.document.update",
  // Status page actions
  "status_page.create",
  "status_page.update",
  "status_page.delete",
  "status_page.publish",
  "status_page.unpublish",
  // Alert actions
  "alert_channel.create",
  "alert_channel.update",
  "alert_channel.delete",
  "alert_policy.create",
  "alert_policy.update",
  "alert_policy.delete",
  // API key actions
  "api_key.create",
  "api_key.delete",
  "api_key.use",
  // Settings actions
  "settings.update",
  // Deployment actions
  "deployment.create",
  "deployment.link_incident",
  "deployment.unlink_incident",
  "deployment_webhook.create",
  "deployment_webhook.delete",
  "deployment_webhook.regenerate_secret",
  // Badge template actions
  "badge_template.create",
  "badge_template.update",
  "badge_template.delete",
  // Event subscription actions
  "event_subscription.create",
  "event_subscription.delete",
  // External status provider actions
  "external_status.create",
  "external_status.update",
  "external_status.delete",
  "external_status.toggle",
  // Probe actions
  "probe.create",
  "probe.update",
  "probe.delete",
  "probe.regenerate_token",
  "probe.assign_monitor",
  "probe.unassign_monitor",
  // Report actions
  "report.generate",
  "report_settings.create",
  "report_settings.update",
  "report_settings.delete",
  "report_template.create",
  "report_template.update",
  "report_template.delete",
  // Role actions
  "role.create",
  "role.update",
  "role.delete",
  // SLO actions
  "slo.create",
  "slo.update",
  "slo.delete",
]);

// Audit Logs
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: auditActionEnum("action").notNull(),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    resourceId: text("resource_id"),
    resourceName: text("resource_name"),
    metadata: jsonb("metadata").$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      changes?: Array<{
        field: string;
        from: unknown;
        to: unknown;
      }>;
      reason?: string;
    }>().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("audit_logs_org_id_idx").on(table.organizationId),
    userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    resourceIdx: index("audit_logs_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  })
);

// Relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Type exports
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type AuditAction = typeof auditActionEnum.enumValues[number];
export type ResourceType = typeof resourceTypeEnum.enumValues[number];
