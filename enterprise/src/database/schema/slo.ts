import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, monitors } from "@uni-status/database";

// Enums
export const sloWindowEnum = pgEnum("slo_window", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annually",
]);

// SLO Targets - Define uptime targets for monitors
export const sloTargets = pgTable(
  "slo_targets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetPercentage: numeric("target_percentage", { precision: 5, scale: 3 }).notNull(), // e.g., 99.900
    window: sloWindowEnum("window").notNull().default("monthly"),
    gracePeriodMinutes: integer("grace_period_minutes").default(0),
    alertThresholds: numeric("alert_thresholds", { precision: 5, scale: 2 }).array(), // e.g., [25, 10, 5]
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("slo_targets_org_idx").on(table.organizationId),
    monitorIdx: index("slo_targets_monitor_idx").on(table.monitorId),
  })
);

// Error Budgets - Calculated daily for each SLO period
export const errorBudgets = pgTable(
  "error_budgets",
  {
    id: text("id").primaryKey(),
    sloTargetId: text("slo_target_id")
      .notNull()
      .references(() => sloTargets.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    totalMinutes: numeric("total_minutes", { precision: 10, scale: 2 }).notNull(),
    budgetMinutes: numeric("budget_minutes", { precision: 10, scale: 2 }).notNull(),
    consumedMinutes: numeric("consumed_minutes", { precision: 10, scale: 2 }).default("0"),
    remainingMinutes: numeric("remaining_minutes", { precision: 10, scale: 2 }).notNull(),
    percentRemaining: numeric("percent_remaining", { precision: 5, scale: 2 }).notNull(),
    percentConsumed: numeric("percent_consumed", { precision: 5, scale: 2 }).default("0"),
    breached: boolean("breached").default(false),
    breachedAt: timestamp("breached_at"),
    lastAlertThreshold: numeric("last_alert_threshold", { precision: 5, scale: 2 }), // Last threshold alert was sent at
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    sloIdx: index("error_budgets_slo_idx").on(table.sloTargetId),
    periodIdx: index("error_budgets_period_idx").on(table.periodStart, table.periodEnd),
  })
);

// SLO Breaches - History of when SLOs were breached
export const sloBreaches = pgTable(
  "slo_breaches",
  {
    id: text("id").primaryKey(),
    sloTargetId: text("slo_target_id")
      .notNull()
      .references(() => sloTargets.id, { onDelete: "cascade" }),
    errorBudgetId: text("error_budget_id")
      .references(() => errorBudgets.id, { onDelete: "set null" }),
    breachStartedAt: timestamp("breach_started_at").notNull(),
    breachResolvedAt: timestamp("breach_resolved_at"),
    downtimeMinutes: numeric("downtime_minutes", { precision: 10, scale: 2 }),
    budgetMinutes: numeric("budget_minutes", { precision: 10, scale: 2 }),
    uptimePercentage: numeric("uptime_percentage", { precision: 5, scale: 3 }),
    targetPercentage: numeric("target_percentage", { precision: 5, scale: 3 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sloIdx: index("slo_breaches_slo_idx").on(table.sloTargetId),
    timeIdx: index("slo_breaches_time_idx").on(table.breachStartedAt),
  })
);

// Relations
export const sloTargetsRelations = relations(sloTargets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sloTargets.organizationId],
    references: [organizations.id],
  }),
  monitor: one(monitors, {
    fields: [sloTargets.monitorId],
    references: [monitors.id],
  }),
  errorBudgets: many(errorBudgets),
  breaches: many(sloBreaches),
}));

export const errorBudgetsRelations = relations(errorBudgets, ({ one }) => ({
  sloTarget: one(sloTargets, {
    fields: [errorBudgets.sloTargetId],
    references: [sloTargets.id],
  }),
}));

export const sloBreachesRelations = relations(sloBreaches, ({ one }) => ({
  sloTarget: one(sloTargets, {
    fields: [sloBreaches.sloTargetId],
    references: [sloTargets.id],
  }),
  errorBudget: one(errorBudgets, {
    fields: [sloBreaches.errorBudgetId],
    references: [errorBudgets.id],
  }),
}));
