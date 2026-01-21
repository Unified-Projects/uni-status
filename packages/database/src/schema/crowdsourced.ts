import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { statusPages } from "./status-pages";
import { monitors } from "./monitors";

// Crowdsourced "Down For Me" Reports
export const crowdsourcedReports = pgTable(
  "crowdsourced_reports",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(), // SHA-256 hash of IP for deduplication
    userAgent: text("user_agent"),
    region: text("region"), // Derived from IP geolocation (optional)
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(), // For automatic cleanup
  },
  (table) => ({
    statusPageMonitorIdx: index("crowdsourced_reports_page_monitor_idx").on(
      table.statusPageId,
      table.monitorId
    ),
    createdAtIdx: index("crowdsourced_reports_created_at_idx").on(
      table.createdAt
    ),
    expiresAtIdx: index("crowdsourced_reports_expires_at_idx").on(
      table.expiresAt
    ),
    ipHashMonitorIdx: index("crowdsourced_reports_ip_monitor_idx").on(
      table.ipHash,
      table.monitorId
    ),
  })
);

// Crowdsourced Status Settings (per status page)
export const crowdsourcedSettings = pgTable(
  "crowdsourced_settings",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .unique()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    reportThreshold: integer("report_threshold").notNull().default(30), // Number of reports to trigger degraded
    timeWindowMinutes: integer("time_window_minutes").notNull().default(15), // Window for counting reports
    rateLimitPerIp: integer("rate_limit_per_ip").notNull().default(5), // Max reports per IP per hour
    autoDegradeEnabled: boolean("auto_degrade_enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    statusPageIdx: unique("crowdsourced_settings_status_page_unique").on(
      table.statusPageId
    ),
  })
);

// Relations
export const crowdsourcedReportsRelations = relations(
  crowdsourcedReports,
  ({ one }) => ({
    statusPage: one(statusPages, {
      fields: [crowdsourcedReports.statusPageId],
      references: [statusPages.id],
    }),
    monitor: one(monitors, {
      fields: [crowdsourcedReports.monitorId],
      references: [monitors.id],
    }),
  })
);

export const crowdsourcedSettingsRelations = relations(
  crowdsourcedSettings,
  ({ one }) => ({
    statusPage: one(statusPages, {
      fields: [crowdsourcedSettings.statusPageId],
      references: [statusPages.id],
    }),
  })
);

// Type exports
export type CrowdsourcedReport = typeof crowdsourcedReports.$inferSelect;
export type NewCrowdsourcedReport = typeof crowdsourcedReports.$inferInsert;
export type CrowdsourcedSettings = typeof crowdsourcedSettings.$inferSelect;
export type NewCrowdsourcedSettings = typeof crowdsourcedSettings.$inferInsert;
