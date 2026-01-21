import {
  pgTable,
  text,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { incidents } from "./incidents";

// Enums
export const deploymentStatusEnum = pgEnum("deployment_status", [
  "started",
  "completed",
  "failed",
  "rolled_back",
]);

export const deploymentEnvironmentEnum = pgEnum("deployment_environment", [
  "production",
  "staging",
  "development",
  "testing",
]);

export const correlationTypeEnum = pgEnum("correlation_type", [
  "auto",
  "manual",
]);

// Deployment Webhook Configuration
export const deploymentWebhooks = pgTable(
  "deployment_webhooks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    secret: text("secret").notNull(), // HMAC secret for verification
    description: text("description"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("deployment_webhooks_org_idx").on(table.organizationId),
  })
);

// Need to import boolean for the webhook config
import { boolean } from "drizzle-orm/pg-core";

// Deployment Events - Received from CI/CD systems
export const deploymentEvents = pgTable(
  "deployment_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    webhookId: text("webhook_id")
      .references(() => deploymentWebhooks.id, { onDelete: "set null" }),
    externalId: text("external_id"), // ID from the CI/CD system
    service: text("service").notNull(),
    version: text("version"),
    environment: deploymentEnvironmentEnum("environment").default("production"),
    status: deploymentStatusEnum("status").notNull(),
    deployedAt: timestamp("deployed_at").notNull(),
    deployedBy: text("deployed_by"),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
    branch: text("branch"),
    affectedMonitors: jsonb("affected_monitors").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("deployment_events_org_idx").on(table.organizationId),
    serviceIdx: index("deployment_events_service_idx").on(table.service),
    deployedAtIdx: index("deployment_events_deployed_at_idx").on(table.deployedAt),
    externalIdIdx: uniqueIndex("deployment_events_external_id_idx").on(
      table.organizationId,
      table.externalId
    ),
  })
);

// Deployment-Incident Links - Correlations between deployments and incidents
export const deploymentIncidents = pgTable(
  "deployment_incidents",
  {
    id: text("id").primaryKey(),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deploymentEvents.id, { onDelete: "cascade" }),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    correlationType: correlationTypeEnum("correlation_type").notNull().default("manual"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }), // 0.00 to 1.00 for auto-correlation
    notes: text("notes"),
    linkedBy: text("linked_by"), // User ID if manual
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
  },
  (table) => ({
    deploymentIdx: index("deployment_incidents_deployment_idx").on(table.deploymentId),
    incidentIdx: index("deployment_incidents_incident_idx").on(table.incidentId),
    uniqueLink: uniqueIndex("deployment_incidents_unique_idx").on(
      table.deploymentId,
      table.incidentId
    ),
  })
);

// Relations
export const deploymentWebhooksRelations = relations(deploymentWebhooks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [deploymentWebhooks.organizationId],
    references: [organizations.id],
  }),
  events: many(deploymentEvents),
}));

export const deploymentEventsRelations = relations(deploymentEvents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [deploymentEvents.organizationId],
    references: [organizations.id],
  }),
  webhook: one(deploymentWebhooks, {
    fields: [deploymentEvents.webhookId],
    references: [deploymentWebhooks.id],
  }),
  incidentLinks: many(deploymentIncidents),
}));

export const deploymentIncidentsRelations = relations(deploymentIncidents, ({ one }) => ({
  deployment: one(deploymentEvents, {
    fields: [deploymentIncidents.deploymentId],
    references: [deploymentEvents.id],
  }),
  incident: one(incidents, {
    fields: [deploymentIncidents.incidentId],
    references: [incidents.id],
  }),
}));
