"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { MaintenanceForm } from "@/components/maintenance";

export default function NewMaintenanceWindowPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/maintenance-windows">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Schedule Maintenance</h1>
          <p className="text-muted-foreground">
            Create a new maintenance window to inform users about planned downtime
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl">
        <MaintenanceForm mode="create" />
      </div>
    </div>
  );
}
