import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  statusPages,
  statusPageMonitors,
  subscribers,
  monitors,
  checkResults,
  incidents,
  incidentUpdates,
  organizations,
  organizationMembers,
  heartbeatPings,
  maintenanceWindows,
  eventSubscriptions,
  crowdsourcedReports,
  crowdsourcedSettings,
  componentSubscriptions,
  monitorDependencies,
  checkResultsDaily,
  probes,
} from "@uni-status/database/schema";
import { eq, and, desc, gte, lte, sql, ne, inArray, ilike, or, lt } from "drizzle-orm";
import type { UnifiedEvent, EventType } from "@uni-status/shared";
import { getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import {
  sendSubscriberVerificationEmail,
  sendComponentSubscriptionVerificationEmail,
} from "../lib/email";
import { publishEvent } from "../lib/redis";
import { createHash } from "crypto";
import { buildPublicStatusPagePayload } from "../lib/status-page-data";
import { getEnabledGlobalProviders } from "@uni-status/auth/server";
import { getJwtSecret } from "@uni-status/shared/config";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "public-api" });
// Use function to get JWT secret with fallback for tests
const getJwtSecretOrFallback = () => getJwtSecret() || "test-secret";

// Helper to check OAuth access for status pages
async function checkOAuthAccess(
  page: typeof statusPages.$inferSelect,
  oauthToken: string | undefined
): Promise<{ allowed: boolean; email?: string; userId?: string }> {
  if (!oauthToken) {
    return { allowed: false };
  }

  try {
    const payload = await verify(oauthToken, getJwtSecretOrFallback(), "HS256");
    const email = payload.email as string;
    const userId = payload.userId as string;
    const authConfig = page.authConfig as {
      protectionMode: string;
      oauthMode?: string;
      allowedEmails?: string[];
      allowedDomains?: string[];
      allowedRoles?: string[];
    } | null;

    if (!authConfig || authConfig.protectionMode === "none") {
      return { allowed: true, email, userId };
    }

    const oauthMode = authConfig.oauthMode || "any_authenticated";

    switch (oauthMode) {
      case "any_authenticated":
        // Any authenticated user can access
        return { allowed: true, email, userId };

      case "allowlist":
        // Check email and domain allowlists
        const emailDomain = email.split("@")[1]?.toLowerCase();
        const allowedEmails = authConfig.allowedEmails || [];
        const allowedDomains = authConfig.allowedDomains || [];

        if (allowedEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
          return { allowed: true, email, userId };
        }
        if (emailDomain && allowedDomains.map(d => d.toLowerCase()).includes(emailDomain)) {
          return { allowed: true, email, userId };
        }
        return { allowed: false, email, userId };

      case "org_members":
        // Check if user is a member of the organization
        if (!userId) {
          return { allowed: false, email };
        }

        const membership = await db.query.organizationMembers.findFirst({
          where: and(
            eq(organizationMembers.organizationId, page.organizationId),
            eq(organizationMembers.userId, userId)
          ),
        });

        if (!membership) {
          return { allowed: false, email, userId };
        }

        // Check role restrictions if specified
        const allowedRoles = authConfig.allowedRoles;
        if (allowedRoles && allowedRoles.length > 0) {
          if (!allowedRoles.includes(membership.role)) {
            return { allowed: false, email, userId };
          }
        }

        return { allowed: true, email, userId };

      default:
        return { allowed: false, email, userId };
    }
  } catch {
    return { allowed: false };
  }
}

export const publicRoutes = new OpenAPIHono();

publicRoutes.get("/status-pages/:slug", async (c) => {
  const { slug } = c.req.param();

  try {
    const page = await db.query.statusPages.findFirst({
      where: eq(statusPages.slug, slug),
    });

    if (!page) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Status page not found",
          },
        },
        404
      );
    }

    if (!page.published) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_PUBLISHED",
            message: "This status page is not available",
          },
        },
        404
      );
    }

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, page.organizationId),
    });

    const authConfig = page.authConfig as {
      protectionMode: string;
      oauthMode?: string;
      allowedEmails?: string[];
      allowedDomains?: string[];
      allowedRoles?: string[];
    } | null;

    const protectionMode = authConfig?.protectionMode || "none";

    // Handle different protection modes
    if (protectionMode !== "none") {
      const passwordToken = getCookie(c, `sp_token_${slug}`);
      const oauthToken = getCookie(c, `sp_oauth_${slug}`);

      let passwordValid = false;
      let oauthValid = false;

      // Check password protection
      if (page.passwordHash && (protectionMode === "password" || protectionMode === "both")) {
        if (passwordToken) {
          try {
            const payload = await verify(passwordToken, getJwtSecretOrFallback(), "HS256");
            if (payload.slug === slug) {
              passwordValid = true;
            }
          } catch (error) {
            // Invalid token
          }
        }
      }

      // Check OAuth protection
      if (protectionMode === "oauth" || protectionMode === "both") {
        const oauthAccess = await checkOAuthAccess(page, oauthToken);
        oauthValid = oauthAccess.allowed;
      }

      // Determine if access should be granted
      let accessGranted = false;
      if (protectionMode === "password") {
        accessGranted = passwordValid;
      } else if (protectionMode === "oauth") {
        accessGranted = oauthValid;
      } else if (protectionMode === "both") {
        // "both" means either password OR oauth is sufficient
        accessGranted = passwordValid || oauthValid;
      }

      if (!accessGranted) {
        // Get available OAuth providers for the response
        const providers = protectionMode === "oauth" || protectionMode === "both"
          ? getEnabledGlobalProviders()
          : [];

        return c.json(
          {
            success: false,
            error: {
              code: "AUTH_REQUIRED",
              message: "Authentication required to view this status page",
            },
            meta: {
              name: page.name,
              logo: page.logo,
              protectionMode,
              oauthMode: authConfig?.oauthMode,
              requiresPassword: protectionMode === "password" || protectionMode === "both",
              requiresOAuth: protectionMode === "oauth" || protectionMode === "both",
              providers: providers.map(p => ({ id: p.id, name: p.name })),
            },
          },
          401
        );
      }
    }

    const data = await buildPublicStatusPagePayload({ page, organization: org });

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    log.error({ err: error, slug }, "Error fetching status page");
    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "An unexpected error occurred",
        },
      },
      500
    );
  }
});

