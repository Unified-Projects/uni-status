/**
 * Billing Management Routes (Hosted Mode)
 *
 * These routes are for organizations using the hosted Uni-Status platform
 * with Stripe payments managed through Keygen.sh's Stripe integration.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { eq, desc } from "drizzle-orm";
import { enterpriseDb as db } from "../../database";
import {
  licenses,
  billingEvents,
  DEFAULT_FREE_ENTITLEMENTS,
} from "../../database/schema/licensing";
import { requireOrganization, requireRole } from "../middleware/auth";
import { isKeygenConfigured } from "@uni-status/shared/lib/keygen";
import { isSelfHosted } from "@uni-status/shared/config";
import { resolveOrgType } from "@uni-status/shared/lib/org-type";
import type { LicenseEntitlements } from "../../database/schema/licensing";

// Landing API configuration for billing proxy
// Always points to the official Unified Projects landing page
const LANDING_API_URL = "https://status.unified.sh";
const LANDING_INTERNAL_API_KEY = process.env.LANDING_INTERNAL_API_KEY || "";

/**
 * Get the entitlements to display based on deployment mode.
 * In self-hosted mode, we return unlimited limits regardless of license.
 * In hosted mode, we return the license entitlements or free defaults.
 */
function getDisplayEntitlements(
  licenseEntitlements: LicenseEntitlements | null | undefined,
  hasEnterpriseLicense: boolean = false
): LicenseEntitlements {
  if (isSelfHosted()) {
    // Self-hosted mode always gets unlimited resources
    // Enterprise features are only gated by license
    const orgTypeContext = resolveOrgType(null,
      hasEnterpriseLicense ? { status: "active" } : undefined,
      { selfHosted: true }
    );
    return {
      monitors: orgTypeContext.limits.monitors,
      statusPages: orgTypeContext.limits.statusPages,
      teamMembers: orgTypeContext.limits.teamMembers,
      regions: orgTypeContext.limits.regions,
      auditLogs: orgTypeContext.enterpriseFeatures,
      sso: orgTypeContext.enterpriseFeatures,
      oauthProviders: orgTypeContext.enterpriseFeatures,
      customRoles: orgTypeContext.enterpriseFeatures,
      slo: orgTypeContext.enterpriseFeatures,
      reports: orgTypeContext.enterpriseFeatures,
      multiRegion: true,
      oncall: orgTypeContext.enterpriseFeatures,
    };
  }
  // Hosted mode: use license entitlements or free defaults
  return licenseEntitlements || DEFAULT_FREE_ENTITLEMENTS;
}

export const billingRoutes = new OpenAPIHono();

/**
 * GET /api/v1/billing/license
 *
 * Get the current organization's license and entitlements.
 */
billingRoutes.get("/license", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  // Get the organization's license
  const license = await db.query.licenses.findFirst({
    where: eq(licenses.organizationId, organizationId),
  });

  if (!license) {
    // No license - return appropriate defaults based on deployment mode
    return c.json({
      success: true,
      data: {
        hasLicense: false,
        plan: isSelfHosted() ? "self-hosted" : "free",
        status: "no_license",
        entitlements: getDisplayEntitlements(null, false),
        gracePeriod: null,
        license: null,
      },
    });
  }

  // Calculate grace period info if applicable
  let gracePeriod = null;
  if (license.gracePeriodStatus === "active" && license.gracePeriodEndsAt) {
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (license.gracePeriodEndsAt.getTime() - Date.now()) /
          (24 * 60 * 60 * 1000)
      )
    );
    gracePeriod = {
      status: license.gracePeriodStatus,
      startedAt: license.gracePeriodStartedAt?.toISOString() || null,
      endsAt: license.gracePeriodEndsAt.toISOString(),
      daysRemaining,
    };
  }

  // Check if this is an active enterprise license for self-hosted
  // Grace period is tracked via gracePeriodStatus, not the license status field
  const hasEnterpriseLicense = license.status === "active" || license.gracePeriodStatus === "active";

  return c.json({
    success: true,
    data: {
      hasLicense: true,
      plan: license.plan,
      status: license.status,
      entitlements: getDisplayEntitlements(license.entitlements, hasEnterpriseLicense),
      gracePeriod,
      license: {
        id: license.id,
        name: license.name,
        expiresAt: license.expiresAt?.toISOString() || null,
        licenseeEmail: license.licenseeEmail,
        licenseeName: license.licenseeName,
        lastValidatedAt: license.lastValidatedAt?.toISOString() || null,
        createdAt: license.createdAt.toISOString(),
      },
    },
  });
});

