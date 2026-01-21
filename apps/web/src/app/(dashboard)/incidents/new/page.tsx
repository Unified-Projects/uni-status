"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { IncidentForm } from "@/components/forms/incident-form";

export default function CreateIncidentPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/incidents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Create Incident</h1>
        <p className="text-muted-foreground">
          Report a new incident to communicate issues to your users
        </p>
      </div>

      <IncidentForm mode="create" />
    </div>
  );
}