publicRoutes.post("/status-pages/:slug/verify-password", async (c) => {
  const { slug } = c.req.param();
  const body = await c.req.json();
  const { password } = body;

  if (!password) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_PASSWORD",
          message: "Password is required",
        },
      },
      400
    );
  }

  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page || !page.published) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Status page not found",
        },
      },
      404
    );
  }

  if (!page.passwordHash) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_PROTECTED",
          message: "This status page is not password protected",
        },
      },
      400
    );
  }

  const isValid = await Bun.password.verify(password, page.passwordHash);

  if (!isValid) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_PASSWORD",
          message: "Incorrect password",
        },
      },
      401
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  let token: string;
  try {
    token = await sign(
      {
        slug,
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      getJwtSecretOrFallback()
    );
  } catch (error) {
    log.error({ err: error }, "JWT signing error");
    return c.json(
      {
        success: false,
        error: {
          code: "JWT_ERROR",
          message: "Failed to generate authentication token",
        },
      },
      500
    );
  }

  // Use root path so cookie is sent with all requests including API calls
  setCookie(c, `sp_token_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    expires: expiresAt,
    path: "/",
  });

  return c.json({
    success: true,
    data: {
      token,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

publicRoutes.post("/status-pages/:slug/verify-oauth", async (c) => {
  const { slug } = c.req.param();
  const body = await c.req.json();
  const { email, userId, sessionToken } = body;

  if (!email) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Email is required",
        },
      },
      400
    );
  }

  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page || !page.published) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Status page not found",
        },
      },
      404
    );
  }

  const authConfig = page.authConfig as {
    protectionMode: string;
    oauthMode?: string;
    allowedEmails?: string[];
    allowedDomains?: string[];
    allowedRoles?: string[];
  } | null;

  const protectionMode = authConfig?.protectionMode || "none";

  if (protectionMode !== "oauth" && protectionMode !== "both") {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_OAUTH_PROTECTED",
          message: "This status page does not use OAuth protection",
        },
      },
      400
    );
  }

  // Check access based on OAuth mode
  const oauthMode = authConfig?.oauthMode || "any_authenticated";
  let accessGranted = false;

  switch (oauthMode) {
    case "any_authenticated":
      // Any authenticated user can access
      accessGranted = true;
      break;

    case "allowlist":
      // Check email and domain allowlists
      const emailDomain = email.split("@")[1]?.toLowerCase();
      const allowedEmails = authConfig?.allowedEmails || [];
      const allowedDomains = authConfig?.allowedDomains || [];

      if (allowedEmails.map((e: string) => e.toLowerCase()).includes(email.toLowerCase())) {
        accessGranted = true;
      } else if (emailDomain && allowedDomains.map((d: string) => d.toLowerCase()).includes(emailDomain)) {
        accessGranted = true;
      }
      break;

    case "org_members":
      // Check if user is a member of the organization
      if (userId) {
        const membership = await db.query.organizationMembers.findFirst({
          where: and(
            eq(organizationMembers.organizationId, page.organizationId),
            eq(organizationMembers.userId, userId)
          ),
        });

        if (membership) {
          // Check role restrictions if specified
          const allowedRoles = authConfig?.allowedRoles;
          if (!allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(membership.role)) {
            accessGranted = true;
          }
        }
      }
      break;
  }

  if (!accessGranted) {
    return c.json(
      {
        success: false,
        error: {
          code: "ACCESS_DENIED",
          message: "You do not have access to this status page",
        },
      },
      403
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  let token: string;
  try {
    token = await sign(
      {
        slug,
        email,
        userId,
        type: "oauth_access",
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      getJwtSecretOrFallback()
    );
  } catch (error) {
    log.error({ err: error }, "JWT signing error");
    return c.json(
      {
        success: false,
        error: {
          code: "JWT_ERROR",
          message: "Failed to generate authentication token",
        },
      },
      500
    );
  }

  setCookie(c, `sp_oauth_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    expires: expiresAt,
    path: "/",
  });

  return c.json({
    success: true,
    data: {
      token,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

publicRoutes.get("/status-pages/:slug/auth-config", async (c) => {
  const { slug } = c.req.param();

  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page || !page.published) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Status page not found",
        },
      },
      404
    );
  }

  const authConfig = page.authConfig as {
    protectionMode: string;
    oauthMode?: string;
  } | null;

  const protectionMode = authConfig?.protectionMode || "none";

  // Get available OAuth providers
  const providers = (protectionMode === "oauth" || protectionMode === "both")
    ? getEnabledGlobalProviders()
    : [];

  return c.json({
    success: true,
    data: {
      protectionMode,
      oauthMode: authConfig?.oauthMode,
      requiresPassword: protectionMode === "password" || protectionMode === "both",
      requiresOAuth: protectionMode === "oauth" || protectionMode === "both",
      providers: providers.map(p => ({ id: p.id, name: p.name })),
      meta: {
        name: page.name,
        logo: page.logo,
      },
    },
  });
});

publicRoutes.post("/status-pages/:slug/subscribe", async (c) => {
  const { slug } = c.req.param();
  const body = await c.req.json();
  const { email } = body;

  if (!email || !email.includes("@")) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address",
        },
      },
      400
    );
  }

  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page || !page.published) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Status page not found",
        },
      },
      404
    );
  }

  const existing = await db.query.subscribers.findFirst({
    where: and(
      eq(subscribers.statusPageId, page.id),
      eq(subscribers.email, email.toLowerCase())
    ),
  });

  if (existing) {
    if (existing.verified) {
      return c.json({
        success: true,
        data: {
          message: "You are already subscribed to this status page",
        },
      });
    }

    await sendSubscriberVerificationEmail({
      email: existing.email,
      statusPageName: page.name,
      statusPageSlug: slug,
      verificationToken: existing.verificationToken!,
    });

    return c.json({
      success: true,
      data: {
        message: "Verification email sent. Please check your inbox.",
      },
    });
  }

  const id = nanoid();
  const verificationToken = nanoid(32);
  const unsubscribeToken = nanoid(32);

  await db.insert(subscribers).values({
    id,
    statusPageId: page.id,
    email: email.toLowerCase(),
    verified: false,
    verificationToken,
    unsubscribeToken,
    channels: { email: true },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await sendSubscriberVerificationEmail({
    email: email.toLowerCase(),
    statusPageName: page.name,
    statusPageSlug: slug,
    verificationToken,
  });

  return c.json({
    success: true,
    data: {
      message: "Verification email sent. Please check your inbox.",
    },
  });
});

