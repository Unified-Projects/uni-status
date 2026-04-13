import { OpenAPIHono } from "@hono/zod-openapi";
import { createSchema, createYoga } from "graphql-yoga";
import { GraphQLScalarType, Kind, type ValueNode } from "graphql";
import { db } from "@uni-status/database";
import { monitors, organizationMembers, statusPages, subscribers } from "@uni-status/database/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { API_CHANGELOG, API_DEPRECATIONS, API_VERSIONS } from "../lib/api-metadata";
import { buildPublicStatusPagePayload } from "../lib/status-page-data";
import { authMiddleware, type AuthContext } from "../middleware/auth";
import { sendSubscriberVerificationEmail } from "../lib/email";
import { resolvePublicStatusPageAccessFromHeaders } from "./public";

export const graphqlRoutes = new OpenAPIHono();

// Reuse existing auth so API keys/sessions work for protected queries
graphqlRoutes.use("*", authMiddleware);

const typeDefs = /* GraphQL */ `
  enum MonitorStatus {
    active
    degraded
    down
    paused
    pending
  }

  type MonitorUptimeDay {
    date: String!
    uptimePercentage: Float
    status: String!
    successCount: Int!
    degradedCount: Int!
    failureCount: Int!
    totalCount: Int!
  }

  type ProviderImpact {
    providerId: String!
    providerName: String!
    providerStatus: String
    providerStatusText: String
  }

  type Monitor {
    id: ID!
    name: String!
    description: String
    type: String!
    group: String
    order: Int!
    status: MonitorStatus!
    regions: [String!]
    uptimePercentage: Float
    responseTimeMs: Float
    uptimeData: [MonitorUptimeDay!]!
    providerImpacts: [ProviderImpact!]
  }

  type IncidentUpdate {
    id: ID!
    status: String!
    message: String!
    createdAt: String!
  }

  type Incident {
    id: ID!
    title: String!
    status: String!
    severity: String!
    message: String
    affectedMonitors: [String!]!
    startedAt: String!
    resolvedAt: String
    updates: [IncidentUpdate!]!
  }

  type CrowdsourcedConfig {
    enabled: Boolean!
    threshold: Int
    reportCounts: JSON
  }

  scalar JSON

  type StatusPageSettings {
    showUptimePercentage: Boolean!
    showResponseTime: Boolean!
    showIncidentHistory: Boolean!
    showServicesPage: Boolean!
    showGeoMap: Boolean
    uptimeDays: Int!
    headerText: String
    footerText: String
    supportUrl: String
    hideBranding: Boolean!
    defaultTimezone: String
    localization: JSON
  }

  type StatusPageTheme {
    name: String!
    primaryColor: String
    backgroundColor: String
    textColor: String
    customCss: String
  }

  type StatusPage {
    id: ID!
    name: String!
    slug: String!
    logo: String
    favicon: String
    orgLogo: String
    theme: StatusPageTheme!
    settings: StatusPageSettings!
    monitors: [Monitor!]!
    activeIncidents: [Incident!]!
    recentIncidents: [Incident!]!
    crowdsourced: CrowdsourcedConfig!
    lastUpdatedAt: String!
  }

  type ApiInfo {
    latest: String!
    supported: [String!]!
    default: String!
    preview: String
    changelog: [ChangelogEntry!]!
    deprecations: [DeprecationNotice!]!
  }

  type ChangelogEntry {
    version: String!
    date: String!
    changes: [String!]!
    breaking: Boolean
  }

  type DeprecationNotice {
    id: String!
    description: String!
    endpoints: [String!]!
    sunsetAt: String
    replacement: String
    severity: String
  }

  type SubscriptionResult {
    success: Boolean!
    message: String!
    status: String!
  }

  type Query {
    statusPage(slug: String!): StatusPage
    statusPages(slugs: [String!]!): [StatusPage!]!
    monitors(organizationId: ID!, status: MonitorStatus): [Monitor!]!
    apiInfo: ApiInfo!
  }

  type Mutation {
    subscribeStatusPage(slug: String!, email: String!): SubscriptionResult!
  }
`;

const parseLiteralValue = (ast: ValueNode): unknown => {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.NULL:
      return null;
    case Kind.OBJECT:
      return Object.fromEntries(
        ast.fields.map((field) => [field.name.value, parseLiteralValue(field.value)])
      );
    case Kind.LIST:
      return ast.values.map((value) => parseLiteralValue(value));
    default:
      return null;
  }
};

const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
  parseLiteral: (ast) => parseLiteralValue(ast),
});

const MAX_STATUS_PAGE_SLUGS_PER_QUERY = 25;

async function ensureGraphqlOrganizationAccess(
  auth: AuthContext | undefined,
  organizationId: string
) {
  if (!auth?.apiKey && !auth?.user) {
    throw new Error("Authentication required for monitors query");
  }

  if (auth.apiKey) {
    if (auth.organizationId !== organizationId) {
      throw new Error("Organization mismatch for monitors query");
    }
    return;
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, auth.user!.id)
    ),
    columns: {
      organizationId: true,
    },
  });

  if (!membership) {
    throw new Error("Not authorized for this organization");
  }
}

