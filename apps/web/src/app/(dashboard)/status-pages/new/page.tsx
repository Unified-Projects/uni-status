"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { StatusPageForm } from "@/components/forms/status-page-form";

export default function CreateStatusPagePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/status-pages">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Create Status Page</h1>
        <p className="text-muted-foreground">
          Set up a new public status page for your users
        </p>
      </div>

      <StatusPageForm mode="create" />
    </div>
  );
}
