import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "@uni-status/database";

// Enums
export const reportTypeEnum = pgEnum("report_type", [
  "sla",           // SLA compliance report
  "uptime",        // Uptime summary
  "incident",      // Incident history
  "performance",   // Response time and performance
  "executive",     // Executive summary (combined)
]);

export const reportFrequencyEnum = pgEnum("report_frequency", [
  "weekly",
  "monthly",
  "quarterly",
  "annually",
  "on_demand",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "generating",
  "completed",
  "failed",
  "expired",
]);

// Report Settings - Configuration for automated reports
export const reportSettings = pgTable(
  "report_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    reportType: reportTypeEnum("report_type").notNull().default("sla"),
    frequency: reportFrequencyEnum("frequency").notNull().default("monthly"),
    // Scope - which monitors/pages to include
    monitorIds: jsonb("monitor_ids").$type<string[]>().default([]),
    statusPageIds: jsonb("status_page_ids").$type<string[]>().default([]),
    includeAllMonitors: boolean("include_all_monitors").default(false),
    // Content options
    includeCharts: boolean("include_charts").default(true),
    includeIncidents: boolean("include_incidents").default(true),
    includeMaintenanceWindows: boolean("include_maintenance_windows").default(true),
    includeResponseTimes: boolean("include_response_times").default(true),
    includeSloStatus: boolean("include_slo_status").default(true),
    // Branding
    customBranding: jsonb("custom_branding").$type<{
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      companyName?: string;
      footerText?: string;
    }>().default({}),
    // Recipients
    recipients: jsonb("recipients").$type<{
      emails: string[];
      sendToOwner?: boolean;
      sendToAdmins?: boolean;
    }>().default({ emails: [] }),
    // Schedule
    dayOfWeek: integer("day_of_week"), // 0-6 for weekly
    dayOfMonth: integer("day_of_month"), // 1-31 for monthly
    timezone: text("timezone").default("Europe/London"),
    active: boolean("active").default(true),
    lastGeneratedAt: timestamp("last_generated_at"),
    nextScheduledAt: timestamp("next_scheduled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("report_settings_org_idx").on(table.organizationId),
    activeIdx: index("report_settings_active_idx").on(table.active),
    nextScheduledIdx: index("report_settings_next_scheduled_idx").on(table.nextScheduledAt),
  })
);

// SLA Reports - Generated report files
export const slaReports = pgTable(
  "sla_reports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    settingsId: text("settings_id")
      .references(() => reportSettings.id, { onDelete: "set null" }),
    reportType: reportTypeEnum("report_type").notNull(),
    status: reportStatusEnum("status").notNull().default("pending"),
    // Period covered
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    // File storage
    fileUrl: text("file_url"), // S3/storage URL
    fileName: text("file_name"),
    fileSize: integer("file_size"), // bytes
    mimeType: text("mime_type").default("application/pdf"),
    // Generation metadata
    generatedAt: timestamp("generated_at"),
    generatedBy: text("generated_by"), // User ID if manual, 'system' if scheduled
    generationDurationMs: integer("generation_duration_ms"),
    errorMessage: text("error_message"),
    // Report content summary (for quick display without downloading)
    summary: jsonb("summary").$type<{
      monitorCount?: number;
      incidentCount?: number;
      uptimePercentage?: number;
      avgResponseTime?: number;
      slosMet?: number;
      slosBreached?: number;
      maintenanceWindows?: number;
    }>().default({}),
    // Which monitors/pages were included
    includedMonitors: jsonb("included_monitors").$type<string[]>().default([]),
    includedStatusPages: jsonb("included_status_pages").$type<string[]>().default([]),
    // Expiration for storage cleanup
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("sla_reports_org_idx").on(table.organizationId),
    settingsIdx: index("sla_reports_settings_idx").on(table.settingsId),
    statusIdx: index("sla_reports_status_idx").on(table.status),
    periodIdx: index("sla_reports_period_idx").on(table.periodStart, table.periodEnd),
    expiresIdx: index("sla_reports_expires_idx").on(table.expiresAt),
  })
);

// Report Deliveries - Track when reports were sent
export const reportDeliveries = pgTable(
  "report_deliveries",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => slaReports.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    openedAt: timestamp("opened_at"),
    status: text("status").notNull().default("pending"), // pending, sent, delivered, failed, bounced
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    reportIdx: index("report_deliveries_report_idx").on(table.reportId),
    statusIdx: index("report_deliveries_status_idx").on(table.status),
  })
);

// Report Templates - Custom templates for branding
export const reportTemplates = pgTable(
  "report_templates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    reportType: reportTypeEnum("report_type").notNull(),
    // Template content (HTML/Handlebars)
    headerHtml: text("header_html"),
    footerHtml: text("footer_html"),
    cssStyles: text("css_styles"),
    // Branding defaults for this template
    branding: jsonb("branding").$type<{
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      fontFamily?: string;
      companyName?: string;
      tagline?: string;
    }>().default({}),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("report_templates_org_idx").on(table.organizationId),
    typeIdx: index("report_templates_type_idx").on(table.reportType),
  })
);

// Relations
export const reportSettingsRelations = relations(reportSettings, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [reportSettings.organizationId],
    references: [organizations.id],
  }),
  reports: many(slaReports),
}));

export const slaReportsRelations = relations(slaReports, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [slaReports.organizationId],
    references: [organizations.id],
  }),
  settings: one(reportSettings, {
    fields: [slaReports.settingsId],
    references: [reportSettings.id],
  }),
  deliveries: many(reportDeliveries),
}));

export const reportDeliveriesRelations = relations(reportDeliveries, ({ one }) => ({
  report: one(slaReports, {
    fields: [reportDeliveries.reportId],
    references: [slaReports.id],
  }),
}));

export const reportTemplatesRelations = relations(reportTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [reportTemplates.organizationId],
    references: [organizations.id],
  }),
}));
