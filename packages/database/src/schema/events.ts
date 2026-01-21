import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";
import { incidents } from "./incidents";
import { maintenanceWindows } from "./incidents";

// Enum for event type
export const eventTypeEnum = pgEnum("event_type", ["incident", "maintenance"]);

// Event Subscriptions - allows users to subscribe to specific events
export const eventSubscriptions = pgTable(
  "event_subscriptions",
  {
    id: text("id").primaryKey(),

    // Polymorphic reference to incident or maintenance window
    eventType: eventTypeEnum("event_type").notNull(),
    eventId: text("event_id").notNull(),

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

    // Verification for email subscribers
    verified: boolean("verified").notNull().default(false),
    verificationToken: text("verification_token"),
    unsubscribeToken: text("unsubscribe_token").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventIdx: index("event_subscriptions_event_idx").on(
      table.eventType,
      table.eventId
    ),
    userIdx: index("event_subscriptions_user_idx").on(table.userId),
    emailIdx: index("event_subscriptions_email_idx").on(table.email),
    unsubscribeTokenIdx: index("event_subscriptions_unsubscribe_token_idx").on(
      table.unsubscribeToken
    ),
    verificationTokenIdx: index(
      "event_subscriptions_verification_token_idx"
    ).on(table.verificationToken),
  })
);

// Relations
export const eventSubscriptionsRelations = relations(
  eventSubscriptions,
  ({ one }) => ({
    user: one(user, {
      fields: [eventSubscriptions.userId],
      references: [user.id],
    }),
  })
);

// Type exports
export type EventSubscription = typeof eventSubscriptions.$inferSelect;
export type NewEventSubscription = typeof eventSubscriptions.$inferInsert;