publicRoutes.get("/status-pages/:slug/subscribe/verify", async (c) => {
  const { slug } = c.req.param();
  const token = c.req.query("token");

  if (!token) {
    return c.redirect(`/status/${slug}?error=invalid_token`);
  }

  const subscriber = await db.query.subscribers.findFirst({
    where: eq(subscribers.verificationToken, token),
    with: {
      statusPage: true,
    },
  });

  if (!subscriber || subscriber.statusPage.slug !== slug) {
    return c.redirect(`/status/${slug}?error=invalid_token`);
  }

  if (subscriber.verified) {
    return c.redirect(`/status/${slug}?message=already_verified`);
  }

  await db
    .update(subscribers)
    .set({
      verified: true,
      verificationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(subscribers.id, subscriber.id));

  return c.redirect(`/status/${slug}?message=subscribed`);
});

publicRoutes.get("/status-pages/:slug/unsubscribe", async (c) => {
  const { slug } = c.req.param();
  const token = c.req.query("token");

  if (!token) {
    return c.redirect(`/status/${slug}?error=invalid_token`);
  }

  const subscriber = await db.query.subscribers.findFirst({
    where: eq(subscribers.unsubscribeToken, token),
    with: {
      statusPage: true,
    },
  });

  if (!subscriber || subscriber.statusPage.slug !== slug) {
    return c.redirect(`/status/${slug}?error=invalid_token`);
  }

  await db.delete(subscribers).where(eq(subscribers.id, subscriber.id));

  return c.redirect(`/status/${slug}?message=unsubscribed`);
});

publicRoutes.all("/heartbeat/:token", async (c) => {
  const { token } = c.req.param();

  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.heartbeatToken, token),
      eq(monitors.type, "heartbeat")
    ),
  });

  if (!monitor) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Invalid heartbeat token",
        },
      },
      404
    );
  }

  if (monitor.paused) {
    return c.json(
      {
        success: false,
        error: {
          code: "PAUSED",
          message: "Monitor is paused",
        },
      },
      400
    );
  }

  // Parse query params for ping details
  const status = (c.req.query("status") as "start" | "complete" | "fail") || "complete";
  const duration = c.req.query("duration") ? parseInt(c.req.query("duration")!) : undefined;
  const exitCode = c.req.query("exit_code") ? parseInt(c.req.query("exit_code")!) : undefined;

  // Get optional metadata from body (only for POST requests)
  let metadata: Record<string, unknown> | undefined;
  if (c.req.method === "POST") {
    try {
      const body = await c.req.json();
      if (body && typeof body === "object") {
        metadata = body;
      }
    } catch {
      // No body or invalid JSON - that's fine
    }
  }

  const pingId = nanoid();
  const now = new Date();

  // Record the heartbeat ping
  await db.insert(heartbeatPings).values({
    id: pingId,
    monitorId: monitor.id,
    status,
    durationMs: duration,
    exitCode,
    metadata,
    createdAt: now,
  });

  // Update the monitor's lastCheckedAt to reflect activity
  await db
    .update(monitors)
    .set({
      lastCheckedAt: now,
      updatedAt: now,
      // If ping is successful, set status to active; if fail, set to down
      status: status === "fail" ? "down" : "active",
    })
    .where(eq(monitors.id, monitor.id));

  // Publish event for real-time updates
  await publishEvent(`monitor:${monitor.id}`, {
    type: "monitor:heartbeat",
    data: {
      monitorId: monitor.id,
      pingId,
      status,
      durationMs: duration,
      exitCode,
      timestamp: now.toISOString(),
    },
  });

  return c.json({
    success: true,
    data: {
      id: pingId,
      status,
      createdAt: now.toISOString(),
    },
  });
});

// Helper to hash IP address
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

// Helper to get client IP
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

publicRoutes.post("/status-pages/:slug/report-down", async (c) => {
  const { slug } = c.req.param();

  // Get request body
  let body: { monitorId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_JSON", message: "Invalid request body" },
      },
      400
    );
  }

  const { monitorId } = body;
  if (!monitorId) {
    return c.json(
      {
        success: false,
        error: { code: "MISSING_MONITOR_ID", message: "monitorId is required" },
      },
      400
    );
  }

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  // Check if crowdsourced reports are enabled
  const settings = await db.query.crowdsourcedSettings.findFirst({
    where: eq(crowdsourcedSettings.statusPageId, page.id),
  });

  if (!settings?.enabled) {
    return c.json(
      {
        success: false,
        error: {
          code: "DISABLED",
          message: "Crowdsourced reports are not enabled for this status page",
        },
      },
      403
    );
  }

  // Verify monitor is linked to this status page
  const linkedMonitor = await db.query.statusPageMonitors.findFirst({
    where: and(
      eq(statusPageMonitors.statusPageId, page.id),
      eq(statusPageMonitors.monitorId, monitorId)
    ),
  });

  if (!linkedMonitor) {
    return c.json(
      {
        success: false,
        error: {
          code: "MONITOR_NOT_FOUND",
          message: "Monitor not found on this status page",
        },
      },
      404
    );
  }

  // Rate limit check
  const clientIp = getClientIp(c);
  const ipHash = hashIp(clientIp);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentReportsFromIp = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crowdsourcedReports)
    .where(
      and(
        eq(crowdsourcedReports.ipHash, ipHash),
        eq(crowdsourcedReports.statusPageId, page.id),
        gte(crowdsourcedReports.createdAt, oneHourAgo)
      )
    );

  if ((recentReportsFromIp[0]?.count || 0) >= settings.rateLimitPerIp) {
    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMIT",
          message: "Too many reports from your IP address. Please try again later.",
        },
      },
      429
    );
  }

  // Check for duplicate report for this monitor from same IP in last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const duplicateReport = await db.query.crowdsourcedReports.findFirst({
    where: and(
      eq(crowdsourcedReports.ipHash, ipHash),
      eq(crowdsourcedReports.monitorId, monitorId),
      gte(crowdsourcedReports.createdAt, fiveMinutesAgo)
    ),
  });

  if (duplicateReport) {
    // Acknowledge but don't create duplicate
    return c.json({
      success: true,
      data: { acknowledged: true, duplicate: true },
    });
  }

  // Create report
  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.timeWindowMinutes * 60 * 1000);
  const reportId = nanoid();

  await db.insert(crowdsourcedReports).values({
    id: reportId,
    statusPageId: page.id,
    monitorId,
    ipHash,
    userAgent: c.req.header("user-agent") || null,
    createdAt: now,
    expiresAt,
  });

  // Count active reports for this monitor
  const activeReports = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crowdsourcedReports)
    .where(
      and(
        eq(crowdsourcedReports.monitorId, monitorId),
        gte(crowdsourcedReports.expiresAt, now)
      )
    );

  const reportCount = activeReports[0]?.count || 0;

  // Check if threshold reached and auto-degrade is enabled
  if (settings.autoDegradeEnabled && reportCount >= settings.reportThreshold) {
    // Check current monitor status
    const monitor = await db.query.monitors.findFirst({
      where: eq(monitors.id, monitorId),
    });

    if (monitor && monitor.status === "active") {
      // Set to degraded
      await db
        .update(monitors)
        .set({
          status: "degraded",
          updatedAt: now,
        })
        .where(eq(monitors.id, monitorId));

      // Publish SSE event
      await publishEvent(`monitor:${monitorId}`, {
        type: "monitor:crowdsourced_degraded",
        data: {
          monitorId,
          reportCount,
          threshold: settings.reportThreshold,
          timestamp: now.toISOString(),
        },
      });

      log.info({ monitorId, reportCount }, "Monitor set to degraded by crowdsourced reports");
    }
  }

  return c.json({
    success: true,
    data: {
      acknowledged: true,
      reportCount,
      threshold: settings.reportThreshold,
    },
  });
});

