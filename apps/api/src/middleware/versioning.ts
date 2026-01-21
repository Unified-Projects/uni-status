import type { Context, Next } from "hono";
import { API_CHANGELOG, API_DEPRECATIONS, API_VERSIONS, getVersionFromHeader } from "../lib/api-metadata";

declare module "hono" {
  interface ContextVariableMap {
    apiVersion?: string;
  }
}

function buildLinkHeader(): string {
  const links = [`<${API_VERSIONS.changelogUrl}>; rel="changelog"`];
  if (API_VERSIONS.preview) {
    links.push(`<${API_VERSIONS.preview}>; rel="preload"; title="v2-preview"`);
  }
  return links.join(", ");
}

export async function versioningMiddleware(c: Context, next: Next) {
  const requested =
    c.req.header("x-api-version") ||
    c.req.query("apiVersion") ||
    c.req.query("version");

  const parsed = getVersionFromHeader(requested || undefined);
  const activeVersion = parsed || API_VERSIONS.latest;

  c.set("apiVersion", activeVersion);

  c.header("X-Uni-Status-API-Version", activeVersion);
  c.header("X-Uni-Status-API-Latest", API_VERSIONS.latest);
  c.header("X-Uni-Status-API-Supported", API_VERSIONS.supported.join(","));
  if (API_VERSIONS.preview) {
    c.header("X-Uni-Status-API-Preview", API_VERSIONS.preview);
  }
  if (API_VERSIONS.deprecated.length > 0) {
    c.header("X-Uni-Status-API-Deprecated", API_VERSIONS.deprecated.join(","));
  }

  // Add a short warning header when clients request an unsupported version
  if (requested && !parsed) {
    c.header(
      "Warning",
      `299 Uni-Status "Requested API version '${requested}' is not available, using ${API_VERSIONS.latest}"`
    );
  }

  // Surface upcoming sunsets for clients in a single header
  const nextSunset = API_DEPRECATIONS.find((dep) => dep.sunsetAt);
  if (nextSunset?.sunsetAt) {
    c.header("Sunset", new Date(nextSunset.sunsetAt).toUTCString());
  }

  // Link to changelog/deprecation feed for discovery
  c.header("Link", buildLinkHeader());

  // Advertise changelog hash for client caching
  const changelogFingerprint = API_CHANGELOG.map((entry) => entry.version + entry.date).join("|");
  c.header("X-Uni-Status-API-Changelog", changelogFingerprint);

  await next();
}
