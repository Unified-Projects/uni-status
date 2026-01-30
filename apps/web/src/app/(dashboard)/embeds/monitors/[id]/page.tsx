"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { useMonitors } from "@/hooks/use-monitors";
import { useBadgeTemplates } from "@/hooks/use-badge-templates";
import { EmbedCodeGenerator } from "@/components/embeds";
import { LoadingState } from "@/components/ui/loading-state";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MonitorEmbedGeneratorPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: monitorsResponse, isLoading } = useMonitors();
  const { data: badgeTemplates } = useBadgeTemplates();
  const monitors = monitorsResponse?.data;

  const monitor = monitors?.find((m) => m.id === id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingState variant="card" count={3} />
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="space-y-6">
        <Link href="/embeds">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Embeds
          </Button>
        </Link>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Monitor Not Found</h2>
          <p className="text-muted-foreground mt-2">
            The monitor could not be found.
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
            {monitor.name}
          </p>
        </div>
      </div>

      {/* Embed Generator */}
      <EmbedCodeGenerator
        slug=""
        statusPageName=""
        monitorId={monitor.id}
        monitorName={monitor.name}
        badgeTemplates={badgeTemplates}
      />
    </div>
  );
}
