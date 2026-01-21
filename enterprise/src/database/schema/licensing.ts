import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "@uni-status/database";

// ==========================================
// Enums
// ==========================================

export const licenseStatusEnum = pgEnum("license_status", [
  "active",
  "expired",
  "suspended",
  "revoked",
]);

export const gracePeriodStatusEnum = pgEnum("grace_period_status", [
  "none",
  "active",
  "expired",
]);

export const billingEventTypeEnum = pgEnum("billing_event_type", [
  // License lifecycle
  "license_created",
  "license_activated",
  "license_renewed",
  "license_suspended",
  "license_revoked",
  "license_expired",
  "license_validated",
  "license_validation_failed",
  // Entitlements
  "entitlements_changed",
  "entitlements_synced",
  // Grace period
  "grace_period_started",
  "grace_period_reminder",
  "grace_period_ended",
  // Plan changes
  "upgraded",
  "downgraded",
  // Payments (from Keygen.sh Stripe integration)
  "payment_succeeded",
  "payment_failed",
]);

// ==========================================
// Entitlements Type (from Keygen.sh)
// ==========================================

export interface LicenseEntitlements {
  // Resource limits (-1 = unlimited)
  monitors: number;
  statusPages: number;
  teamMembers: number;
  regions: number;
  // Feature flags
  auditLogs: boolean;
  sso: boolean;
  oauthProviders: boolean;
  customRoles: boolean;
  slo: boolean;
  reports: boolean;
  multiRegion: boolean;
  oncall: boolean;
}

/**
 * Default entitlements for FREE tier (hosted mode).
 * These match the ORG_TYPE_LIMITS.FREE values.
 *
 * Note: teamMembers is -1 (unlimited) because the restriction
 * is enforced via the "one free org per user" rule instead.
 */
export const DEFAULT_FREE_ENTITLEMENTS: LicenseEntitlements = {
  monitors: 10, // FREE tier: 10 monitors
  statusPages: 2, // FREE tier: 2 status pages
  teamMembers: -1, // Unlimited (controlled by free org membership rule)
  regions: 1,
  auditLogs: false,
  sso: false,
  oauthProviders: false,
  customRoles: false,
  slo: false,
  reports: false,
  multiRegion: false,
  oncall: false,
};

// ==========================================
// Licenses (BOTH modes - Keygen.sh)
// ==========================================

export const licenses = pgTable(
  "licenses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Keygen.sh integration
    keygenLicenseId: text("keygen_license_id").notNull().unique(),
    keygenPolicyId: text("keygen_policy_id"),

    // License details
    key: text("key"), // The license key (encrypted at rest) - for self-hosted activation
    name: text("name"), // License name/identifier
    plan: text("plan").notNull().default("pro"), // pro, business, enterprise
    status: licenseStatusEnum("status").notNull().default("active"),

    // Validity
    validFrom: timestamp("valid_from").notNull(),
    expiresAt: timestamp("expires_at"), // null = perpetual

    // Validation tracking
    lastValidatedAt: timestamp("last_validated_at"),
    lastValidationResult: text("last_validation_result"), // success, expired, invalid, suspended, network_error
    validationFailureCount: integer("validation_failure_count").default(0),

    // Entitlements (cached from Keygen.sh)
    entitlements: jsonb("entitlements")
      .$type<LicenseEntitlements>()
      .default(DEFAULT_FREE_ENTITLEMENTS),

    // Grace period tracking
    gracePeriodStatus: gracePeriodStatusEnum("grace_period_status")
      .notNull()
      .default("none"),
    gracePeriodStartedAt: timestamp("grace_period_started_at"),
    gracePeriodEndsAt: timestamp("grace_period_ends_at"),
    gracePeriodEmailsSent: jsonb("grace_period_emails_sent")
      .$type<number[]>()
      .default([]), // Days when reminder emails were sent (e.g., [5, 3, 1])

    // Machine binding (for self-hosted)
    machineId: text("machine_id"), // Keygen.sh machine ID
    machineFingerprint: text("machine_fingerprint"),
    activatedAt: timestamp("activated_at"),
    activatedBy: text("activated_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Licensee info
    licenseeEmail: text("licensee_email"),
    licenseeName: text("licensee_name"),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("licenses_org_id_idx").on(table.organizationId),
    keygenLicenseIdx: index("licenses_keygen_license_idx").on(
      table.keygenLicenseId
    ),
    statusIdx: index("licenses_status_idx").on(table.status),
    gracePeriodIdx: index("licenses_grace_period_idx").on(
      table.gracePeriodStatus
    ),
    uniqueOrg: unique("licenses_org_unique").on(table.organizationId),
  })
);