/**
 * GET /api/v1/billing/checkout/:plan
 *
 * Get a checkout URL for the specified plan.
 * Redirects user to the landing portal where Stripe payment happens.
 */
billingRoutes.get("/checkout/:plan", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  // Self-hosted deployments don't use checkout
  if (isSelfHosted()) {
    return c.json(
      {
        success: false,
        error: "Checkout not available for self-hosted deployments",
      },
      400
    );
  }

  const plan = c.req.param("plan");
  const validPlans = ["pro", "business", "enterprise"];

  if (!validPlans.includes(plan)) {
    return c.json(
      {
        success: false,
        error: `Invalid plan. Must be one of: ${validPlans.join(", ")}`,
      },
      400
    );
  }

  // Redirect to landing portal for checkout
  // The landing portal handles Stripe payment and Keygen license creation
  const checkoutUrl = `${LANDING_API_URL}/portal?upgrade=${plan}&org=${organizationId}`;

  return c.json({
    success: true,
    data: {
      url: checkoutUrl,
      plan,
    },
  });
});

/**
 * GET /api/v1/billing/portal
 *
 * Get the billing portal URL for managing the subscription.
 * Redirects to the landing portal where users can manage billing.
 */
billingRoutes.get("/portal", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  if (isSelfHosted()) {
    return c.json(
      {
        success: false,
        error: "Portal not available for self-hosted deployments",
      },
      400
    );
  }

  // Redirect to landing portal for billing management
  const billingUrl = `${LANDING_API_URL}/portal?tab=billing&org=${organizationId}`;

  return c.json({
    success: true,
    data: {
      url: billingUrl,
    },
  });
});

/**
 * GET /api/v1/billing/invoices
 *
 * Get invoice history for the organization.
 * Proxies to the landing API which manages Stripe data.
 */