// Get current report counts for a status page (for UI display)
publicRoutes.get("/status-pages/:slug/report-counts", async (c) => {
  const { slug } = c.req.param();

  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  const settings = await db.query.crowdsourcedSettings.findFirst({
    where: eq(crowdsourcedSettings.statusPageId, page.id),
  });

  if (!settings?.enabled) {
    return c.json({
      success: true,
      data: { enabled: false, counts: {} },
    });
  }

  const now = new Date();

  // Get counts per monitor
  const counts = await db
    .select({
      monitorId: crowdsourcedReports.monitorId,
      count: sql<number>`count(*)::int`,
    })
    .from(crowdsourcedReports)
    .where(
      and(
        eq(crowdsourcedReports.statusPageId, page.id),
        gte(crowdsourcedReports.expiresAt, now)
      )
    )
    .groupBy(crowdsourcedReports.monitorId);

  const countsMap: Record<string, number> = {};
  for (const row of counts) {
    countsMap[row.monitorId] = row.count;
  }

  return c.json({
    success: true,
    data: {
      enabled: true,
      threshold: settings.reportThreshold,
      counts: countsMap,
    },
  });
});

publicRoutes.post("/status-pages/:slug/components/:monitorId/subscribe", async (c) => {
  const { slug, monitorId } = c.req.param();

  let body: {
    email: string;
    notifyOn?: {
      newIncident?: boolean;
      newMaintenance?: boolean;
      statusChange?: boolean;
    };
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_JSON", message: "Invalid request body" },
      },
      400
    );
  }

  const { email, notifyOn } = body;

  if (!email || !email.includes("@")) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address",
        },
      },
      400
    );
  }

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  // Verify monitor is linked to this status page
  const linkedMonitor = await db.query.statusPageMonitors.findFirst({
    where: and(
      eq(statusPageMonitors.statusPageId, page.id),
      eq(statusPageMonitors.monitorId, monitorId)
    ),
    with: {
      monitor: true,
    },
  });

  if (!linkedMonitor) {
    return c.json(
      {
        success: false,
        error: {
          code: "MONITOR_NOT_FOUND",
          message: "Monitor not found on this status page",
        },
      },
      404
    );
  }

  const normalizedEmail = email.toLowerCase();

  // Check if already subscribed
  const existing = await db.query.componentSubscriptions.findFirst({
    where: and(
      eq(componentSubscriptions.statusPageId, page.id),
      eq(componentSubscriptions.monitorId, monitorId),
      eq(componentSubscriptions.email, normalizedEmail)
    ),
  });

  if (existing) {
    if (existing.verified) {
      return c.json({
        success: true,
        data: {
          message: "You are already subscribed to this component",
        },
      });
    }

    // Resend verification email
    await sendComponentSubscriptionVerificationEmail({
      email: normalizedEmail,
      statusPageName: page.name,
      statusPageSlug: slug,
      monitorName: linkedMonitor.displayName || linkedMonitor.monitor.name,
      verificationToken: existing.verificationToken!,
    });

    return c.json({
      success: true,
      data: {
        message: "Verification email sent. Please check your inbox.",
      },
    });
  }

  // Create new subscription
  const id = nanoid();
  const verificationToken = nanoid(32);
  const unsubscribeToken = nanoid(32);

  const notifyOnDefaults = {
    newIncident: true,
    newMaintenance: true,
    statusChange: false,
  };

  await db.insert(componentSubscriptions).values({
    id,
    statusPageId: page.id,
    monitorId,
    email: normalizedEmail,
    verified: false,
    verificationToken,
    unsubscribeToken,
    channels: { email: true },
    notifyOn: {
      ...notifyOnDefaults,
      ...notifyOn,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Send verification email
  await sendComponentSubscriptionVerificationEmail({
    email: normalizedEmail,
    statusPageName: page.name,
    statusPageSlug: slug,
    monitorName: linkedMonitor.displayName || linkedMonitor.monitor.name,
    verificationToken,
  });

  return c.json({
    success: true,
    data: {
      message: "Verification email sent. Please check your inbox.",
    },
  });
});

publicRoutes.get("/status-pages/:slug/components/:monitorId/subscribe/verify", async (c) => {
  const { slug, monitorId } = c.req.param();
  const token = c.req.query("token");

  if (!token) {
    return c.redirect(`/status/${slug}?error=invalid_token`);
  }

  const subscription = await db.query.componentSubscriptions.findFirst({
    where: eq(componentSubscriptions.verificationToken, token),
    with: {
      statusPage: true,
      monitor: true,
    },
  });

  if (
    !subscription ||
    subscription.statusPage.slug !== slug ||
    subscription.monitorId !== monitorId
  ) {
    return c.redirect(`/status/${slug}?error=invalid_token`);
  }

  if (subscription.verified) {
    return c.redirect(`/status/${slug}?message=already_verified`);
  }

  // Mark as verified
  await db
    .update(componentSubscriptions)
    .set({
      verified: true,
      verificationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(componentSubscriptions.id, subscription.id));

  return c.redirect(`/status/${slug}?message=component_subscribed`);
});

// Unsubscribe from component notifications (via token in URL)
publicRoutes.get("/components/unsubscribe", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid or missing token" },
      },
      400
    );
  }

  const subscription = await db.query.componentSubscriptions.findFirst({
    where: eq(componentSubscriptions.unsubscribeToken, token),
    with: {
      statusPage: true,
    },
  });

  if (!subscription) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Subscription not found" },
      },
      404
    );
  }

  // Delete subscription
  await db
    .delete(componentSubscriptions)
    .where(eq(componentSubscriptions.id, subscription.id));

  // Redirect to status page with message
  return c.redirect(`/status/${subscription.statusPage.slug}?message=unsubscribed`);
});

// Get subscriber count for a component (for UI display)
publicRoutes.get("/status-pages/:slug/components/:monitorId/subscribers/count", async (c) => {
  const { slug, monitorId } = c.req.param();

  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  // Count verified subscribers
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(componentSubscriptions)
    .where(
      and(
        eq(componentSubscriptions.statusPageId, page.id),
        eq(componentSubscriptions.monitorId, monitorId),
        eq(componentSubscriptions.verified, true)
      )
    );

  return c.json({
    success: true,
    data: {
      count: result[0]?.count || 0,
    },
  });
});

publicRoutes.get("/status-pages/:slug/components/:monitorId/subscription-status", async (c) => {
  const { slug, monitorId } = c.req.param();
  const email = c.req.query("email");

  if (!email) {
    return c.json({
      success: true,
      data: { isSubscribed: false },
    });
  }

  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  const subscription = await db.query.componentSubscriptions.findFirst({
    where: and(
      eq(componentSubscriptions.statusPageId, page.id),
      eq(componentSubscriptions.monitorId, monitorId),
      eq(componentSubscriptions.email, email.toLowerCase()),
      eq(componentSubscriptions.verified, true)
    ),
  });

  return c.json({
    success: true,
    data: {
      isSubscribed: !!subscription,
      notifyOn: subscription?.notifyOn || null,
    },
  });
});

