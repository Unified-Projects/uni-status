"use client";

import { LicenseStatusBanner } from "@uni-status/enterprise/web/components/banners";
import { useSystemStatus } from "@/hooks/use-system-status";

/**
 * Client-side wrapper for LicenseStatusBanner that fetches system status
 * to determine if we're in self-hosted mode.
 */
export function LicenseStatusBannerWrapper() {
  const { data: systemStatus, isLoading } = useSystemStatus();

  // Don't render while loading to prevent flash
  if (isLoading || !systemStatus) {
    return null;
  }

  return <LicenseStatusBanner isSelfHosted={systemStatus.isSelfHosted} />;
}
