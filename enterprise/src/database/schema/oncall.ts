import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "@uni-status/database";

export const oncallRotations = pgTable(
  "oncall_rotations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    timezone: text("timezone").notNull().default("UTC"),
    rotationStart: timestamp("rotation_start").notNull().defaultNow(),
    shiftDurationMinutes: integer("shift_duration_minutes").notNull().default(720), // 12h shifts by default
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    handoffNotificationMinutes: integer("handoff_notification_minutes").notNull().default(30),
    handoffChannels: jsonb("handoff_channels").$type<string[]>().notNull().default([]),
    lastHandoffNotificationAt: timestamp("last_handoff_notification_at"),
    lastHandoffStart: timestamp("last_handoff_start"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("oncall_rotations_org_idx").on(table.organizationId),
    activeIdx: index("oncall_rotations_active_idx").on(table.active),
  })
);

export const oncallOverrides = pgTable(
  "oncall_overrides",
  {
    id: text("id").primaryKey(),
    rotationId: text("rotation_id")
      .notNull()
      .references(() => oncallRotations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    reason: text("reason"),
    createdBy: text("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    rotationIdx: index("oncall_overrides_rotation_idx").on(table.rotationId),
    startIdx: index("oncall_overrides_start_idx").on(table.startAt),
  })
);

export const oncallRotationsRelations = relations(oncallRotations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [oncallRotations.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [oncallRotations.createdBy],
    references: [users.id],
  }),
  overrides: many(oncallOverrides),
}));

export const oncallOverridesRelations = relations(oncallOverrides, ({ one }) => ({
  rotation: one(oncallRotations, {
    fields: [oncallOverrides.rotationId],
    references: [oncallRotations.id],
  }),
  user: one(users, {
    fields: [oncallOverrides.userId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [oncallOverrides.createdBy],
    references: [users.id],
  }),
}));

export type OncallRotation = typeof oncallRotations.$inferSelect;
export type NewOncallRotation = typeof oncallRotations.$inferInsert;
export type OncallOverride = typeof oncallOverrides.$inferSelect;
