import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";
import { monitors } from "./monitors";
import { statusPages } from "./status-pages";

// Component/Monitor Subscriptions - allows users to subscribe to specific monitors
export const componentSubscriptions = pgTable(
  "component_subscriptions",
  {
    id: text("id").primaryKey(),

    // Link to status page (required for context and public access)
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),

    // Link to the specific monitor/component
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),

    // Subscriber info (can be authenticated user or anonymous email subscriber)
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    email: text("email"), // For anonymous/public subscribers

    // Notification preferences
    channels: jsonb("channels")
      .$type<{
        email: boolean;
        webhook?: string;
      }>()
      .default({ email: true }),

    // What to notify about
    notifyOn: jsonb("notify_on")
      .$type<{
        newIncident: boolean;
        newMaintenance: boolean;
        statusChange: boolean;
      }>()
      .default({ newIncident: true, newMaintenance: true, statusChange: false }),

    // Verification for email subscribers
    verified: boolean("verified").notNull().default(false),
    verificationToken: text("verification_token"),
    unsubscribeToken: text("unsubscribe_token").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Unique constraints: one subscription per user/email per monitor per status page
    statusPageMonitorUserIdx: unique("component_subscriptions_page_monitor_user").on(
      table.statusPageId,
      table.monitorId,
      table.userId
    ),
    statusPageMonitorEmailIdx: unique("component_subscriptions_page_monitor_email").on(
      table.statusPageId,
      table.monitorId,
      table.email
    ),
    // Query indexes
    monitorIdx: index("component_subscriptions_monitor_idx").on(table.monitorId),
    statusPageIdx: index("component_subscriptions_status_page_idx").on(
      table.statusPageId
    ),
    userIdx: index("component_subscriptions_user_idx").on(table.userId),
    emailIdx: index("component_subscriptions_email_idx").on(table.email),
    unsubscribeTokenIdx: index("component_subscriptions_unsubscribe_token_idx").on(
      table.unsubscribeToken
    ),
    verificationTokenIdx: index("component_subscriptions_verification_token_idx").on(
      table.verificationToken
    ),
  })
);

// Relations
export const componentSubscriptionsRelations = relations(
  componentSubscriptions,
  ({ one }) => ({
    user: one(user, {
      fields: [componentSubscriptions.userId],
      references: [user.id],
    }),
    monitor: one(monitors, {
      fields: [componentSubscriptions.monitorId],
      references: [monitors.id],
    }),
    statusPage: one(statusPages, {
      fields: [componentSubscriptions.statusPageId],
      references: [statusPages.id],
    }),
  })
);

// Type exports
export type ComponentSubscription = typeof componentSubscriptions.$inferSelect;
export type NewComponentSubscription = typeof componentSubscriptions.$inferInsert;