billingRoutes.get("/invoices", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  // Self-hosted deployments don't have invoices
  if (isSelfHosted()) {
    return c.json({
      success: true,
      data: {
        invoices: [],
        meta: { total: 0, limit: 20, offset: 0, hasMore: false },
      },
    });
  }

  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  // Proxy to landing API
  if (!LANDING_INTERNAL_API_KEY) {
    console.warn("[Billing] LANDING_INTERNAL_API_KEY not configured");
    return c.json({
      success: true,
      data: {
        invoices: [],
        meta: { total: 0, limit, offset, hasMore: false },
      },
    });
  }

  try {
    const landingUrl = new URL("/api/billing/invoices", LANDING_API_URL);
    landingUrl.searchParams.set("organizationId", organizationId);
    landingUrl.searchParams.set("limit", limit.toString());
    landingUrl.searchParams.set("offset", offset.toString());

    const response = await fetch(landingUrl.toString(), {
      method: "GET",
      headers: {
        "X-Internal-API-Key": LANDING_INTERNAL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[Billing] Landing API error: ${response.status}`);
      return c.json({
        success: true,
        data: {
          invoices: [],
          meta: { total: 0, limit, offset, hasMore: false },
        },
      });
    }

    const landingData = await response.json();
    return c.json(landingData);
  } catch (error) {
    console.error("[Billing] Failed to fetch invoices from landing:", error);
    return c.json({
      success: true,
      data: {
        invoices: [],
        meta: { total: 0, limit, offset, hasMore: false },
      },
    });
  }
});

/**
 * GET /api/v1/billing/events
 *
 * Get billing event history for the organization.
 */
billingRoutes.get("/events", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner"]);

  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const events = await db.query.billingEvents.findMany({
    where: eq(billingEvents.organizationId, organizationId),
    orderBy: desc(billingEvents.createdAt),
    limit,
    offset,
  });

  // Get total count
  const allEvents = await db.query.billingEvents.findMany({
    where: eq(billingEvents.organizationId, organizationId),
    columns: { id: true },
  });

  return c.json({
    success: true,
    data: {
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        source: event.source,
        previousState: event.previousState,
        newState: event.newState,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      meta: {
        total: allEvents.length,
        limit,
        offset,
        hasMore: offset + events.length < allEvents.length,
      },
    },
  });
});

/**
 * GET /api/v1/billing/plans
 *
 * Get available plans and their features.
 */
billingRoutes.get("/plans", async (c) => {
  // This endpoint is public for pricing display
  // but returns different data based on auth status

  const plans = [
    {
      id: "free",
      name: "Free",
      description: "For personal projects and testing",
      price: 0,
      currency: "GBP",
      interval: "month",
      features: {
        monitors: 5,
        statusPages: 1,
        teamMembers: 1,
        regions: 1,
        auditLogs: false,
        sso: false,
        customRoles: false,
        slo: false,
        reports: false,
        multiRegion: false,
      },
      highlights: [
        "5 monitors",
        "1 status page",
        "1 team member",
        "Email notifications",
        "5-minute check intervals",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      description: "For growing teams and businesses",
      price: 29,
      currency: "GBP",
      interval: "month",
      features: {
        monitors: 50,
        statusPages: 5,
        teamMembers: 10,
        regions: 3,
        auditLogs: false,
        sso: false,
        customRoles: false,
        slo: false,
        reports: false,
        multiRegion: true,
      },
      highlights: [
        "50 monitors",
        "5 status pages",
        "10 team members",
        "3 monitoring regions",
        "Multi-region monitoring",
        "1-minute check intervals",
        "Slack & Discord integrations",
      ],
      recommended: true,
    },
    {
      id: "business",
      name: "Business",
      description: "For larger organizations with advanced needs",
      price: 99,
      currency: "GBP",
      interval: "month",
      features: {
        monitors: 200,
        statusPages: 20,
        teamMembers: 50,
        regions: 5,
        auditLogs: true,
        sso: true,
        customRoles: false,
        slo: true,
        reports: true,
        multiRegion: true,
      },
      highlights: [
        "200 monitors",
        "20 status pages",
        "50 team members",
        "5 monitoring regions",
        "Audit logs",
        "SSO/SAML",
        "SLO tracking",
        "Custom reports",
        "30-second check intervals",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      description: "For organizations requiring the highest level of support",
      price: null, // Contact for pricing
      currency: "GBP",
      interval: "month",
      features: {
        monitors: -1, // unlimited
        statusPages: -1,
        teamMembers: -1,
        regions: -1,
        auditLogs: true,
        sso: true,
        customRoles: true,
        slo: true,
        reports: true,
        multiRegion: true,
      },
      highlights: [
        "Unlimited monitors",
        "Unlimited status pages",
        "Unlimited team members",
        "All regions",
        "Custom roles & permissions",
        "Dedicated support",
        "Custom integrations",
        "On-premise deployment option",
        "SLA guarantee",
      ],
    },
  ];

  return c.json({
    success: true,
    data: { plans },
  });
});

/**
 * GET /api/v1/billing/usage
 *
 * Get current resource usage against entitlements.
 */
billingRoutes.get("/usage", async (c) => {
  const organizationId = await requireOrganization(c);
  await requireRole(c, ["admin", "owner", "member"]);

  // Get current license
  const license = await db.query.licenses.findFirst({
    where: eq(licenses.organizationId, organizationId),
  });

  // Check if this is an active license for enterprise features
  const hasActiveLicense = license?.status === "active" || license?.gracePeriodStatus === "active";
  const entitlements = getDisplayEntitlements(license?.entitlements, hasActiveLicense);

  // Count current resources
  const { monitors, statusPages, organizationMembers } = await import(
    "@uni-status/database"
  );

  const [monitorCount, statusPageCount, memberCount] = await Promise.all([
    db
      .select({ count: monitors.id })
      .from(monitors)
      .where(eq(monitors.organizationId, organizationId))
      .then((r) => r.length),
    db
      .select({ count: statusPages.id })
      .from(statusPages)
      .where(eq(statusPages.organizationId, organizationId))
      .then((r) => r.length),
    db
      .select({ count: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId))
      .then((r) => r.length),
  ]);

  return c.json({
    success: true,
    data: {
      usage: {
        monitors: {
          used: monitorCount,
          limit: entitlements.monitors,
          unlimited: entitlements.monitors === -1,
          percentUsed:
            entitlements.monitors === -1
              ? 0
              : Math.round((monitorCount / entitlements.monitors) * 100),
        },
        statusPages: {
          used: statusPageCount,
          limit: entitlements.statusPages,
          unlimited: entitlements.statusPages === -1,
          percentUsed:
            entitlements.statusPages === -1
              ? 0
              : Math.round((statusPageCount / entitlements.statusPages) * 100),
        },
        teamMembers: {
          used: memberCount,
          limit: entitlements.teamMembers,
          unlimited: entitlements.teamMembers === -1,
          percentUsed:
            entitlements.teamMembers === -1
              ? 0
              : Math.round((memberCount / entitlements.teamMembers) * 100),
        },
      },
      features: {
        auditLogs: entitlements.auditLogs,
        sso: entitlements.sso,
        customRoles: entitlements.customRoles,
        slo: entitlements.slo,
        reports: entitlements.reports,
        multiRegion: entitlements.multiRegion,
      },
    },
  });
});