// Get services data for status page services view
// Provides detailed monitor/component data with metrics, dependencies, and type-specific info
publicRoutes.get("/status-pages/:slug/services", async (c) => {
  const { slug } = c.req.param();
  const groupBy = c.req.query("groupBy") || "group"; // group, type, region, status, none

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  // Respect geo visibility setting
  if (page.settings?.showGeoMap === false) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Geo view is disabled for this status page" },
      },
      404
    );
  }

  // Fetch linked monitors with their status and details
  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
    orderBy: [statusPageMonitors.order],
    with: {
      monitor: true,
    },
  });

  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  if (monitorIds.length === 0) {
    return c.json({
      success: true,
      data: {
        services: [],
        groups: {},
        activeIncidentsCount: 0,
      },
    });
  }

  // Get daily aggregate data for last 30 days (for P50/P95/P99)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyAggregates = await db
    .select({
      monitorId: checkResultsDaily.monitorId,
      avgResponseTimeMs: sql<number>`AVG(${checkResultsDaily.avgResponseTimeMs})`.as("avg_response"),
      p50ResponseTimeMs: sql<number>`AVG(${checkResultsDaily.p50ResponseTimeMs})`.as("p50"),
      p95ResponseTimeMs: sql<number>`AVG(${checkResultsDaily.p95ResponseTimeMs})`.as("p95"),
      p99ResponseTimeMs: sql<number>`AVG(${checkResultsDaily.p99ResponseTimeMs})`.as("p99"),
      totalSuccessCount: sql<number>`SUM(${checkResultsDaily.successCount})`.as("success_count"),
      totalDegradedCount: sql<number>`SUM(${checkResultsDaily.degradedCount})`.as("degraded_count"),
      totalFailureCount: sql<number>`SUM(${checkResultsDaily.failureCount})`.as("failure_count"),
      totalCount: sql<number>`SUM(${checkResultsDaily.totalCount})`.as("total_count"),
    })
    .from(checkResultsDaily)
    .where(
      and(
        inArray(checkResultsDaily.monitorId, monitorIds),
        gte(checkResultsDaily.date, thirtyDaysAgo)
      )
    )
    .groupBy(checkResultsDaily.monitorId);

  // Build a map for easy lookup
  const aggregatesByMonitor = new Map(
    dailyAggregates.map((agg) => [agg.monitorId, agg])
  );

  // Get dependencies for each monitor
  const dependencies = await db
    .select({
      downstreamMonitorId: monitorDependencies.downstreamMonitorId,
      upstreamMonitorId: monitorDependencies.upstreamMonitorId,
      description: monitorDependencies.description,
    })
    .from(monitorDependencies)
    .where(
      or(
        inArray(monitorDependencies.downstreamMonitorId, monitorIds),
        inArray(monitorDependencies.upstreamMonitorId, monitorIds)
      )
    );

  // Build dependency maps
  const upstreamDeps = new Map<string, Array<{ id: string; description?: string | null }>>();
  const downstreamDeps = new Map<string, Array<{ id: string; description?: string | null }>>();

  for (const dep of dependencies) {
    // Upstream: this monitor depends on these
    const upList = upstreamDeps.get(dep.downstreamMonitorId) || [];
    upList.push({ id: dep.upstreamMonitorId, description: dep.description });
    upstreamDeps.set(dep.downstreamMonitorId, upList);

    // Downstream: these depend on this monitor
    const downList = downstreamDeps.get(dep.upstreamMonitorId) || [];
    downList.push({ id: dep.downstreamMonitorId, description: dep.description });
    downstreamDeps.set(dep.upstreamMonitorId, downList);
  }

  // Get active incidents
  const activeIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      eq(incidents.status, "investigating")
    ),
  });

  // Build active incidents per monitor
  const activeIncidentsByMonitor = new Map<string, Array<{ id: string; title: string; severity: string }>>();
  for (const incident of activeIncidents) {
    const affectedMonitors = incident.affectedMonitors || [];
    for (const monitorId of affectedMonitors) {
      if (monitorIds.includes(monitorId as string)) {
        const list = activeIncidentsByMonitor.get(monitorId as string) || [];
        list.push({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
        });
        activeIncidentsByMonitor.set(monitorId as string, list);
      }
    }
  }

  // Get certificate info for SSL/HTTPS monitors
  const sslMonitorIds = linkedMonitors
    .filter((lm) => lm.monitor.type === "ssl" || lm.monitor.type === "https")
    .map((lm) => lm.monitorId);

  const certificateInfoByMonitor = new Map<string, {
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysUntilExpiry?: number;
  }>();

  if (sslMonitorIds.length > 0) {
    for (const monitorId of sslMonitorIds) {
      const latestResult = await db.query.checkResults.findFirst({
        where: and(
          eq(checkResults.monitorId, monitorId),
          sql`${checkResults.certificateInfo} IS NOT NULL`
        ),
        orderBy: [desc(checkResults.createdAt)],
      });
      if (latestResult?.certificateInfo) {
        certificateInfoByMonitor.set(monitorId, latestResult.certificateInfo);
      }
    }
  }

  // Get email auth info for email_auth monitors
  const emailAuthMonitorIds = linkedMonitors
    .filter((lm) => lm.monitor.type === "email_auth")
    .map((lm) => lm.monitorId);

  const emailAuthInfoByMonitor = new Map<string, {
    overallScore: number;
    spfStatus: "pass" | "fail" | "none" | "error";
    dkimStatus: "pass" | "partial" | "fail" | "none" | "error";
    dmarcStatus: "pass" | "fail" | "none" | "error";
  }>();

  if (emailAuthMonitorIds.length > 0) {
    for (const monitorId of emailAuthMonitorIds) {
      const latestResult = await db.query.checkResults.findFirst({
        where: and(
          eq(checkResults.monitorId, monitorId),
          sql`${checkResults.emailAuthDetails} IS NOT NULL`
        ),
        orderBy: [desc(checkResults.createdAt)],
      });
      if (latestResult?.emailAuthDetails) {
        const details = latestResult.emailAuthDetails as {
          overallScore?: number;
          spf?: { status?: string };
          dkim?: { status?: string };
          dmarc?: { status?: string };
        };
        emailAuthInfoByMonitor.set(monitorId, {
          overallScore: details.overallScore ?? 0,
          spfStatus: (details.spf?.status || "none") as "pass" | "fail" | "none" | "error",
          dkimStatus: (details.dkim?.status || "none") as "pass" | "partial" | "fail" | "none" | "error",
          dmarcStatus: (details.dmarc?.status || "none") as "pass" | "fail" | "none" | "error",
        });
      }
    }
  }

  // Get heartbeat info for heartbeat monitors
  const heartbeatMonitorIds = linkedMonitors
    .filter((lm) => lm.monitor.type === "heartbeat")
    .map((lm) => lm.monitorId);

  const heartbeatInfoByMonitor = new Map<string, {
    lastPingAt: string | null;
    expectedIntervalSeconds: number;
    missedBeats: number;
  }>();

  if (heartbeatMonitorIds.length > 0) {
    for (const monitorId of heartbeatMonitorIds) {
      const latestPing = await db.query.heartbeatPings.findFirst({
        where: eq(heartbeatPings.monitorId, monitorId),
        orderBy: [desc(heartbeatPings.createdAt)],
      });

      const monitorData = linkedMonitors.find((lm) => lm.monitorId === monitorId)?.monitor;
      const heartbeatConfig = monitorData?.config as { heartbeat?: { expectedIntervalSeconds?: number } } | null;
      const expectedInterval = heartbeatConfig?.heartbeat?.expectedIntervalSeconds ?? 60;

      const missedBeats = latestPing && monitorData?.lastCheckedAt
        ? Math.max(0, Math.floor(
            (Date.now() - new Date(latestPing.createdAt).getTime()) / (expectedInterval * 1000)
          ) - 1)
        : 0;

      heartbeatInfoByMonitor.set(monitorId, {
        lastPingAt: latestPing?.createdAt.toISOString() || null,
        expectedIntervalSeconds: expectedInterval,
        missedBeats,
      });
    }
  }

  // Build service data
  const servicesBase = linkedMonitors.map((lm) => {
    const monitor = lm.monitor;
    const agg = aggregatesByMonitor.get(monitor.id);

    // Calculate uptime percentage
    let uptimePercentage: number | null = null;
    if (agg && agg.totalCount > 0) {
      const successCount = Number(agg.totalSuccessCount) || 0;
      const degradedCount = Number(agg.totalDegradedCount) || 0;
      const totalCount = Number(agg.totalCount) || 0;
      uptimePercentage = Number((((successCount + degradedCount) / totalCount) * 100).toFixed(2));
    }

    return {
      id: monitor.id,
      name: lm.displayName || monitor.name,
      description: monitor.description,
      type: monitor.type,
      status: monitor.status,
      group: lm.group,
      order: lm.order,
      regions: monitor.regions,
      lastCheckedAt: monitor.lastCheckedAt,
      metrics: agg ? {
        p50: Math.round(Number(agg.p50ResponseTimeMs) || 0),
        p95: Math.round(Number(agg.p95ResponseTimeMs) || 0),
        p99: Math.round(Number(agg.p99ResponseTimeMs) || 0),
        avgResponseTimeMs: Math.round(Number(agg.avgResponseTimeMs) || 0),
      } : null,
      uptimePercentage,
      dependencies: {
        upstream: upstreamDeps.get(monitor.id) || [],
        downstream: downstreamDeps.get(monitor.id) || [],
      },
      activeIncidents: activeIncidentsByMonitor.get(monitor.id) || [],
      // Type-specific data
      certificateInfo: certificateInfoByMonitor.get(monitor.id) || undefined,
      emailAuthInfo: emailAuthInfoByMonitor.get(monitor.id) || undefined,
      heartbeatInfo: heartbeatInfoByMonitor.get(monitor.id) || undefined,
    };
  });
  const services = servicesBase;

  // Group services based on query parameter
  type ServiceType = typeof services[number];
  const groups: Record<string, ServiceType[]> = {};

  if (groupBy !== "none") {
    for (const service of services) {
      let groupKey: string;

      switch (groupBy) {
        case "type":
          groupKey = service.type;
          break;
        case "region":
          groupKey = service.regions?.[0] || "Unknown";
          break;
        case "status":
          groupKey = service.status;
          break;
        case "group":
        default:
          groupKey = service.group || "Ungrouped";
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      const group = groups[groupKey] ?? [];
      group.push(service);
      groups[groupKey] = group;
    }
  }

  return c.json({
    success: true,
    data: {
      services,
      groups: groupBy !== "none" ? groups : {},
      groupBy,
      activeIncidentsCount: activeIncidents.length,
      settings: {
        subscriptions: page.settings?.subscriptions !== false,
        crowdsourcedReporting: page.settings?.crowdsourcedReporting || false,
        showGeoMap: page.settings?.showGeoMap ?? true,
      },
    },
  });
});

