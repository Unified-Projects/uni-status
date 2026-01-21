import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { monitors } from "./monitors";

// Enums
export const probeStatusEnum = pgEnum("probe_status", [
  "pending",    // Registered but not yet connected
  "active",     // Connected and healthy
  "offline",    // Not responded to heartbeat
  "disabled",   // Manually disabled
]);

// Private Probes - External agents that run checks
export const probes = pgTable(
  "probes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    region: text("region"), // Custom region name for this probe
    authToken: text("auth_token").notNull(), // Hashed token for authentication
    authTokenPrefix: text("auth_token_prefix").notNull(), // First 8 chars for lookup
    status: probeStatusEnum("status").notNull().default("pending"),
    version: text("version"), // Probe software version
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    lastIp: text("last_ip"), // Last known IP address
    metadata: jsonb("metadata").$type<{
      os?: string;
      arch?: string;
      hostname?: string;
      cpu?: string;
      memory?: string;
      uptime?: number;
    }>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("probes_org_idx").on(table.organizationId),
    statusIdx: index("probes_status_idx").on(table.status),
    tokenPrefixIdx: index("probes_token_prefix_idx").on(table.authTokenPrefix),
  })
);

// Probe Assignments - Link monitors to specific probes
export const probeAssignments = pgTable(
  "probe_assignments",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    probeId: text("probe_id")
      .notNull()
      .references(() => probes.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(1), // Lower = higher priority
    exclusive: boolean("exclusive").default(false), // If true, only this probe runs the check
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    monitorIdx: index("probe_assignments_monitor_idx").on(table.monitorId),
    probeIdx: index("probe_assignments_probe_idx").on(table.probeId),
    uniqueAssignment: uniqueIndex("probe_assignments_unique_idx").on(
      table.monitorId,
      table.probeId
    ),
  })
);

// Need to import boolean
import { boolean } from "drizzle-orm/pg-core";

// Pending Probe Jobs - Jobs waiting to be picked up by probes
export const probePendingJobs = pgTable(
  "probe_pending_jobs",
  {
    id: text("id").primaryKey(),
    probeId: text("probe_id")
      .notNull()
      .references(() => probes.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    jobData: jsonb("job_data").$type<{
      monitorId: string;
      url: string;
      type: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs: number;
      assertions?: Record<string, unknown>;
      config?: Record<string, unknown>;
    }>().notNull(),
    status: text("status").notNull().default("pending"), // pending, claimed, completed, expired
    claimedAt: timestamp("claimed_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    probeIdx: index("probe_pending_jobs_probe_idx").on(table.probeId),
    statusIdx: index("probe_pending_jobs_status_idx").on(table.status),
    expiresIdx: index("probe_pending_jobs_expires_idx").on(table.expiresAt),
  })
);

// Probe Heartbeats - Health check history
export const probeHeartbeats = pgTable(
  "probe_heartbeats",
  {
    id: text("id").primaryKey(),
    probeId: text("probe_id")
      .notNull()
      .references(() => probes.id, { onDelete: "cascade" }),
    metrics: jsonb("metrics").$type<{
      cpuUsage?: number;
      memoryUsage?: number;
      activeJobs?: number;
      completedJobs?: number;
      failedJobs?: number;
      avgResponseTime?: number;
    }>().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    probeIdx: index("probe_heartbeats_probe_idx").on(table.probeId),
    timeIdx: index("probe_heartbeats_time_idx").on(table.createdAt),
  })
);

// Relations
export const probesRelations = relations(probes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [probes.organizationId],
    references: [organizations.id],
  }),
  assignments: many(probeAssignments),
  pendingJobs: many(probePendingJobs),
  heartbeats: many(probeHeartbeats),
}));

export const probeAssignmentsRelations = relations(probeAssignments, ({ one }) => ({
  monitor: one(monitors, {
    fields: [probeAssignments.monitorId],
    references: [monitors.id],
  }),
  probe: one(probes, {
    fields: [probeAssignments.probeId],
    references: [probes.id],
  }),
}));

export const probePendingJobsRelations = relations(probePendingJobs, ({ one }) => ({
  probe: one(probes, {
    fields: [probePendingJobs.probeId],
    references: [probes.id],
  }),
  monitor: one(monitors, {
    fields: [probePendingJobs.monitorId],
    references: [monitors.id],
  }),
}));

export const probeHeartbeatsRelations = relations(probeHeartbeats, ({ one }) => ({
  probe: one(probes, {
    fields: [probeHeartbeats.probeId],
    references: [probes.id],
  }),
}));
