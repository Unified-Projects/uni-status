import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";

import { authMiddleware } from "./middleware/auth";
import { rateLimiter } from "./middleware/rate-limit";
import { errorHandler } from "./middleware/error";
import { versioningMiddleware } from "./middleware/versioning";
import { createLicenseMiddleware } from "@uni-status/enterprise/api/middleware/license";
import { getUploadDir, ensureUploadDir, isS3Enabled } from "./lib/uploads";
import {
  getApiUrl,
  getCorsConfig,
  getStorageConfig,
} from "@uni-status/shared/config";
import { db, statusPages } from "@uni-status/database";
import { isNotNull } from "drizzle-orm";
import type { Context, Next } from "hono";

// Route imports
import { healthRoutes } from "./routes/health";
import { apiMetaRoutes } from "./routes/api-meta";
import { graphqlRoutes } from "./routes/graphql";
import { monitorsRoutes } from "./routes/monitors";
import { monitorDependenciesRoutes } from "./routes/monitor-dependencies";
import { incidentsRoutes } from "./routes/incidents";
import { statusPagesRoutes } from "./routes/status-pages";
import { statusPageThemesRoutes } from "./routes/status-page-themes";
import { alertsRoutes } from "./routes/alerts";
import { organizationsRoutes } from "./routes/organizations";
import { sseRoutes } from "./routes/sse";
import { websocketRoutes } from "./routes/ws";
import { publicRoutes } from "./routes/public";
import { maintenanceWindowsRoutes } from "./routes/maintenance-windows";
import { embedsRoutes } from "./routes/embeds";
import { deploymentsRoutes } from "./routes/deployments";
import { probesRoutes } from "./routes/probes";
import { uploadsRoutes } from "./routes/uploads";
import { feedsRoutes } from "./routes/feeds";
import { ogRoutes } from "./routes/og";
import { certificatesRoutes } from "./routes/certificates";
import { regionsRoutes } from "./routes/regions";
import { remoteWriteRoutes } from "./routes/remote-write";
import { eventsRoutes } from "./routes/events";
import { publicEventsRoutes } from "./routes/public-events";
import { ssoRoutes, ssoPublicRoutes } from "./routes/sso";
import { invitationsRoutes } from "./routes/invitations";
import { systemRoutes } from "./routes/system";
import { pendingApprovalsRoutes } from "./routes/pending-approvals";
import { sessionVerifyRoutes } from "./routes/session-verify";
import { s3ProxyRoutes } from "./routes/s3-proxy";

// Create app with OpenAPI support
export const app = new OpenAPIHono();

// CORS origins cache
let cachedCorsOrigins: string[] | null = null;
let cachedStatusPageDomains: Set<string> | null = null;
let corsOriginsLastUpdated = 0;
const CORS_CACHE_TTL = 60000; // 1 minute

async function buildCorsOrigins(): Promise<{ origins: string[]; statusPageDomains: Set<string> }> {
  const corsConfig = getCorsConfig();
  const origins = new Set<string>(corsConfig.origins);
  const statusPageDomains = new Set<string>();

  // Query status page custom domains
  try {
    const pages = await db.query.statusPages.findMany({
      where: isNotNull(statusPages.customDomain),
      columns: { customDomain: true },
    });

    for (const page of pages) {
      if (page.customDomain) {
        const httpsOrigin = `https://${page.customDomain}`;
        const httpOrigin = `http://${page.customDomain}`;
        origins.add(httpsOrigin);
        origins.add(httpOrigin);
        statusPageDomains.add(httpsOrigin);
        statusPageDomains.add(httpOrigin);
      }
    }
  } catch (error) {
    console.warn("[CORS] Failed to load custom domains:", error);
  }

  return {
    origins: Array.from(origins),
    statusPageDomains,
  };
}

