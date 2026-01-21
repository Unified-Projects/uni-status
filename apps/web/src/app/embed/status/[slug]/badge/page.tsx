import { notFound } from "next/navigation";

// Normalize API URL - remove trailing /api if present to avoid double prefix
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ label?: string; style?: string }>;
}

export default async function EmbedBadgePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { label = "status", style = "flat" } = await searchParams;

  // Fetch the SVG badge from the API
  const badgeUrl = `${API_URL}/api/public/embeds/status-pages/${slug}/badge.svg?label=${encodeURIComponent(label)}&style=${style}`;

  try {
    const response = await fetch(badgeUrl, { cache: "no-store" });
    if (!response.ok) {
      notFound();
    }

    const svg = await response.text();

    return (
      <div
        className="inline-block"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } catch {
    notFound();
  }
}
