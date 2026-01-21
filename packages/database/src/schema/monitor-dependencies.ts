import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { monitors } from "./monitors";
import { relations } from "drizzle-orm";

/**
 * Monitor Dependencies
 *
 * Tracks upstream/downstream dependency relationships between monitors.
 * Used to visualize service dependencies on the public status page endpoints view.
 */
export const monitorDependencies = pgTable(
  "monitor_dependencies",
  {
    id: text("id").primaryKey(),
    // The monitor that depends on another (downstream)
    downstreamMonitorId: text("downstream_monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    // The monitor being depended upon (upstream)
    upstreamMonitorId: text("upstream_monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    // Optional description of the dependency relationship
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Ensure no duplicate dependency relationships
    uniqueDependency: unique("monitor_deps_downstream_upstream_unique").on(
      table.downstreamMonitorId,
      table.upstreamMonitorId
    ),
  })
);

// Relations for Drizzle ORM
export const monitorDependenciesRelations = relations(monitorDependencies, ({ one }) => ({
  downstreamMonitor: one(monitors, {
    fields: [monitorDependencies.downstreamMonitorId],
    references: [monitors.id],
    relationName: "downstreamDependencies",
  }),
  upstreamMonitor: one(monitors, {
    fields: [monitorDependencies.upstreamMonitorId],
    references: [monitors.id],
    relationName: "upstreamDependencies",
  }),
}));

// Type exports
export type MonitorDependency = typeof monitorDependencies.$inferSelect;
export type NewMonitorDependency = typeof monitorDependencies.$inferInsert;
