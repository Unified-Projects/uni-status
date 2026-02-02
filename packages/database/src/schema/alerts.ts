import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { monitors } from "./monitors";

// Enums
export const alertChannelTypeEnum = pgEnum("alert_channel_type", [
  "email",
  "slack",
  "discord",
  "teams",
  "pagerduty",
  "webhook",
  "sms",
  "ntfy",
  "irc",
  "twitter",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "triggered",
  "acknowledged",
  "resolved",
]);

// Alert Channels (notification destinations)
export const alertChannels = pgTable(
  "alert_channels",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: alertChannelTypeEnum("type").notNull(),
    config: jsonb("config").$type<{
      // Email
      email?: string; // DEPRECATED - kept for backward compatibility
      fromAddress?: string;
      toAddresses?: string[];
      // Slack
      webhookUrl?: string;
      channel?: string;
      // Discord
      // webhookUrl is reused
      // PagerDuty
      routingKey?: string;
      // Webhook
      url?: string;
      headers?: Record<string, string>;
      method?: "GET" | "POST";
      // SMS
      phoneNumber?: string;
      // ntfy
      topic?: string;
      server?: string;
      // IRC
      ircServer?: string;
      ircPort?: number;
      ircChannel?: string;
      ircNickname?: string;
      ircPassword?: string;
      ircUseSsl?: boolean;
      // Twitter/X
      twitterApiKey?: string;
      twitterApiSecret?: string;
      twitterAccessToken?: string;
      twitterAccessSecret?: string;
      twitterMode?: "tweet" | "dm";
      twitterDmRecipient?: string;
    }>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("alert_channels_org_id_idx").on(table.organizationId),
  })
);

// Alert Policies (rules for when to alert)
export const alertPolicies = pgTable(
  "alert_policies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    escalationPolicyId: text("escalation_policy_id"),
    oncallRotationId: text("oncall_rotation_id"),
    conditions: jsonb("conditions").$type<{
      // Trigger conditions
      consecutiveFailures?: number; // Alert after N consecutive failures
      failuresInWindow?: {
        count: number;
        windowMinutes: number;
      };
      degradedDuration?: number; // Alert after degraded for N minutes
      // Recovery conditions
      consecutiveSuccesses?: number; // Recover after N successes
    }>().notNull().default({ consecutiveFailures: 2 }),
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    cooldownMinutes: integer("cooldown_minutes").notNull().default(15),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("alert_policies_org_id_idx").on(table.organizationId),
  })
);

// Monitor Alert Policy Links
export const monitorAlertPolicies = pgTable(
  "monitor_alert_policies",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    policyId: text("policy_id")
      .notNull()
      .references(() => alertPolicies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    monitorPolicyIdx: index("monitor_alert_policies_idx").on(
      table.monitorId,
      table.policyId
    ),
  })
);

// Alert History
export const alertHistory = pgTable(
  "alert_history",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
  policyId: text("policy_id").references(() => alertPolicies.id, {
    onDelete: "set null",
  }),
    escalationPolicyId: text("escalation_policy_id"),
    escalationStep: integer("escalation_step").default(0),
    escalatedAt: timestamp("escalated_at"),
    status: alertStatusEnum("status").notNull().default("triggered"),
    triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedBy: text("acknowledged_by"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"),
    metadata: jsonb("metadata").$type<{
      checkResultId?: string;
      errorMessage?: string;
      consecutiveFailures?: number;
      responseTimeMs?: number;
      statusCode?: number;
      failureCount?: number;
      lastFailureAt?: string;
      failureTimestamps?: string[];
    }>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("alert_history_org_id_idx").on(table.organizationId),
    monitorIdIdx: index("alert_history_monitor_id_idx").on(table.monitorId),
    triggeredAtIdx: index("alert_history_triggered_at_idx").on(
      table.triggeredAt
    ),
    statusIdx: index("alert_history_status_idx").on(table.status),
  })
);

// Notification Log (individual notification attempts)
export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: text("id").primaryKey(),
    alertHistoryId: text("alert_history_id")
      .notNull()
      .references(() => alertHistory.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => alertChannels.id, { onDelete: "cascade" }),
    success: boolean("success").notNull(),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    responseCode: integer("response_code"),
    retryCount: integer("retry_count").notNull().default(0),
  },
  (table) => ({
    alertHistoryIdx: index("notification_logs_alert_history_idx").on(
      table.alertHistoryId
    ),
  })
);

// Relations
export const alertChannelsRelations = relations(alertChannels, ({ one }) => ({
  organization: one(organizations, {
    fields: [alertChannels.organizationId],
    references: [organizations.id],
  }),
}));

export const alertPoliciesRelations = relations(
  alertPolicies,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [alertPolicies.organizationId],
      references: [organizations.id],
    }),
    monitorLinks: many(monitorAlertPolicies),
  })
);

export const monitorAlertPoliciesRelations = relations(
  monitorAlertPolicies,
  ({ one }) => ({
    monitor: one(monitors, {
      fields: [monitorAlertPolicies.monitorId],
      references: [monitors.id],
    }),
    policy: one(alertPolicies, {
      fields: [monitorAlertPolicies.policyId],
      references: [alertPolicies.id],
    }),
  })
);

export const alertHistoryRelations = relations(alertHistory, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [alertHistory.organizationId],
    references: [organizations.id],
  }),
  monitor: one(monitors, {
    fields: [alertHistory.monitorId],
    references: [monitors.id],
  }),
  policy: one(alertPolicies, {
    fields: [alertHistory.policyId],
    references: [alertPolicies.id],
  }),
  notifications: many(notificationLogs),
}));

// Type exports
export type AlertChannel = typeof alertChannels.$inferSelect;
export type NewAlertChannel = typeof alertChannels.$inferInsert;
export type AlertPolicy = typeof alertPolicies.$inferSelect;
export type NewAlertPolicy = typeof alertPolicies.$inferInsert;
export type AlertHistoryRecord = typeof alertHistory.$inferSelect;
export type NewAlertHistoryRecord = typeof alertHistory.$inferInsert;
export type NotificationLog = typeof notificationLogs.$inferSelect;
