"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function MaintenanceDetailRedirectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    // Redirect to the event detail page
    router.replace(`/events/maintenance/${params.id}`);
  }, [router, params.id]);

  return (
    <div className="flex h-96 items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to Event Details...</p>
      </div>
    </div>
  );
}
