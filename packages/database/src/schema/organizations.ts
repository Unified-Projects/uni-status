import { pgTable, text, timestamp, jsonb, pgEnum, unique, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

// Local copy of credential shapes so this schema doesn't depend on the shared package at runtime
type OrganizationCredentials = {
  smtp?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    fromAddress: string;
    fromName?: string;
    secure?: boolean;
    enabled: boolean;
  };
  resend?: { apiKey: string; fromAddress: string; enabled: boolean };
  twilio?: { accountSid: string; authToken: string; fromNumber: string; enabled: boolean };
  ntfy?: { serverUrl?: string; username?: string; password?: string; enabled: boolean };
  irc?: {
    defaultServer?: string;
    defaultPort?: number;
    defaultNickname?: string;
    defaultPassword?: string;
    useSsl?: boolean;
    enabled: boolean;
  };
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
    enabled: boolean;
  };
  webhook?: { defaultSigningKey?: string; enabled: boolean };
};

// Enums
export const planEnum = pgEnum("plan", ["free", "pro", "business", "enterprise"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free",
  "professional",
  "enterprise",
]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "expired"]);
export const resourceTypeEnum = pgEnum("resource_type", [
  "user",
  "organization",
  "monitor",
  "incident",
  "incident_document",
  "status_page",
  "badge_template",
  "alert_channel",
  "alert_policy",
  "api_key",
  "maintenance_window",
  "subscriber",
  "maintenance",
  "all",
  "deployment_event",
  "deployment_incident",
  "deployment_webhook",
  "escalation_policy",
  "external_status_provider",
  "oncall_schedule",
  "report",
  "report_settings",
  "report_template",
  "probe",
  "probe_assignment",
  "role",
  "sla_report",
  "slo_target",
  "sso_provider",
  "sso_domain",
]);

export type ResourceType = (typeof resourceTypeEnum.enumValues)[number];

// Organizations
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  /** Subscription tier for hosted mode billing. Null for self-hosted. */
  subscriptionTier: subscriptionTierEnum("subscription_tier"),
  logo: text("logo"),
  settings: jsonb("settings").$type<{
    defaultCheckInterval?: number;
    timezone?: string;
    notifications?: {
      emailEnabled?: boolean;
      slackEnabled?: boolean;
    };
    integrations?: {
      pagespeed?: {
        apiKey?: string;  // Google PageSpeed Insights API key
        enabled?: boolean;
      };
      prometheus?: {
        defaultUrl?: string;
        blackboxUrl?: string;
        alloyEmbedUrl?: string;
        defaultModule?: string;
        bearerToken?: string;
        remoteWriteToken?: string;
      };
      // Future integrations can be added here
    };
    // BYO credentials for notification integrations
    // Allows orgs to use their own SMTP, Twilio, etc. instead of platform defaults
    credentials?: OrganizationCredentials;
  }>().default({}),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Organization Members
export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    customRoleId: text("custom_role_id"),
    invitedBy: text("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueMember: unique().on(table.organizationId, table.userId),
  })
);

// API Keys
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(["read"]),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Organization Invitations
export const organizationInvitations = pgTable("organization_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRoleEnum("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  status: invitationStatusEnum("status").notNull().default("pending"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  invitations: many(organizationInvitations),
  apiKeys: many(apiKeys),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const organizationInvitationsRelations = relations(organizationInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [organizationInvitations.invitedBy],
    references: [users.id],
  }),
}));

// Type exports
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
