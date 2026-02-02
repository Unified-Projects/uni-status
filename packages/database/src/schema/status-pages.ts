import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { monitors } from "./monitors";

// Status Pages
export const statusPages = pgTable(
  "status_pages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    customDomain: text("custom_domain").unique(),
    published: boolean("published").notNull().default(false),
    passwordHash: text("password_hash"),
    logo: text("logo"),
    favicon: text("favicon"),
    theme: jsonb("theme").$type<{
      name: string;
      useCustomTheme?: boolean;
      primaryColor?: string;
      backgroundColor?: string;
      textColor?: string;
      customCss?: string;
      colorMode?: "system" | "light" | "dark";
    }>().default({ name: "default" }),
    settings: jsonb("settings").$type<{
      showUptimePercentage?: boolean;
      showResponseTime?: boolean;
      showIncidentHistory?: boolean;
      showServicesPage?: boolean;
      showGeoMap?: boolean;
      uptimeDays?: number; // 45 or 90 days
      uptimeGranularity?: "minute" | "hour" | "day" | "auto"; // granularity for uptime bars
      headerText?: string;
      footerText?: string;
      supportUrl?: string;
      hideBranding?: boolean;
      // Public subscriptions and crowdsourced reporting settings
      subscriptions?: boolean;
      crowdsourcedReporting?: boolean;
      defaultTimezone?: string;
      localization?: {
        defaultLocale?: string;
        supportedLocales?: string[];
        rtlLocales?: string[];
        translations?: Record<string, Record<string, string>>;
      };
      // Display mode for uptime visualization
      displayMode?: "bars" | "graph" | "both";
      // Configurable metrics to show in graph tooltips
      graphTooltipMetrics?: {
        avg?: boolean;
        min?: boolean;
        max?: boolean;
        p50?: boolean;
        p90?: boolean;
        p99?: boolean;
      };
    }>().default({
      showUptimePercentage: true,
      showResponseTime: true,
      showIncidentHistory: true,
      showServicesPage: false,
      showGeoMap: true,
      uptimeDays: 45,
      uptimeGranularity: "auto",
      defaultTimezone: "local",
      localization: {
        defaultLocale: "en",
        supportedLocales: ["en"],
        rtlLocales: [],
        translations: {},
      },
      displayMode: "bars",
      graphTooltipMetrics: {
        avg: true,
        min: false,
        max: false,
        p50: false,
        p90: false,
        p99: false,
      },
    }),
    seo: jsonb("seo").$type<{
      title?: string;
      description?: string;
      ogImage?: string;
      ogTemplate?: "classic" | "modern" | "minimal" | "dashboard" | "hero" | "compact";
    }>().default({}),
    template: jsonb("template").$type<{
      id: string;
      layout: "list" | "cards" | "sidebar" | "single-page";
      indicatorStyle: "dot" | "badge" | "pill" | "bar";
      incidentStyle: "timeline" | "cards" | "compact" | "expanded";
      monitorStyle: "minimal" | "detailed" | "card" | "row";
      borderRadius: "none" | "sm" | "md" | "lg" | "xl";
      shadow: "none" | "sm" | "md" | "lg";
      spacing: "compact" | "normal" | "relaxed";
    }>().default({
      id: "classic",
      layout: "list",
      indicatorStyle: "dot",
      incidentStyle: "timeline",
      monitorStyle: "row",
      borderRadius: "lg",
      shadow: "sm",
      spacing: "normal",
    }),
    // Authentication/access control configuration
    authConfig: jsonb("auth_config").$type<{
      // Protection mode: none, password only, oauth only, or both
      protectionMode: "none" | "password" | "oauth" | "both";
      // OAuth access mode (when oauth is enabled)
      oauthMode?: "org_members" | "allowlist" | "any_authenticated";
      // Allowed email addresses (for allowlist mode)
      allowedEmails?: string[];
      // Allowed email domains (for allowlist mode)
      allowedDomains?: string[];
      // Required organization roles (for org_members mode)
      allowedRoles?: Array<"owner" | "admin" | "member" | "viewer">;
    }>().default({ protectionMode: "none" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("status_pages_org_id_idx").on(table.organizationId),
    slugIdx: index("status_pages_slug_idx").on(table.slug),
  })
);

// Status Page Monitors (link monitors to status pages)
export const statusPageMonitors = pgTable(
  "status_page_monitors",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    description: text("description"),
    order: integer("order").notNull().default(0),
    group: text("group"),
    showResponseTime: boolean("show_response_time").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pageMonitorIdx: unique().on(table.statusPageId, table.monitorId),
    orderIdx: index("status_page_monitors_order_idx").on(
      table.statusPageId,
      table.order
    ),
  })
);

// Status Page Monitor Groups
export const statusPageGroups = pgTable(
  "status_page_groups",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    collapsed: boolean("collapsed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pageGroupIdx: index("status_page_groups_page_idx").on(table.statusPageId),
  })
);

// Subscribers
export const subscribers = pgTable(
  "subscribers",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verified: boolean("verified").notNull().default(false),
    verificationToken: text("verification_token"),
    channels: jsonb("channels").$type<{
      email?: boolean;
      webhook?: string;
      sms?: string;
    }>().default({ email: true }),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pageEmailIdx: unique().on(table.statusPageId, table.email),
    verificationIdx: index("subscribers_verification_idx").on(
      table.verificationToken
    ),
  })
);

// Relations
export const statusPagesRelations = relations(statusPages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [statusPages.organizationId],
    references: [organizations.id],
  }),
  monitors: many(statusPageMonitors),
  groups: many(statusPageGroups),
  subscribers: many(subscribers),
}));

export const statusPageMonitorsRelations = relations(
  statusPageMonitors,
  ({ one }) => ({
    statusPage: one(statusPages, {
      fields: [statusPageMonitors.statusPageId],
      references: [statusPages.id],
    }),
    monitor: one(monitors, {
      fields: [statusPageMonitors.monitorId],
      references: [monitors.id],
    }),
  })
);

export const subscribersRelations = relations(subscribers, ({ one }) => ({
  statusPage: one(statusPages, {
    fields: [subscribers.statusPageId],
    references: [statusPages.id],
  }),
}));

// Status Page Themes (reusable color themes for status pages)
export const statusPageThemes = pgTable(
  "status_page_themes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    colors: jsonb("colors").$type<{
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
    }>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("status_page_themes_org_id_idx").on(table.organizationId),
    uniqueNamePerOrg: unique("status_page_themes_name_org_unique").on(
      table.organizationId,
      table.name
    ),
  })
);

export const statusPageThemesRelations = relations(statusPageThemes, ({ one }) => ({
  organization: one(organizations, {
    fields: [statusPageThemes.organizationId],
    references: [organizations.id],
  }),
}));

// Type exports
export type StatusPage = typeof statusPages.$inferSelect;
export type NewStatusPage = typeof statusPages.$inferInsert;
export type StatusPageMonitor = typeof statusPageMonitors.$inferSelect;
export type NewStatusPageMonitor = typeof statusPageMonitors.$inferInsert;
export type StatusPageGroup = typeof statusPageGroups.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type StatusPageTheme = typeof statusPageThemes.$inferSelect;
export type NewStatusPageTheme = typeof statusPageThemes.$inferInsert;