const resolvers = {
  JSON: JSONScalar,
  Query: {
    statusPage: async (
      _: unknown,
      args: { slug: string },
      ctx: { auth?: AuthContext; headers?: Headers }
    ) => {
      const access = await resolvePublicStatusPageAccessFromHeaders(ctx.headers ?? new Headers(), args.slug);
      if ("denied" in access) {
        throw new Error(access.denied.body.error.message);
      }
      return buildPublicStatusPagePayload({
        page: access.page,
        organization: access.organization,
      });
    },
    statusPages: async (
      _: unknown,
      args: { slugs: string[] },
      ctx: { auth?: AuthContext; headers?: Headers }
    ) => {
      const uniqueSlugs = Array.from(new Set(args.slugs.map((slug) => slug.trim()).filter(Boolean)));
      if (uniqueSlugs.length > MAX_STATUS_PAGE_SLUGS_PER_QUERY) {
        throw new Error(`Too many slugs requested. Maximum is ${MAX_STATUS_PAGE_SLUGS_PER_QUERY}.`);
      }

      const results: Array<Awaited<ReturnType<typeof buildPublicStatusPagePayload>> | null> = [];
      const batchSize = 8;

      for (let i = 0; i < uniqueSlugs.length; i += batchSize) {
        const batch = uniqueSlugs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (slug) => {
            const access = await resolvePublicStatusPageAccessFromHeaders(ctx.headers ?? new Headers(), slug);
            if ("denied" in access) {
              return null;
            }

            return buildPublicStatusPagePayload({
              page: access.page,
              organization: access.organization,
            });
          })
        );
        results.push(...batchResults);
      }
      return results.filter(Boolean);
    },
    monitors: async (
      _: unknown,
      args: { organizationId: string; status?: string },
      ctx: { auth?: AuthContext }
    ) => {
      await ensureGraphqlOrganizationAccess(ctx.auth, args.organizationId);

      const validStatuses = ["active", "degraded", "down", "paused", "pending"] as const;
      const statusFilter =
        args.status && validStatuses.includes(args.status as (typeof validStatuses)[number])
          ? (args.status as (typeof validStatuses)[number])
          : null;

      const rows = await db.query.monitors.findMany({
        where: statusFilter
          ? and(eq(monitors.organizationId, args.organizationId), eq(monitors.status, statusFilter))
          : eq(monitors.organizationId, args.organizationId),
      });

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        type: row.type,
        group: (row as any).group || null,
        order: (row as any).order || 0,
        status: row.status,
        regions: row.regions || [],
        uptimePercentage: null,
        responseTimeMs: null,
        uptimeData: [],
        providerImpacts: [],
      }));
    },
    apiInfo: () => ({
      latest: API_VERSIONS.latest,
      supported: API_VERSIONS.supported,
      default: API_VERSIONS.default,
      preview: API_VERSIONS.preview,
      changelog: API_CHANGELOG,
      deprecations: API_DEPRECATIONS,
    }),
  },
  Mutation: {
    subscribeStatusPage: async (
      _: unknown,
      args: { slug: string; email: string }
    ): Promise<{ success: boolean; message: string; status: string }> => {
      if (!args.email.includes("@")) {
        return { success: false, message: "Invalid email address", status: "INVALID_EMAIL" };
      }

      const page = await db.query.statusPages.findFirst({
        where: eq(statusPages.slug, args.slug),
      });

      if (!page || !page.published) {
        return { success: false, message: "Status page not found", status: "NOT_FOUND" };
      }

      const existing = await db.query.subscribers.findFirst({
        where: and(eq(subscribers.statusPageId, page.id), eq(subscribers.email, args.email.toLowerCase())),
      });

      if (existing) {
        if (existing.verified) {
          return { success: true, message: "Already subscribed", status: "ALREADY_VERIFIED" };
        }

        await sendSubscriberVerificationEmail({
          email: existing.email,
          statusPageName: page.name,
          statusPageSlug: args.slug,
          verificationToken: existing.verificationToken!,
        });

        return {
          success: true,
          message: "Verification email re-sent",
          status: "PENDING_VERIFICATION",
        };
      }

      const id = nanoid();
      const verificationToken = nanoid(32);
      const unsubscribeToken = nanoid(32);

      await db.insert(subscribers).values({
        id,
        statusPageId: page.id,
        email: args.email.toLowerCase(),
        verified: false,
        verificationToken,
        unsubscribeToken,
        channels: { email: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await sendSubscriberVerificationEmail({
        email: args.email.toLowerCase(),
        statusPageName: page.name,
        statusPageSlug: args.slug,
        verificationToken,
      });

      return {
        success: true,
        message: "Verification email sent",
        status: "PENDING_VERIFICATION",
      };
    },
  },
};

const schema = createSchema<{ auth?: AuthContext; headers?: Headers }>({
  typeDefs,
  resolvers,
});

const yoga = createYoga<{ auth?: AuthContext; headers?: Headers }>({
  graphqlEndpoint: "/api/graphql",
  schema,
  maskedErrors: false,
  context: async ({ request }) => {
    const auth = (request as any).authContext as AuthContext | undefined;
    return { auth, headers: request.headers };
  },
});

graphqlRoutes.all("/*", async (c) => {
  // Pass auth context through the Request so Yoga can read it
  (c.req.raw as any).authContext = c.get("auth");
  return yoga.fetch(c.req.raw);
});
