"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { MonitorForm } from "@/components/forms/monitor-form";

export default function CreateMonitorPage() {
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

      <div>
        <h1 className="text-3xl font-bold">Create Monitor</h1>
        <p className="text-muted-foreground">
          Set up a new monitor to track uptime and performance
        </p>
      </div>

      <MonitorForm mode="create" />
    </div>
  );
}
