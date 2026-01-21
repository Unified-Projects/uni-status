import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./auth";
import { monitors } from "./monitors";

// Enums
export const incidentStatusEnum = pgEnum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "minor",
  "major",
  "critical",
]);

export const incidentDocumentTypeEnum = pgEnum("incident_document_type", [
  "postmortem",
  "rca",
  "timeline",
  "report",
  "other",
]);

// Incidents
export const incidents = pgTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: incidentStatusEnum("status").notNull().default("investigating"),
    severity: incidentSeverityEnum("severity").notNull().default("minor"),
    message: text("message"),
    affectedMonitors: jsonb("affected_monitors").$type<string[]>().default([]),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("incidents_org_id_idx").on(table.organizationId),
    statusIdx: index("incidents_status_idx").on(table.status),
    startedAtIdx: index("incidents_started_at_idx").on(table.startedAt),
  })
);

// Incident Updates
export const incidentUpdates = pgTable(
  "incident_updates",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    status: incidentStatusEnum("status").notNull(),
    message: text("message").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    incidentIdIdx: index("incident_updates_incident_id_idx").on(table.incidentId),
    createdAtIdx: index("incident_updates_created_at_idx").on(table.createdAt),
  })
);

// Incident Monitor Link (for tracking which monitors triggered the incident)
export const incidentMonitors = pgTable(
  "incident_monitors",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
  },
  (table) => ({
    incidentMonitorIdx: index("incident_monitors_idx").on(
      table.incidentId,
      table.monitorId
    ),
  })
);

// Incident Documents (RCA, Post-Mortems, etc.)
export const incidentDocuments = pgTable(
  "incident_documents",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    documentUrl: text("document_url").notNull(),
    documentType: incidentDocumentTypeEnum("document_type").notNull().default("postmortem"),
    description: text("description"),
    addedBy: text("added_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    incidentIdIdx: index("incident_documents_incident_id_idx").on(table.incidentId),
    addedByIdx: index("incident_documents_added_by_idx").on(table.addedBy),
  })
);

// Maintenance Windows
export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    affectedMonitors: jsonb("affected_monitors").$type<string[]>().notNull().default([]),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    timezone: text("timezone").notNull().default("Europe/London"),
    recurrence: jsonb("recurrence").$type<{
      type: "none" | "daily" | "weekly" | "monthly";
      interval?: number;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: string;
    }>().default({ type: "none" }),
    notifySubscribers: jsonb("notify_subscribers").$type<{
      beforeStart?: number; // minutes before
      onStart?: boolean;
      onEnd?: boolean;
    }>().default({ onStart: true, onEnd: true }),
    // Track which notifications have been sent to avoid duplicates
    notificationsSent: jsonb("notifications_sent").$type<{
      beforeStartAt?: string; // ISO timestamp when sent
      onStartAt?: string;
      onEndAt?: string;
    }>().default({}),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("maintenance_windows_org_id_idx").on(table.organizationId),
    startsAtIdx: index("maintenance_windows_starts_at_idx").on(table.startsAt),
  })
);

// Import sql for default values
import { sql } from "drizzle-orm";

// Relations
export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [incidents.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [incidents.createdBy],
    references: [users.id],
  }),
  updates: many(incidentUpdates),
  affectedMonitors: many(incidentMonitors),
  documents: many(incidentDocuments),
}));

export const incidentMonitorsRelations = relations(incidentMonitors, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentMonitors.incidentId],
    references: [incidents.id],
  }),
  monitor: one(monitors, {
    fields: [incidentMonitors.monitorId],
    references: [monitors.id],
  }),
}));

export const incidentUpdatesRelations = relations(incidentUpdates, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentUpdates.incidentId],
    references: [incidents.id],
  }),
  createdByUser: one(users, {
    fields: [incidentUpdates.createdBy],
    references: [users.id],
  }),
}));

export const incidentDocumentsRelations = relations(incidentDocuments, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentDocuments.incidentId],
    references: [incidents.id],
  }),
  addedByUser: one(users, {
    fields: [incidentDocuments.addedBy],
    references: [users.id],
  }),
}));

export const maintenanceWindowsRelations = relations(maintenanceWindows, ({ one }) => ({
  organization: one(organizations, {
    fields: [maintenanceWindows.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [maintenanceWindows.createdBy],
    references: [users.id],
  }),
}));

// Type exports
export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type IncidentUpdate = typeof incidentUpdates.$inferSelect;
export type NewIncidentUpdate = typeof incidentUpdates.$inferInsert;
export type IncidentDocument = typeof incidentDocuments.$inferSelect;
export type NewIncidentDocument = typeof incidentDocuments.$inferInsert;
export type MaintenanceWindow = typeof maintenanceWindows.$inferSelect;
export type NewMaintenanceWindow = typeof maintenanceWindows.$inferInsert;