// Region coordinates for map display
const REGION_COORDINATES: Record<string, { coordinates: [number, number]; city: string; country: string }> = {
  uk: { coordinates: [51.5074, -0.1278], city: "London", country: "United Kingdom" },
  "us-east": { coordinates: [38.9072, -77.0369], city: "Washington D.C.", country: "United States" },
  "us-west": { coordinates: [37.7749, -122.4194], city: "San Francisco", country: "United States" },
  "eu-west": { coordinates: [53.3498, -6.2603], city: "Dublin", country: "Ireland" },
  "eu-central": { coordinates: [50.1109, 8.6821], city: "Frankfurt", country: "Germany" },
  "ap-southeast": { coordinates: [1.3521, 103.8198], city: "Singapore", country: "Singapore" },
  "ap-northeast": { coordinates: [35.6762, 139.6503], city: "Tokyo", country: "Japan" },
  "sa-east": { coordinates: [-23.5505, -46.6333], city: "Sao Paulo", country: "Brazil" },
  "au-southeast": { coordinates: [-33.8688, 151.2093], city: "Sydney", country: "Australia" },
};

const isKnownRegion = (region?: string | null): region is keyof typeof REGION_COORDINATES =>
  !!region && region in REGION_COORDINATES;

publicRoutes.get("/status-pages/:slug/geo", async (c) => {
  const { slug } = c.req.param();

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Status page not found" },
      },
      404
    );
  }

  // Fetch linked monitors with their status and details
  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
    orderBy: [statusPageMonitors.order],
    with: {
      monitor: true,
    },
  });

  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  if (monitorIds.length === 0) {
    return c.json({
      success: true,
      data: {
        regions: [],
        monitors: [],
        probes: { public: [], private: [] },
        incidents: [],
        quorumConnections: [],
        settings: {
          showPublicProbes: true,
          showPrivateProbes: false,
          quorumRequired: 1,
        },
      },
    });
  }

  // Get daily aggregate data for last 7 days (for P50/P95/P99 per region)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyAggregates = await db
    .select({
      monitorId: checkResultsDaily.monitorId,
      region: checkResultsDaily.region,
      p50ResponseTimeMs: sql<number>`AVG(${checkResultsDaily.p50ResponseTimeMs})`.as("p50"),
      p95ResponseTimeMs: sql<number>`AVG(${checkResultsDaily.p95ResponseTimeMs})`.as("p95"),
      p99ResponseTimeMs: sql<number>`AVG(${checkResultsDaily.p99ResponseTimeMs})`.as("p99"),
      totalCount: sql<number>`SUM(${checkResultsDaily.totalCount})`.as("total_count"),
    })
    .from(checkResultsDaily)
    .where(
      and(
        inArray(checkResultsDaily.monitorId, monitorIds),
        gte(checkResultsDaily.date, sevenDaysAgo)
      )
    )
    .groupBy(checkResultsDaily.monitorId, checkResultsDaily.region);

  // Build latency by region for each monitor
  const latencyByMonitorRegion = new Map<string, Map<string, { p50: number; p95: number; p99: number }>>();
  for (const agg of dailyAggregates) {
    if (!agg.region) continue;

    let monitorMap = latencyByMonitorRegion.get(agg.monitorId);
    if (!monitorMap) {
      monitorMap = new Map();
      latencyByMonitorRegion.set(agg.monitorId, monitorMap);
    }
    monitorMap.set(agg.region, {
      p50: Math.round(Number(agg.p50ResponseTimeMs) || 0),
      p95: Math.round(Number(agg.p95ResponseTimeMs) || 0),
      p99: Math.round(Number(agg.p99ResponseTimeMs) || 0),
    });
  }

  // Get active incidents
  const activeIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      ne(incidents.status, "resolved")
    ),
    orderBy: [desc(incidents.startedAt)],
  });

  // Filter to incidents affecting our monitors and build affected regions
  const filteredIncidents = activeIncidents
    .filter((incident) => {
      const affectedMonitors = incident.affectedMonitors || [];
      return affectedMonitors.some((mid: string) => monitorIds.includes(mid));
    })
    .map((incident) => {
      // Get affected regions from affected monitors
      const affectedRegions = new Set<string>();
      const affectedMonitorsList = incident.affectedMonitors || [];
      for (const mid of affectedMonitorsList) {
        const linkedMonitor = linkedMonitors.find((lm) => lm.monitorId === mid);
        if (linkedMonitor?.monitor.regions) {
          for (const region of linkedMonitor.monitor.regions as string[]) {
            affectedRegions.add(region);
          }
        }
      }

      return {
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        affectedRegions: Array.from(affectedRegions),
        affectedMonitorIds: affectedMonitorsList.filter((mid: string) => monitorIds.includes(mid)),
        startedAt: incident.startedAt.toISOString(),
      };
    });

  // Get incident monitor IDs for quick lookup
  const incidentMonitorIds = new Set<string>();
  for (const incident of filteredIncidents) {
    for (const mid of incident.affectedMonitorIds) {
      incidentMonitorIds.add(mid);
    }
  }

  // Build monitors data with latency by region
  const geoMonitors = linkedMonitors.map((lm) => {
    const monitor = lm.monitor;
    const latencyMap = latencyByMonitorRegion.get(monitor.id);
    const latencyByRegion: Record<string, { p50: number; p95: number; p99: number }> = {};

    if (latencyMap) {
      for (const [region, latency] of latencyMap.entries()) {
        latencyByRegion[region] = latency;
      }
    }

    return {
      id: monitor.id,
      name: lm.displayName || monitor.name,
      type: monitor.type,
      status: monitor.status,
      regions: monitor.regions || [],
      latencyByRegion,
      hasActiveIncident: incidentMonitorIds.has(monitor.id),
    };
  });

  // Aggregate region data
  const regionStats = new Map<string, {
    status: "active" | "degraded" | "down" | "pending";
    probeCount: number;
    monitorCount: number;
    latencies: Array<{ p50: number; p95: number; p99: number }>;
  }>();

  // Count monitors per region and aggregate status
  for (const monitor of geoMonitors) {
    const regions = monitor.regions as string[];
    for (const region of regions) {
      let stats = regionStats.get(region);
      if (!stats) {
        stats = {
          status: "active",
          probeCount: 0,
          monitorCount: 0,
          latencies: [],
        };
        regionStats.set(region, stats);
      }
      stats.monitorCount++;

      // Aggregate latency
      if (monitor.latencyByRegion[region]) {
        stats.latencies.push(monitor.latencyByRegion[region]);
      }

      // Aggregate status (worst status wins)
      if (monitor.status === "down" || monitor.hasActiveIncident) {
        stats.status = "down";
      } else if (monitor.status === "degraded" && stats.status !== "down") {
        stats.status = "degraded";
      } else if (monitor.status === "pending" && stats.status === "active") {
        stats.status = "pending";
      }
    }
  }

  // Build regions array
  const geoRegions = Array.from(regionStats.entries()).map(([regionId, stats]) => {
    const regionCoords = REGION_COORDINATES[regionId];

    // Calculate average latency for region
    let latency: { p50: number; p95: number; p99: number } | null = null;
    if (stats.latencies.length > 0) {
      const sumP50 = stats.latencies.reduce((sum, l) => sum + l.p50, 0);
      const sumP95 = stats.latencies.reduce((sum, l) => sum + l.p95, 0);
      const sumP99 = stats.latencies.reduce((sum, l) => sum + l.p99, 0);
      latency = {
        p50: Math.round(sumP50 / stats.latencies.length),
        p95: Math.round(sumP95 / stats.latencies.length),
        p99: Math.round(sumP99 / stats.latencies.length),
      };
    }

    return {
      id: regionId,
      name: regionCoords?.city || regionId,
      location: regionCoords?.country || "Unknown",
      coordinates: regionCoords?.coordinates || [0, 0] as [number, number],
      flag: regionId.split("-")[0] || regionId,
      status: stats.status,
      probeCount: stats.probeCount,
      monitorCount: stats.monitorCount,
      latency,
    };
  });

  const orgProbes = await db.query.probes.findMany({
    where: and(
      eq(probes.organizationId, page.organizationId),
      or(eq(probes.status, "active"), eq(probes.status, "offline"))
    ),
  });

  const geoProbes = {
    public: [] as Array<{
      id: string;
      name: string;
      region: string;
      coordinates: [number, number];
      status: "pending" | "active" | "offline" | "disabled";
      lastHeartbeatAt: string | null;
      isPrivate: boolean;
      version?: string;
    }>,
    private: orgProbes
      .filter(
        (probe): probe is typeof orgProbes[number] & { region: keyof typeof REGION_COORDINATES } =>
          isKnownRegion(probe.region)
      )
      .map((probe) => ({
        id: probe.id,
        name: probe.name,
        region: probe.region,
        coordinates: REGION_COORDINATES[probe.region]!.coordinates as [number, number],
        status: probe.status,
        lastHeartbeatAt: probe.lastHeartbeatAt?.toISOString() || null,
        isPrivate: true,
        version: probe.version || undefined,
      })),
  };

  // Build quorum connections (connections between regions for multi-region monitors)
  const quorumConnections: Array<{
    fromRegion: string;
    toRegion: string;
    status: "healthy" | "degraded" | "down";
    latencyMs: number;
  }> = [];

  // Find monitors that span multiple regions and create connections
  for (const monitor of geoMonitors) {
    const regions = monitor.regions as string[];
    if (regions.length > 1) {
      // Create connections between all pairs of regions for this monitor
      for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) {
          const fromRegion = regions[i];
          const toRegion = regions[j];
          if (!fromRegion || !toRegion) {
            continue;
          }

          // Check if connection already exists
          const existingConnection = quorumConnections.find(
            (conn) =>
              (conn.fromRegion === fromRegion && conn.toRegion === toRegion) ||
              (conn.fromRegion === toRegion && conn.toRegion === fromRegion)
          );

          if (!existingConnection) {
            // Calculate average latency between regions
            const fromLatency = monitor.latencyByRegion[fromRegion];
            const toLatency = monitor.latencyByRegion[toRegion];
            const avgLatency = fromLatency && toLatency
              ? Math.round((fromLatency.p50 + toLatency.p50) / 2)
              : 0;

            // Determine connection status based on monitor status
            let connectionStatus: "healthy" | "degraded" | "down" = "healthy";
            if (monitor.status === "down" || monitor.hasActiveIncident) {
              connectionStatus = "down";
            } else if (monitor.status === "degraded") {
              connectionStatus = "degraded";
            }

            quorumConnections.push({
              fromRegion,
              toRegion,
              status: connectionStatus,
              latencyMs: avgLatency,
            });
          }
        }
      }
    }
  }

  return c.json({
    success: true,
    data: {
      regions: geoRegions,
      monitors: geoMonitors,
      probes: geoProbes,
      incidents: filteredIncidents,
      quorumConnections,
      settings: {
        showPublicProbes: true,
        showPrivateProbes: false,
        quorumRequired: 1,
      },
    },
  });
});

