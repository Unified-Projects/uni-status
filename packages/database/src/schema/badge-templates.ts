import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

// Badge Types
export const badgeTypeEnum = pgEnum("badge_type", [
  "badge",
  "dot",
]);

// Badge Styles
export const badgeStyleEnum = pgEnum("badge_style", [
  "flat",
  "plastic",
  "flat-square",
  "for-the-badge",
  "modern",
]);

// Badge Templates
export const badgeTemplates = pgTable(
  "badge_templates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: badgeTypeEnum("type").notNull().default("badge"),
    style: badgeStyleEnum("style").notNull().default("flat"),
    // Badge configuration
    config: jsonb("config").$type<{
      // Label configuration
      label?: string; // Left side text (e.g., "status", "uptime")
      labelColor?: string; // Hex color for label background

      // Status colors (override defaults)
      statusColors?: {
        operational?: string;
        degraded?: string;
        partialOutage?: string;
        majorOutage?: string;
        maintenance?: string;
        unknown?: string;
      };

      // Text colors
      textColor?: string; // Text color for label
      statusTextColor?: string; // Text color for status

      // Size configuration
      scale?: number; // Scale factor (1.0 = normal)

      // Dot-specific settings
      dot?: {
        size?: number; // Diameter in pixels
        animate?: boolean; // Pulse animation
        animationStyle?: "pulse" | "blink";
      };

      // Custom data display
      customData?: {
        enabled: boolean;
        type: "uptime" | "response_time" | "p50" | "p90" | "p99" | "error_rate" | "custom";
        // For custom type
        customLabel?: string;
        customValue?: string; // Can use placeholders like {{uptime}}
        // Thresholds for conditional colors
        thresholds?: Array<{
          value: number;
          color: string;
          comparison: "lt" | "lte" | "gt" | "gte" | "eq";
        }>;
      };

      // Additional options
      showIcon?: boolean; // Show status icon in modern style
      rounded?: boolean; // Rounded corners (for flat-square)
      // Custom CSS for advanced styling
      customCss?: string;
    }>().default({}),
    // Is this the default template for the org?
    isDefault: boolean("is_default").default(false),
    // Track usage
    usageCount: integer("usage_count").default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("badge_templates_org_id_idx").on(table.organizationId),
    isDefaultIdx: index("badge_templates_is_default_idx").on(table.isDefault),
    typeIdx: index("badge_templates_type_idx").on(table.type),
    createdByIdx: index("badge_templates_created_by_idx").on(table.createdBy),
  })
);

// Relations
export const badgeTemplatesRelations = relations(badgeTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [badgeTemplates.organizationId],
    references: [organizations.id],
  }),
}));

// Type exports
export type BadgeTemplate = typeof badgeTemplates.$inferSelect;
export type NewBadgeTemplate = typeof badgeTemplates.$inferInsert;