async function getCorsOrigins(): Promise<string[]> {
  const now = Date.now();
  if (!cachedCorsOrigins || now - corsOriginsLastUpdated > CORS_CACHE_TTL) {
    const result = await buildCorsOrigins();
    cachedCorsOrigins = result.origins;
    cachedStatusPageDomains = result.statusPageDomains;
    corsOriginsLastUpdated = now;
  }
  return cachedCorsOrigins;
}

async function getStatusPageDomains(): Promise<Set<string>> {
  const now = Date.now();
  if (!cachedStatusPageDomains || !cachedCorsOrigins || now - corsOriginsLastUpdated > CORS_CACHE_TTL) {
    const result = await buildCorsOrigins();
    cachedCorsOrigins = result.origins;
    cachedStatusPageDomains = result.statusPageDomains;
    corsOriginsLastUpdated = now;
  }
  return cachedStatusPageDomains!;
}

// Global middleware
app.use("*", logger());
app.use("*", timing());
app.use("*", secureHeaders());

// Dynamic CORS middleware (skip health check routes to avoid DB dependency)
const corsConfig = getCorsConfig();
if (corsConfig.enabled) {
  app.use("*", async (c: Context, next: Next) => {
    // Skip CORS processing for health check endpoints - they must work without DB
    const path = c.req.path;
    if (path === "/health" || path === "/api/health" || path === "/api/v1/health") {
      return next();
    }

    const origins = await getCorsOrigins();
    const statusPageDomains = await getStatusPageDomains();

    const corsMiddleware = cors({
      origin: async (origin, reqContext) => {
        // Check if this is a status page custom domain
        if (statusPageDomains.has(origin)) {
          // Allow public API paths for custom domains (status page data, feeds, uploads, etc.)
          const path = reqContext.req.path;
          const allowedPaths = [
            "/",
            "/api/public",
            "/api/uploads",
            "/uploads",
          ];
          const isAllowed = allowedPaths.some(allowed =>
            path === allowed || path.startsWith(`${allowed}/`)
          );
          if (isAllowed) {
            return origin;
          }
          return null;
        }

        // Allow other configured origins for all paths
        if (origins.includes(origin)) {
          return origin;
        }

        return null;
      },
      credentials: true,
    });
    return corsMiddleware(c, next);
  });
}

// Version negotiation / discovery headers
app.use("/api/*", versioningMiddleware);

// Error handler
app.onError(errorHandler);

// Static file serving for uploads (local filesystem)
// Note: When S3 is enabled, uploads are served directly from S3 via absolute URLs
// Local static serving is still enabled for backwards compatibility with existing files
const uploadDir = getUploadDir();
ensureUploadDir();
app.use("/uploads/*", serveStatic({ root: uploadDir, rewriteRequestPath: (path) => path.replace(/^\/uploads/, "") }));
app.use(
  "/api/uploads/*",
  serveStatic({
    root: uploadDir,
    // Strip the /api/uploads prefix so files are resolved from the uploads directory
    rewriteRequestPath: (path) => path.replace(/^\/api\/uploads/, ""),
  })
);
// Serve generated reports (local filesystem storage)
// Note: When S3 is enabled, reports are served directly from S3 via absolute URLs
const reportsDir = getStorageConfig().reportsDir;
app.use("/reports/*", serveStatic({ root: reportsDir, rewriteRequestPath: (path) => path.replace(/^\/reports/, "") }));

