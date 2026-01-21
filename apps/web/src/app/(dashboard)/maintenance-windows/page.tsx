"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MaintenanceWindowsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to events page filtered by maintenance
    router.replace("/events?tab=maintenance");
  }, [router]);

  return (
    <div className="flex h-96 items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to Events...</p>
      </div>
    </div>
  );
}
