"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { getCanonicalStatusPageUrl } from "@uni-status/shared";
import { useStatusPages } from "@/hooks/use-status-pages";
import { EmbedCodeGenerator } from "@/components/embeds";
import { LoadingState } from "@/components/ui/loading-state";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function StatusPageEmbedGeneratorPage({ params }: PageProps) {
  const { slug } = use(params);
  const { data: statusPagesResponse, isLoading } = useStatusPages();
  const statusPages = statusPagesResponse?.data;

  const statusPage = statusPages?.find((p) => p.slug === slug);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingState variant="card" count={3} />
      </div>
    );
  }

  // Calculate canonical URL for the status page
  const canonicalUrl = useMemo(() => {
    if (!statusPage) return undefined;
    return getCanonicalStatusPageUrl({
      customDomain: statusPage.customDomain,
      slug: statusPage.slug,
      systemUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    });
  }, [statusPage]);

  if (!statusPage) {
    return (
      <div className="space-y-6">
        <Link href="/embeds">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Embeds
          </Button>
        </Link>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Status Page Not Found</h2>
          <p className="text-muted-foreground mt-2">
            The status page with slug &quot;{slug}&quot; could not be found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/embeds">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Generate Embed</h1>
          <p className="text-muted-foreground">
            {statusPage.name}
          </p>
        </div>
      </div>

      {/* Embed Generator */}
      <EmbedCodeGenerator
        slug={statusPage.slug}
        statusPageName={statusPage.name}
        canonicalUrl={canonicalUrl}
      />
    </div>
  );
}
