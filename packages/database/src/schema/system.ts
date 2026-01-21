import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { organizations } from "./organizations";

// Enums
export const signupModeEnum = pgEnum("signup_mode", [
  "invite_only",
  "domain_auto_join",
  "open_with_approval",
]);

export const pendingApprovalStatusEnum = pgEnum("pending_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

// System Settings - singleton table for self-hosted configuration
export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("singleton"),
  setupCompleted: boolean("setup_completed").notNull().default(false),
  setupCompletedAt: timestamp("setup_completed_at"),
  primaryOrganizationId: text("primary_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" }
  ),
  signupMode: signupModeEnum("signup_mode").notNull().default("invite_only"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Pending Approvals - for users awaiting admin approval in open_with_approval mode
export const pendingApprovals = pgTable("pending_approvals", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  status: pendingApprovalStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  primaryOrganization: one(organizations, {
    fields: [systemSettings.primaryOrganizationId],
    references: [organizations.id],
  }),
}));

export const pendingApprovalsRelations = relations(pendingApprovals, ({ one }) => ({
  user: one(users, {
    fields: [pendingApprovals.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [pendingApprovals.organizationId],
    references: [organizations.id],
  }),
  reviewer: one(users, {
    fields: [pendingApprovals.reviewedBy],
    references: [users.id],
  }),
}));

// Type exports
export type SystemSettings = typeof systemSettings.$inferSelect;
export type NewSystemSettings = typeof systemSettings.$inferInsert;
export type PendingApproval = typeof pendingApprovals.$inferSelect;
export type NewPendingApproval = typeof pendingApprovals.$inferInsert;
export type SignupMode = "invite_only" | "domain_auto_join" | "open_with_approval";
export type PendingApprovalStatus = "pending" | "approved" | "rejected";