// Helper to generate ICS content for an event
function generateEventICS(event: {
  id: string;
  type: "incident" | "maintenance";
  title: string;
  description: string | null;
  status: string;
  severity: string;
  startedAt: string;
  endedAt: string | null;
  updates?: Array<{ status: string; message: string; createdAt: string }>;
  affectedMonitorNames?: string[];
}): string {
  const now = new Date();
  const startDate = new Date(event.startedAt);
  const endDate = event.endedAt ? new Date(event.endedAt) : new Date(startDate.getTime() + 3600000); // Default 1 hour

  const formatDate = (d: Date): string => {
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const escapeText = (text: string): string => {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  };

  let description: string;
  if (event.type === "incident") {
    const updatesList = event.updates?.map((u) => `[${u.status}] ${u.message}`).join("\\n") || "";
    description = `Status: ${event.status}\\nSeverity: ${event.severity}\\n\\n${event.description || ""}`;
    if (updatesList) {
      description += `\\n\\nUpdates:\\n${updatesList}`;
    }
  } else {
    const services = event.affectedMonitorNames?.join(", ") || "None specified";
    description = `${event.description || ""}\\n\\nAffected services: ${services}`;
  }

  const summary = event.type === "incident"
    ? `[${event.severity.toUpperCase()}] ${event.title}`
    : `[MAINTENANCE] ${event.title}`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Uni Status//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@uni-status`,
    `DTSTAMP:${formatDate(now)}`,
    `DTSTART:${formatDate(startDate)}`,
    `DTEND:${formatDate(endDate)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `STATUS:${event.status === "resolved" || event.status === "completed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// Export individual event to ICS or JSON (public, no auth required)
publicRoutes.get("/status-pages/:slug/events/:type/:id/export", async (c) => {
  const { slug, type, id } = c.req.param();
  const format = c.req.query("format") || "json";

  if (type !== "incident" && type !== "maintenance") {
    return c.json({ success: false, error: { code: "INVALID_TYPE", message: "Invalid event type" } }, 400);
  }

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Status page not found" } }, 404);
  }

  let eventData: {
    id: string;
    type: "incident" | "maintenance";
    title: string;
    description: string | null;
    status: string;
    severity: string;
    startedAt: string;
    endedAt: string | null;
    updates: Array<{ id: string; status: string; message: string; createdAt: string }>;
    affectedMonitors: string[];
    affectedMonitorNames: string[];
    createdAt: string;
    updatedAt: string;
  } | null = null;

  if (type === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.id, id),
        eq(incidents.organizationId, page.organizationId)
      ),
      with: {
        updates: {
          orderBy: [desc(incidentUpdates.createdAt)],
        },
      },
    });

    if (!incident) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
    }

    // Get monitor names
    const affectedMonitorIds = (incident.affectedMonitors || []) as string[];
    let monitorNames: string[] = [];
    if (affectedMonitorIds.length > 0) {
      const monitorData = await db
        .select({ name: monitors.name })
        .from(monitors)
        .where(inArray(monitors.id, affectedMonitorIds));
      monitorNames = monitorData.map((m) => m.name);
    }

    eventData = {
      id: incident.id,
      type: "incident",
      title: incident.title,
      description: incident.message,
      status: incident.status,
      severity: incident.severity,
      startedAt: incident.startedAt.toISOString(),
      endedAt: incident.resolvedAt?.toISOString() || null,
      updates: incident.updates.map((u) => ({
        id: u.id,
        status: u.status,
        message: u.message,
        createdAt: u.createdAt.toISOString(),
      })),
      affectedMonitors: affectedMonitorIds,
      affectedMonitorNames: monitorNames,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    };
  } else {
    const maintenance = await db.query.maintenanceWindows.findFirst({
      where: and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, page.organizationId)
      ),
    });

    if (!maintenance) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Event not found" } }, 404);
    }

    // Get monitor names
    const affectedMonitorIds = (maintenance.affectedMonitors || []) as string[];
    let monitorNames: string[] = [];
    if (affectedMonitorIds.length > 0) {
      const monitorData = await db
        .select({ name: monitors.name })
        .from(monitors)
        .where(inArray(monitors.id, affectedMonitorIds));
      monitorNames = monitorData.map((m) => m.name);
    }

    const computedStatus = getMaintenanceStatus(maintenance.startsAt, maintenance.endsAt);

    eventData = {
      id: maintenance.id,
      type: "maintenance",
      title: maintenance.name,
      description: maintenance.description,
      status: computedStatus,
      severity: "maintenance",
      startedAt: maintenance.startsAt.toISOString(),
      endedAt: maintenance.endsAt.toISOString(),
      updates: [],
      affectedMonitors: affectedMonitorIds,
      affectedMonitorNames: monitorNames,
      createdAt: maintenance.createdAt.toISOString(),
      updatedAt: maintenance.updatedAt.toISOString(),
    };
  }

  if (format === "ics") {
    const icsContent = generateEventICS(eventData);
    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${eventData.type}-${eventData.id}.ics"`);
    c.header("Cache-Control", "no-cache");
    return c.body(icsContent);
  }

  // Default to JSON
  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${eventData.type}-${eventData.id}.json"`);
  c.header("Cache-Control", "no-cache");
  return c.json({
    success: true,
    data: eventData,
  });
});

