import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Metadata } from "next";
import {
  StatusPageHeader,
  OverallStatusBanner,
  StatusPageFooter,
  SubscribeForm,
  LayoutWrapper,
  isFullPageLayout,
  StatusPageContainer,
  PasswordProtectedPage,
} from "@/components/public-status";
import { getDefaultTemplateConfig } from "@uni-status/shared";
import {
  getStatusPageData,
  normalizeAssetUrl,
  isCustomDomain,
} from "@/lib/public-status-page-api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getStatusPageData(slug);

  if (!result.success || !result.data) {
    return { title: "Status Page" };
  }

  const { data } = result;
  const title = data.seo.title || `${data.name} Status`;
  const description =
    data.seo.description || `Current status and uptime for ${data.name}`;

  const headersList = await headers();
  const hostname = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost";
  const onCustomDomain = isCustomDomain(hostname);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${hostname.split(":")[0]}`;
  const canonicalBaseUrl = onCustomDomain
    ? `https://${hostname.split(":")[0]}`
    : `${appUrl}/status/${slug}`;

  const ogBaseUrl = onCustomDomain ? `https://${hostname.split(":")[0]}` : appUrl;
  let ogImageUrl: string | undefined;
  if (data.seo.ogImage) {
    ogImageUrl = normalizeAssetUrl(data.seo.ogImage, ogBaseUrl);
  } else if (ogBaseUrl) {
    const template = data.seo.ogTemplate || "classic";
    ogImageUrl = `${ogBaseUrl}/api/og/${slug}?template=${template}`;
  }

  const feedBaseUrl = onCustomDomain
    ? `https://${hostname.split(":")[0]}/api/public/feeds/status-pages/${slug}`
    : `${appUrl}/api/public/feeds/status-pages/${slug}`;

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalBaseUrl,
      images: ogImageUrl
        ? [{ url: ogImageUrl, width: 1200, height: 630, alt: title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImageUrl
        ? [{ url: ogImageUrl, width: 1200, height: 630, alt: title }]
        : undefined,
    },
    alternates: {
      canonical: canonicalBaseUrl,
      types: {
        "application/rss+xml": `${feedBaseUrl}/rss`,
        "application/atom+xml": `${feedBaseUrl}/atom`,
        "application/feed+json": `${feedBaseUrl}/json`,
      },
    },
  };

  const customFaviconUrl = normalizeAssetUrl(data.favicon, ogBaseUrl);
  const orgLogoUrl = normalizeAssetUrl(data.orgLogo, ogBaseUrl);
  const faviconUrl = customFaviconUrl || orgLogoUrl;
  if (faviconUrl) {
    metadata.icons = { icon: faviconUrl };
  }

  return metadata;
}

