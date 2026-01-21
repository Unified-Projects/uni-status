import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "@uni-status/database";

export const escalationPolicies = pgTable(
  "escalation_policies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ackTimeoutMinutes: integer("ack_timeout_minutes").notNull().default(15),
    severityOverrides: jsonb("severity_overrides").$type<{
      minor?: number;
      major?: number;
      critical?: number;
    }>().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("escalation_policies_org_idx").on(table.organizationId),
    activeIdx: index("escalation_policies_active_idx").on(table.active),
  })
);

export const escalationSteps = pgTable(
  "escalation_steps",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id")
      .notNull()
      .references(() => escalationPolicies.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    oncallRotationId: text("oncall_rotation_id"),
    notifyOnAckTimeout: boolean("notify_on_ack_timeout").notNull().default(true),
    skipIfAcknowledged: boolean("skip_if_acknowledged").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    policyIdx: index("escalation_steps_policy_idx").on(table.policyId),
    stepIdx: index("escalation_steps_step_idx").on(table.stepNumber),
  })
);

export const escalationPoliciesRelations = relations(
  escalationPolicies,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [escalationPolicies.organizationId],
      references: [organizations.id],
    }),
    steps: many(escalationSteps),
  })
);

export const escalationStepsRelations = relations(escalationSteps, ({ one }) => ({
  policy: one(escalationPolicies, {
    fields: [escalationSteps.policyId],
    references: [escalationPolicies.id],
  }),
}));

export type EscalationPolicy = typeof escalationPolicies.$inferSelect;
export type NewEscalationPolicy = typeof escalationPolicies.$inferInsert;
export type EscalationStep = typeof escalationSteps.$inferSelect;