// Helper to determine maintenance window status (duplicated for this file scope)
function getMaintenanceStatus(startsAt: Date, endsAt: Date): "scheduled" | "active" | "completed" {
  const now = new Date();
  if (now < startsAt) return "scheduled";
  if (now > endsAt) return "completed";
  return "active";
}

// ============================================================================
// Domain Lookup (Internal API for middleware)
// ============================================================================

// Look up status page slug by custom domain
// This is used by the Next.js middleware which runs in Edge runtime
// and cannot directly query the database
publicRoutes.get("/internal/domain-lookup", async (c) => {
  const domain = c.req.query("domain");

  if (!domain) {
    return c.json({ success: false, error: "Missing domain parameter" }, 400);
  }

  try {
    const page = await db.query.statusPages.findFirst({
      where: or(
        eq(statusPages.customDomain, domain),
        eq(statusPages.customDomain, domain.split(":")[0]!) // Without port
      ),
      columns: { slug: true, published: true },
    });

    if (!page) {
      return c.json({ success: false, slug: null }, 200);
    }

    // Only return published pages
    if (!page.published) {
      return c.json({ success: false, slug: null, reason: "not_published" }, 200);
    }

    return c.json({ success: true, slug: page.slug }, 200);
  } catch (error) {
    log.error({ err: error }, "Domain lookup error");
    return c.json({ success: false, error: "Database error" }, 500);
  }
});