// ==========================================
// License Validations (Audit Trail)
// ==========================================

export const licenseValidations = pgTable(
  "license_validations",
  {
    id: text("id").primaryKey(),
    licenseId: text("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),

    validationType: text("validation_type").notNull(), // online, offline, startup, scheduled, webhook
    success: boolean("success").notNull(),

    // Error details
    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    // Response from Keygen.sh (if online validation)
    responseCode: integer("response_code"),
    responseData: jsonb("response_data").$type<Record<string, unknown>>(),

    // Context
    machineFingerprint: text("machine_fingerprint"),
    ipAddress: text("ip_address"),

    validatedAt: timestamp("validated_at").notNull().defaultNow(),
  },
  (table) => ({
    licenseIdIdx: index("license_validations_license_idx").on(table.licenseId),
    validatedAtIdx: index("license_validations_validated_at_idx").on(
      table.validatedAt
    ),
    successIdx: index("license_validations_success_idx").on(table.success),
  })
);

// ==========================================
// Billing Events (Audit Trail)
// ==========================================

export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    licenseId: text("license_id").references(() => licenses.id, {
      onDelete: "set null",
    }),

    eventType: billingEventTypeEnum("event_type").notNull(),
    source: text("source").notNull(), // keygen, system

    // External event reference
    sourceEventId: text("source_event_id"), // Keygen.sh webhook event ID

    // State changes
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
    newState: jsonb("new_state").$type<Record<string, unknown>>(),

    // Additional context
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }), // User who triggered the event (if applicable)

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("billing_events_org_id_idx").on(table.organizationId),
    licenseIdx: index("billing_events_license_idx").on(table.licenseId),
    eventTypeIdx: index("billing_events_event_type_idx").on(table.eventType),
    createdAtIdx: index("billing_events_created_at_idx").on(table.createdAt),
  })
);

// ==========================================
// Relations
// ==========================================

export const licensesRelations = relations(licenses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [licenses.organizationId],
    references: [organizations.id],
  }),
  activator: one(users, {
    fields: [licenses.activatedBy],
    references: [users.id],
  }),
  validations: many(licenseValidations),
  billingEvents: many(billingEvents),
}));

export const licenseValidationsRelations = relations(
  licenseValidations,
  ({ one }) => ({
    license: one(licenses, {
      fields: [licenseValidations.licenseId],
      references: [licenses.id],
    }),
  })
);

export const billingEventsRelations = relations(billingEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [billingEvents.organizationId],
    references: [organizations.id],
  }),
  license: one(licenses, {
    fields: [billingEvents.licenseId],
    references: [licenses.id],
  }),
  actor: one(users, {
    fields: [billingEvents.actorId],
    references: [users.id],
  }),
}));

// ==========================================
// Type Exports
// ==========================================

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type LicenseStatus = (typeof licenseStatusEnum.enumValues)[number];

export type LicenseValidation = typeof licenseValidations.$inferSelect;
export type NewLicenseValidation = typeof licenseValidations.$inferInsert;

export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;
export type BillingEventType =
  (typeof billingEventTypeEnum.enumValues)[number];

export type GracePeriodStatus =
  (typeof gracePeriodStatusEnum.enumValues)[number];
