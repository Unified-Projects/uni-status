"use client";

import { useQuery } from "@tanstack/react-query";
import { useDashboardStore } from "@/stores/dashboard-store";

// Remove trailing /api if present to avoid double /api/api paths
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const API_BASE = RAW_API_URL.endsWith("/api") ? RAW_API_URL.slice(0, -4) : RAW_API_URL;

/**
 * License entitlements - feature flags and resource limits
 */
export interface LicenseEntitlements {
  monitors: number;
  statusPages: number;
  teamMembers: number;
  regions: number;
  auditLogs: boolean;
  sso: boolean;
  oauthProviders?: boolean; // Optional for backwards compatibility
  customRoles: boolean;
  slo: boolean;
  reports: boolean;
  multiRegion: boolean;
  oncall: boolean;
}

/**
 * License response from the API
 */
export interface LicenseResponse {
  hasLicense: boolean;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "grace_period" | "downgraded" | "no_license" | "expired" | "suspended";
  entitlements: LicenseEntitlements;
  gracePeriod: {
    status: string;
    startedAt: string | null;
    endsAt: string;
    daysRemaining: number;
  } | null;
}

/**
 * Default free tier entitlements
 */
const DEFAULT_FREE_ENTITLEMENTS: LicenseEntitlements = {
  monitors: 10,
  statusPages: 2,
  teamMembers: -1,
  regions: 1,
  auditLogs: false,
  sso: false,
  oauthProviders: false,
  customRoles: false,
  slo: false,
  reports: false,
  multiRegion: false,
  oncall: false,
};

/**
 * Default license status for free tier / error cases
 */
const DEFAULT_LICENSE_STATUS: LicenseResponse = {
  hasLicense: false,
  plan: "free",
  status: "no_license",
  entitlements: DEFAULT_FREE_ENTITLEMENTS,
  gracePeriod: null,
};

/**
 * Feature to plan mapping
 */
const FEATURE_PLAN_MAP: Partial<Record<keyof LicenseEntitlements, string>> = {
  monitors: "Free",
  statusPages: "Free",
  teamMembers: "Free",
  regions: "Pro",
  auditLogs: "Enterprise",
  sso: "Enterprise",
  oauthProviders: "Enterprise",
  customRoles: "Enterprise",
  slo: "Enterprise",
  reports: "Enterprise",
  multiRegion: "Pro",
  oncall: "Enterprise",
};

/**
 * Fetches license status from the API
 */
async function fetchLicenseStatus(organizationId: string): Promise<LicenseResponse> {
  const response = await fetch(`${API_BASE}/api/v1/license`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": organizationId,
    },
  });

  if (!response.ok) {
    // On 404 or other errors, return free tier defaults
    // This handles cases where enterprise module isn't loaded
    return DEFAULT_LICENSE_STATUS;
  }

  const result = await response.json();
  return result.data as LicenseResponse;
}

/**
 * Hook to fetch license status with graceful error handling.
 * Returns free tier defaults on any error (404, network, etc.)
 */
export function useLicenseStatus() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  const query = useQuery({
    queryKey: ["license-status", organizationId],
    queryFn: () => fetchLicenseStatus(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on failure - just use defaults
    placeholderData: DEFAULT_LICENSE_STATUS,
  });

  const license = query.data ?? DEFAULT_LICENSE_STATUS;

  return {
    ...query,
    license,
    plan: license.plan,
    status: license.status,
    entitlements: license.entitlements,
    gracePeriod: license.gracePeriod,
    /**
     * Check if a feature is available in the current plan
     */
    hasFeature: (feature: keyof LicenseEntitlements): boolean => {
      const value = license.entitlements[feature];
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "undefined") {
        return false;
      }
      // For numeric limits, -1 means unlimited, anything > 0 means available
      return value === -1 || value > 0;
    },
    /**
     * Get the minimum plan required for a feature
     */
    getRequiredPlan: (feature: keyof LicenseEntitlements): string => {
      return FEATURE_PLAN_MAP[feature] || "Pro";
    },
    /**
     * Check if on a paid plan (has active license)
     */
    isPaidPlan: license.hasLicense,
    /**
     * Check if in grace period
     */
    inGracePeriod: license.status === "grace_period",
    /**
     * Check if downgraded from paid
     */
    isDowngraded: license.status === "downgraded",
  };
}

/**
 * Type for the return value of useLicenseStatus
 */
export type LicenseStatusHook = ReturnType<typeof useLicenseStatus>;
