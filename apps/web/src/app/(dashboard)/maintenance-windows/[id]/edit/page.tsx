"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { useMaintenanceWindow } from "@/hooks/use-maintenance-windows";
import { MaintenanceForm } from "@/components/maintenance";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

export default function EditMaintenanceWindowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: maintenance, isLoading, error, refetch } = useMaintenanceWindow(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/maintenance-windows/${id}`}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Edit Maintenance Window</h1>
          </div>
        </div>
        <LoadingState variant="card" count={4} />
      </div>
    );
  }

  if (error || !maintenance) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/maintenance-windows">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <ErrorState
          error={error || new Error("Maintenance window not found")}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // Check if maintenance is completed
  const isCompleted = maintenance.computedStatus === "completed";

  if (isCompleted) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/maintenance-windows/${id}`}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Edit Maintenance Window</h1>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/50 p-6 text-center">
          <p className="text-muted-foreground">
            Completed maintenance windows cannot be edited.
          </p>
          <Link href={`/maintenance-windows/${id}`}>
            <Button variant="link">Return to details</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/maintenance-windows/${id}`}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Maintenance Window</h1>
          <p className="text-muted-foreground">
            Update the maintenance window details
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl">
        <MaintenanceForm maintenance={maintenance} mode="edit" />
      </div>
    </div>
  );
}
