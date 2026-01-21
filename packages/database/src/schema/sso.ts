import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, organizationMembers, memberRoleEnum, resourceTypeEnum } from "./organizations";
import { ssoProvider } from "./auth";

// SSO Provider Types
export const ssoProviderTypeEnum = pgEnum("sso_provider_type", ["oidc", "saml"]);

// Group to Role Mapping type
// Maps IdP group names/IDs to organization roles
export type GroupRoleMapping = {
  // The group identifier from the IdP (group name, ID, or claim value)
  group: string;
  // The organization role to assign when user has this group
  role: "owner" | "admin" | "member" | "viewer";
};

// Group Role Mapping Configuration
export type GroupRoleMappingConfig = {
  // Whether group-based role assignment is enabled
  enabled: boolean;
  // The claim name in the token that contains groups (default: "groups")
  groupsClaim?: string;
  // List of group to role mappings (evaluated in order, first match wins)
  mappings: GroupRoleMapping[];
  // Default role if no group mapping matches (defaults to provider's default role)
  defaultRole?: "owner" | "admin" | "member" | "viewer";
  // Whether to sync roles on every login (true) or only on first provisioning (false)
  syncOnLogin?: boolean;
};

// OIDC Configuration type (matches Better Auth SSO plugin expectations)
export type OIDCConfig = {
  clientId: string;
  clientSecret?: string; // Will be encrypted when stored
  clientSecretEncrypted?: string; // AES-256-GCM encrypted
  discoveryUrl?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksEndpoint?: string;
  scopes?: string[];
  pkce?: boolean;
  // Claim mapping from IdP to user attributes
  claimMapping?: {
    id?: string;
    email?: string;
    emailVerified?: string;
    name?: string;
    image?: string;
    groups?: string;
  };
  // Group-based role mapping configuration
  groupRoleMapping?: GroupRoleMappingConfig;
};

// SAML Configuration type
export type SAMLConfig = {
  entryPoint: string;
  certificateEncrypted: string; // AES-256-GCM encrypted
  issuer: string;
  callbackUrl: string;
  signatureAlgorithm?: "sha256" | "sha512";
  wantAssertionsSigned?: boolean;
  // Attribute mapping from SAML assertions
  attributeMapping?: {
    id?: string;
    email?: string;
    name?: string;
    groups?: string;
  };
  // Group-based role mapping configuration
  groupRoleMapping?: GroupRoleMappingConfig;
};

// NOTE: We use Better Auth's ssoProvider table from auth.ts
// No need for a separate sso_providers table

// Organization Domains - For domain verification and auto-join
export const organizationDomains = pgTable(
  "organization_domains",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The email domain (e.g., "company.com")
    domain: text("domain").notNull(),
    // Whether domain ownership has been verified
    verified: boolean("verified").notNull().default(false),
    // DNS TXT record value for verification
    verificationToken: text("verification_token"),
    // When verification was completed
    verifiedAt: timestamp("verified_at"),
    // Auto-join settings
    autoJoinEnabled: boolean("auto_join_enabled").notNull().default(false),
    // Default role for auto-joined users
    autoJoinRole: memberRoleEnum("auto_join_role").notNull().default("member"),
    // Link to SSO provider (if SSO is required for this domain)
    ssoProviderId: text("sso_provider_id").references(() => ssoProvider.id, {
      onDelete: "set null",
    }),
    // If true, users with this domain MUST use SSO (no email/password)
    ssoRequired: boolean("sso_required").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Each domain can only belong to one org
    domainUnique: unique().on(table.domain),
    // Index for domain lookups
    domainIdx: index("org_domains_domain_idx").on(table.domain),
    // Index for org lookups
    orgIdx: index("org_domains_org_idx").on(table.organizationId),
  })
);

// Resource Scopes - Scoped permissions for organization members
export const resourceScopes = pgTable(
  "resource_scopes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => organizationMembers.id, { onDelete: "cascade" }),
    // Type of resource this scope applies to
    resourceType: resourceTypeEnum("resource_type").notNull(),
    // Specific resource ID (null means all resources of this type)
    resourceId: text("resource_id"),
    // Role for this specific resource (overrides org-level role)
    role: memberRoleEnum("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Unique scope per member per resource
    memberResourceUnique: unique().on(
      table.memberId,
      table.resourceType,
      table.resourceId
    ),
    // Index for member lookups
    memberIdx: index("resource_scopes_member_idx").on(table.memberId),
    // Index for resource lookups
    resourceIdx: index("resource_scopes_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
  })
);

// Relations
export const organizationDomainsRelations = relations(
  organizationDomains,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationDomains.organizationId],
      references: [organizations.id],
    }),
    ssoProvider: one(ssoProvider, {
      fields: [organizationDomains.ssoProviderId],
      references: [ssoProvider.id],
    }),
  })
);

export const resourceScopesRelations = relations(resourceScopes, ({ one }) => ({
  organization: one(organizations, {
    fields: [resourceScopes.organizationId],
    references: [organizations.id],
  }),
  member: one(organizationMembers, {
    fields: [resourceScopes.memberId],
    references: [organizationMembers.id],
  }),
}));

// Type exports
export type OrganizationDomain = typeof organizationDomains.$inferSelect;
export type NewOrganizationDomain = typeof organizationDomains.$inferInsert;
export type ResourceScope = typeof resourceScopes.$inferSelect;
export type NewResourceScope = typeof resourceScopes.$inferInsert;

// Re-export SSO Provider types from auth schema
export type SSOProvider = typeof ssoProvider.$inferSelect;
export type NewSSOProvider = typeof ssoProvider.$inferInsert;
