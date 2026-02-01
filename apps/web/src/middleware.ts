import { NextRequest, NextResponse } from "next/server";

// Internal API URL for domain lookups (runs in Node.js, can access database)
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || "http://controller:3001";

// Valid paths for public status pages (custom domains)
// These are the only paths that should be rewritten for custom domains
const VALID_STATUS_PAGE_PATHS = [
  "/", // Root status page
  "/events", // Events list
  "/services", // Services page
  "/geo", // Geo page
  "/rss", // RSS feed redirect
];

// Check if a path is valid for status page rewriting
function isValidStatusPagePath(pathname: string): boolean {
  // Exact matches
  if (VALID_STATUS_PAGE_PATHS.includes(pathname)) {
    return true;
  }
  // Events detail pages: /events/{type}/{id}
  if (pathname.match(/^\/events\/[^/]+\/[^/]+$/)) {
    return true;
  }
  return false;
}

// Lookup status page slug by custom domain via internal API
// This is needed because middleware runs in Edge runtime which cannot use postgres.js
async function lookupDomainSlug(domain: string): Promise<string | null> {
  try {
    const apiUrl = INTERNAL_API_URL.replace(/\/$/, "");
    const response = await fetch(`${apiUrl}/api/public/internal/domain-lookup?domain=${encodeURIComponent(domain)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      console.error(`[Middleware] Domain lookup API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.slug) {
      return data.slug;
    }

    return null;
  } catch (error) {
    console.error("[Middleware] Domain lookup failed:", error);
    return null;
  }
}

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// Helper to add security headers to any response
function addSecurityHeaders(response: Response): void {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
}

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const pathname = request.nextUrl.pathname;

  // Use X-Forwarded-Host for reverse proxy setups (HAProxy, Nginx, etc.)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const effectiveHostname = forwardedHost || hostname;

  // Check if hostname is the main app domain FIRST (before skipping paths)
  const appUrl = process.env.UNI_STATUS_URL?.replace(/^https?:\/\//, "") || "localhost:3000";
  const mainDomains = [appUrl, "localhost:3000"];

  // Remove port if present for comparison
  const hostnameWithoutPort = effectiveHostname.split(":")[0];

  // Check if this is the main app domain (with or without port)
  const appUrlWithoutPort = appUrl.split(":")[0];
  const isMainDomain = mainDomains.includes(effectiveHostname) ||
                       mainDomains.includes(hostnameWithoutPort) ||
                       hostnameWithoutPort === appUrlWithoutPort;

  // For test containers, pass through (hostnames like uni-status-haproxy-test)
  const isTestHostname = hostnameWithoutPort.endsWith("-test") ||
                         hostnameWithoutPort.includes("-test-") ||
                         hostnameWithoutPort.match(/^\d+\.\d+\.\d+\.\d+$/); // IP addresses

  // For main domain or test hostnames, skip custom domain handling
  if (isMainDomain || isTestHostname) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // This is a custom domain - handle API proxying
  // Proxy /api/public and /api/v1/assets requests to internal API
  // This is needed for client-side fetches and asset loading on custom domains
  if (pathname.startsWith("/api/public/") || pathname.startsWith("/api/v1/assets/")) {
    const apiUrl = INTERNAL_API_URL.replace(/\/$/, "");
    const targetUrl = `${apiUrl}${pathname}${request.nextUrl.search}`;
    // Rewrite to internal API
    const url = new URL(targetUrl);
    const response = NextResponse.rewrite(url);
    addSecurityHeaders(response);
    return response;
  }

  // Handle /api/og/ route for custom domains - rewrite to the system app
  // The OG image generation runs on the Next.js web server, not the internal API
  if (pathname.startsWith("/api/og/")) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.UNI_STATUS_URL;
    if (appUrl) {
      const targetUrl = `${appUrl}${pathname}${request.nextUrl.search}`;
      const url = new URL(targetUrl);
      const response = NextResponse.rewrite(url);
      addSecurityHeaders(response);
      return response;
    }
  }

  // Skip other internal paths and static files on custom domains
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/uploads") ||
    pathname.startsWith("/reports")
  ) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Skip static assets (but NOT root path - we need to check custom domains first)
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // This is a custom domain - look up status page via API
  const slug = await lookupDomainSlug(effectiveHostname);

  if (slug) {
    // Check if the path already has the /status/{slug} prefix (from RSC navigation)
    // If so, strip it and check the remaining path
    const statusPrefix = `/status/${slug}`;
    let effectivePath = pathname;
    if (pathname.startsWith(statusPrefix)) {
      effectivePath = pathname.slice(statusPrefix.length) || "/";
    }

    // Check if this is a valid status page path
    if (isValidStatusPagePath(effectivePath)) {
      // Rewrite to /status/{slug} (for root path) or /status/{slug}/path for subpaths
      const statusPath = effectivePath === "/" ? "" : effectivePath;
      const url = new URL(`/status/${slug}${statusPath}`, request.url);
      const response = NextResponse.rewrite(url);
      addSecurityHeaders(response);
      return response;
    }

    // Invalid path on custom domain - redirect to root
    const rootUrl = new URL("/", request.url);
    const redirectResponse = NextResponse.redirect(rootUrl);
    addSecurityHeaders(redirectResponse);
    return redirectResponse;
  }

  // No status page found for this custom domain
  // Return a simple not found response for custom domains without a status page
  const notFoundResponse = new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <title>Status Page Not Found</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #333; margin-bottom: 0.5rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Status Page Not Found</h1>
    <p>No status page is configured for this domain.</p>
  </div>
</body>
</html>`,
    {
      status: 404,
      headers: { "Content-Type": "text/html" },
    }
  );
  addSecurityHeaders(notFoundResponse);
  return notFoundResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (except api/public/, api/v1/assets/, and api/og/ which need proxying for custom domains)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - static files (uploads, reports, etc.)
     * - public files (favicon.ico, etc.)
     *
     * The negative lookahead (?!api/(?!public/|v1/assets/|og/)) means:
     * - Exclude paths starting with api/ UNLESS they continue with public/, v1/assets/, or og/
     * - This allows api/public/*, api/v1/assets/*, and api/og/* through for custom domain proxying
     * - Other api/* paths are still excluded (handled by Next.js API routes)
     */
    "/((?!api/(?!public/|v1/assets/|og/)|_next/static|_next/image|uploads|reports|favicon.ico|robots.txt|sitemap.xml|health).*)",
  ],
};
