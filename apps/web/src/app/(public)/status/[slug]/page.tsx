import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Metadata } from "next";
import {
  PasswordProtectedPage,
} from "@/components/public-status";
import {
  getStatusPageShellData,
  normalizeAssetUrl,
  isCustomDomain,
} from "@/lib/public-status-page-api";
import { PublicStatusPageContent } from "./public-status-page-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getStatusPageShellData(slug);

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
  const result = await getStatusPageShellData(slug);

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
  const message = query.message as string | undefined;
  const error = query.error as string | undefined;

  const initialLocale =
    typeof query.lang === "string"
      ? query.lang
      : Array.isArray(query.lang)
        ? query.lang[0]
        : undefined;

  return (
    <PublicStatusPageContent
      slug={slug}
      basePath={basePath}
      initialData={{
        ...data,
        logo: normalizeAssetUrl(data.logo, assetBaseUrl) || data.logo,
        orgLogo: normalizeAssetUrl(data.orgLogo, assetBaseUrl) || data.orgLogo,
      }}
      initialLocale={initialLocale}
      notificationMessage={message}
      notificationError={error}
    />
  );
}