// Public routes (no auth required)
app.route("/health", healthRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/v1/health", healthRoutes);
app.route("/api/meta", apiMetaRoutes);
app.route("/api/v1/sse", sseRoutes);
app.route("/api/v1/ws", websocketRoutes);
app.route("/api/graphql", graphqlRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/public/embeds", embedsRoutes);
app.route("/api/public/feeds", feedsRoutes);
app.route("/api/og", ogRoutes);
app.route("/api/public/regions", regionsRoutes);
// Token-based Prometheus remote write ingestion (bypasses user auth, uses org token)
app.route("/api/prom/remote-write", remoteWriteRoutes);
// Public events routes (status page events, subscriptions)
app.route("/api/public", publicEventsRoutes);
// Public SSO discovery and provider listing (no auth required)
app.route("/api/v1/auth/sso", ssoPublicRoutes);
// Session verification for federated auth (landing page uses this)
app.route("/api/v1/auth/verify-session", sessionVerifyRoutes);
// System status and setup (public routes for self-hosted mode)
app.route("/api/v1/system", systemRoutes);
// S3 proxy for serving uploaded assets from private bucket (public, no auth)
app.route("/api/v1/assets", s3ProxyRoutes);

// External webhook endpoints (signature-based auth, no standard auth middleware)
app.route("/api/v1/deployments", deploymentsRoutes);
// Probe agent endpoints (token-based auth handled internally)
app.route("/api/v1/probes", probesRoutes);

// Rate limiting for API routes
app.use("/api/v1/*", rateLimiter);

// Protected routes
app.use("/api/v1/*", authMiddleware);
app.use("/api/v1/*", createLicenseMiddleware());
app.route("/api/v1/organizations", organizationsRoutes);
app.route("/api/v1/monitors", monitorsRoutes);
app.route("/api/v1/monitor-dependencies", monitorDependenciesRoutes);
app.route("/api/v1/incidents", incidentsRoutes);
app.route("/api/v1/status-pages", statusPagesRoutes);
app.route("/api/v1/status-page-themes", statusPageThemesRoutes);
app.route("/api/v1/alerts", alertsRoutes);
app.route("/api/v1/maintenance-windows", maintenanceWindowsRoutes);
app.route("/api/v1/events", eventsRoutes);
// File uploads
app.route("/api/v1/uploads", uploadsRoutes);
// Certificate inventory
app.route("/api/v1/certificates", certificatesRoutes);
// SSO provider and domain management (protected routes require auth)
app.route("/api/v1/sso", ssoRoutes);
// User invitations (accept/decline)
app.route("/api/v1/invitations", invitationsRoutes);
// Pending approvals for self-hosted mode
app.route("/api/v1/pending-approvals", pendingApprovalsRoutes);
// Embeds (badge templates, etc.) - protected routes
app.route("/api/v1/embeds", embedsRoutes);

// OpenAPI documentation
app.doc("/api/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Uni-Status API",
    version: "1.0.0",
    description: "API for Uni-Status monitoring platform",
  },
  servers: [
    {
      url: getApiUrl(),
      description: "API Server",
    },
  ],
});

// Swagger UI
app.get(
  "/api/docs",
  swaggerUI({
    url: "/api/openapi.json",
  })
);

// Root redirect
app.get("/", (c) => c.redirect("/api/docs"));

// Easter egg
app.get("/coffeepot", (c) => {
  return c.text("I'm a teapot", 418);
});
app.get("/api/coffeepot", (c) => {
  return c.text("I'm a teapot", 418);
});

// Enterprise features (conditionally loaded)
async function loadEnterprise() {
  try {
    const { configureEnterprise, registerEnterpriseRoutes } = await import(
      "@uni-status/enterprise/api/routes"
    );
    const { publishEvent } = await import("./lib/redis");
    const { createAuditLog, createAuditLogWithChanges, getAuditUserId } = await import("./lib/audit");
    const { getQueue } = await import("./lib/queues");
    const { requireAuth, requireOrganization, requireRole, requireScope } = await import("./middleware/auth");

    configureEnterprise({
      auth: { requireAuth, requireOrganization, requireRole, requireScope },
      redis: { publishEvent },
      audit: { createAuditLog, createAuditLogWithChanges, getAuditUserId },
      queues: { getQueue },
    });

    await registerEnterpriseRoutes(app);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
    } else {
      console.error("[Enterprise] Failed to load:", error instanceof Error ? error.message : error);
    }
  }
}

loadEnterprise();