export default async function PublicStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const result = await getStatusPageData(slug);

  const headersList = await headers();
  const hostname = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost";
  const onCustomDomain = isCustomDomain(hostname);
  const basePath = onCustomDomain ? "" : `/status/${slug}`;
  const assetBaseUrl = undefined;

  if (
    !result.success &&
    (result.error?.code === "NOT_FOUND" || result.error?.code === "NOT_PUBLISHED")
  ) {
    notFound();
  }

  if (!result.success && result.error?.code === "PASSWORD_REQUIRED") {
    return (
      <PasswordProtectedPage
        slug={slug}
        name={result.meta?.name || "Status Page"}
        logo={normalizeAssetUrl(result.meta?.logo, assetBaseUrl) || result.meta?.logo}
        authMode="password"
        requiresPassword={true}
        requiresOAuth={false}
        providers={[]}
      />
    );
  }

  if (!result.success && result.error?.code === "AUTH_REQUIRED") {
    return (
      <PasswordProtectedPage
        slug={slug}
        name={result.meta?.name || "Status Page"}
        logo={normalizeAssetUrl(result.meta?.logo, assetBaseUrl) || result.meta?.logo}
        authMode={result.meta?.protectionMode || "password"}
        requiresPassword={result.meta?.requiresPassword || false}
        requiresOAuth={result.meta?.requiresOAuth || false}
        providers={result.meta?.providers || []}
      />
    );
  }

  if (!result.success || !result.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground mt-2">
            {result.error?.message || "Failed to load status page"}
          </p>
        </div>
      </div>
    );
  }

  const { data } = result;

  const template = data.template || getDefaultTemplateConfig();
  const logoUrl = normalizeAssetUrl(data.logo, assetBaseUrl) || data.logo;
  const orgLogoUrl = normalizeAssetUrl(data.orgLogo, assetBaseUrl) || data.orgLogo;

  const message = query.message as string | undefined;
  const error = query.error as string | undefined;

  const monitorGroups = new Map<string, typeof data.monitors>();
  const ungroupedMonitors: typeof data.monitors = [];

  for (const monitor of data.monitors) {
    if (monitor.group) {
      const group = monitorGroups.get(monitor.group) || [];
      group.push(monitor);
      monitorGroups.set(monitor.group, group);
    } else {
      ungroupedMonitors.push(monitor);
    }
  }

  const pageData = {
    name: data.name,
    logo: logoUrl,
    orgLogo: orgLogoUrl,
    headerText: data.settings.headerText,
    footerText: data.settings.footerText,
    supportUrl: data.settings.supportUrl,
    hideBranding: data.settings.hideBranding,
    lastUpdatedAt: data.lastUpdatedAt,
    slug: slug,
    basePath: basePath,
  };

  const initialLocale =
    typeof query.lang === "string"
      ? query.lang
      : Array.isArray(query.lang)
        ? query.lang[0]
        : undefined;
  const localization = data.settings.localization;
  const defaultTimezone = data.settings.defaultTimezone || "local";

  // Theme (CSS vars, color mode script, custom CSS) is applied by layout.tsx
  // which wraps this page and all sub-pages under [slug]/

  if (isFullPageLayout(template.layout)) {
    return (
      <StatusPageContainer
        localization={localization}
        defaultTimezone={defaultTimezone}
        initialLocale={initialLocale}
      >
        <div className="min-h-screen bg-background text-foreground">
          <LayoutWrapper
            layout={template.layout}
            monitors={data.monitors}
            monitorGroups={monitorGroups}
            ungroupedMonitors={ungroupedMonitors}
            activeIncidents={data.activeIncidents}
            recentIncidents={data.recentIncidents}
            settings={data.settings}
            template={template}
            crowdsourced={data.crowdsourced}
            statusPageSlug={slug}
            fullPageProps={pageData}
            notificationMessage={message}
            notificationError={error}
          />
        </div>
      </StatusPageContainer>
    );
  }

  return (
    <StatusPageContainer
      localization={localization}
      defaultTimezone={defaultTimezone}
      initialLocale={initialLocale}
    >
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {message && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-success-text)] bg-[var(--status-success-bg)] border-[var(--status-success-text)]/20">
              {message === "subscribed" && "You have been subscribed to status updates."}
              {message === "unsubscribed" && "You have been unsubscribed from status updates."}
              {message === "already_verified" && "Your email is already verified."}
            </div>
          )}
          {error && (
            <div className="mb-6 rounded-lg border p-4 text-[var(--status-error-text)] bg-[var(--status-error-bg)] border-[var(--status-error-text)]/20">
              {error === "invalid_token" && "Invalid or expired link."}
            </div>
          )}

          <StatusPageHeader
            name={data.name}
            logo={logoUrl}
            orgLogo={orgLogoUrl}
            headerText={data.settings.headerText}
            slug={data.slug}
            basePath={basePath}
            showServicesPage={data.settings.showServicesPage}
          />

          <OverallStatusBanner
            monitors={data.monitors}
            incidents={data.activeIncidents}
            lastUpdatedAt={data.lastUpdatedAt}
            className="mt-6"
          />

          <div className="mt-8">
            <LayoutWrapper
              layout={template.layout}
              monitors={data.monitors}
              monitorGroups={monitorGroups}
              ungroupedMonitors={ungroupedMonitors}
              activeIncidents={data.activeIncidents}
              recentIncidents={data.recentIncidents}
              settings={data.settings}
              template={template}
              crowdsourced={data.crowdsourced}
              statusPageSlug={slug}
              basePath={basePath}
            />
          </div>

          <div className="mt-12 border-t pt-8">
            <SubscribeForm slug={slug} />
          </div>

          <StatusPageFooter
            footerText={data.settings.footerText}
            supportUrl={data.settings.supportUrl}
            hideBranding={data.settings.hideBranding}
            slug={slug}
            basePath={basePath}
            localization={localization}
            className="mt-8"
          />
        </div>
      </div>
    </StatusPageContainer>
  );
}
