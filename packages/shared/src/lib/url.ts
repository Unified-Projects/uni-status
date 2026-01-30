/**
 * Generates the canonical URL for a status page.
 *
 * If a custom domain is configured, returns the custom domain URL (https://customdomain.com).
 * Otherwise, returns the system URL with the status page path ({systemUrl}/status/{slug}).
 *
 * @param options Configuration options
 * @param options.customDomain Optional custom domain for the status page
 * @param options.slug The status page slug
 * @param options.systemUrl The system/app URL (e.g., https://status.example.com)
 * @returns The canonical URL for the status page
 */
export function getCanonicalStatusPageUrl(options: {
  customDomain?: string | null;
  slug: string;
  systemUrl: string;
}): string {
  const { customDomain, slug, systemUrl } = options;

  if (customDomain) {
    // Strip protocol if already included, always use https
    const domain = customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${domain}`;
  }

  return `${systemUrl.replace(/\/$/, "")}/status/${slug}`;
}
