"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uni-status/ui";
import { BadgeTemplateBuilder } from "@/components/embeds";

export default function BadgeGeneratorPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/embeds">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Badge Builder</h1>
          <p className="text-muted-foreground">
            Design reusable badge and dot templates with live previews.
          </p>
        </div>
      </div>

      <BadgeTemplateBuilder />
    </div>
  );
}
