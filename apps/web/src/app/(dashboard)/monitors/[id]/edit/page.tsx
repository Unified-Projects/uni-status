"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { useMonitor } from "@/hooks/use-monitors";
import { MonitorForm } from "@/components/forms/monitor-form";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

export default function EditMonitorPage() {
  const params = useParams();
  const monitorId = params.id as string;

  const { data: monitor, isLoading, error, refetch } = useMonitor(monitorId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/monitors/${monitorId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <LoadingState variant="page" />
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/monitors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <ErrorState
          title="Monitor not found"
          message="The monitor you're trying to edit doesn't exist or you don't have access to it."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/monitors/${monitorId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Edit Monitor</h1>
        <p className="text-muted-foreground">
          Update the configuration for &quot;{monitor.name}&quot;
        </p>
      </div>

      <MonitorForm mode="edit" monitor={monitor} />
    </div>
  );
}
