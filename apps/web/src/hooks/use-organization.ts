"use client";

import { useCurrentOrganizationId } from "@/stores/dashboard-store";

/**
 * Hook to get the current organization ID from the dashboard store.
 * This provides a convenient way for components to access the current
 * organization context without importing the store directly.
 */
export function useOrganization() {
  const organizationId = useCurrentOrganizationId();

  return {
    organizationId: organizationId || "",
  };
}
