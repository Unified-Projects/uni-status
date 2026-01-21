import { notFound } from "next/navigation";

// Normalize API URL - remove trailing /api if present to avoid double prefix
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ size?: string; animate?: string }>;
}

export default async function EmbedMiniPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { size = "12", animate = "false" } = await searchParams;

  // Fetch the SVG dot from the API
  const dotUrl = `${API_URL}/api/public/embeds/status-pages/${slug}/dot.svg?size=${size}&animate=${animate}`;

  try {
    const response = await fetch(dotUrl, { cache: "no-store" });
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
