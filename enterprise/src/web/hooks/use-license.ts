"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDashboardStore } from "@/stores/dashboard-store";
import type { LicenseEntitlements, GracePeriodInfo } from "./use-billing";

// Remove trailing /api if present to avoid double /api/api paths
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const API_BASE = RAW_API_URL.endsWith("/api") ? RAW_API_URL.slice(0, -4) : RAW_API_URL;

// Types
export interface LicenseResponse {
  hasLicense: boolean;
  plan: "free" | "pro" | "business" | "enterprise";
  status: "active" | "grace_period" | "downgraded" | "no_license" | "expired" | "suspended";
  source?: "database" | "environment";
  entitlements: LicenseEntitlements;
  gracePeriod: GracePeriodInfo | null;
  license: {
    id: string;
    name: string | null;
    expiresAt: string | null;
    licenseeEmail: string | null;
    licenseeName: string | null;
    activated: boolean;
    activatedAt: string | null;
    machineId: string | null;
    createdAt: string;
    requiresActivation?: boolean;
  } | null;
  validation: {
    lastValidatedAt: string | null;
    result: string | null;
    failureCount: number | null;
  } | null;
}

export interface ActivateLicenseRequest {
  licenseKey: string;
}

export interface ActivateLicenseResponse {
  activated: boolean;
  plan: string;
  entitlements: LicenseEntitlements;
  license: {
    id: string;
    name: string | null;
    expiresAt: string | null;
  };
  machine: {
    id: string;
    fingerprint: string;
  };
}

export interface ValidationResponse {
  valid: boolean;
  code: string;
  detail: string;
  method: "online" | "offline";
  validatedAt: string;
}

export interface LicenseValidation {
  id: string;
  type: string;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  validatedAt: string;
}

// Query Keys
export const licenseQueryKeys = {
  license: (orgId: string) => ["license", orgId] as const,
  portal: (orgId: string) => ["license", "portal", orgId] as const,
  validations: (orgId: string) => ["license", "validations", orgId] as const,
};

// API functions
async function fetchWithAuth(url: string, organizationId?: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.detail || "Request failed");
  }

  return response.json();
}

// Hooks

/**
 * Get the current license status and entitlements.
 * Works for both hosted and self-hosted deployments.
 */
export function useLicense() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: licenseQueryKeys.license(organizationId || ""),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/license`, organizationId || undefined).then(
        (res) => res.data as LicenseResponse
      ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Activate a license key (self-hosted only).
 */
export function useActivateLicense() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: async (data: ActivateLicenseRequest) => {
      const result = await fetchWithAuth(
        `${API_BASE}/api/v1/license/activate`,
        organizationId || undefined,
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
      return result.data as ActivateLicenseResponse;
    },
    onSuccess: () => {
      // Invalidate license queries to refresh data
      queryClient.invalidateQueries({
        queryKey: licenseQueryKeys.license(organizationId || ""),
      });
    },
  });
}

/**
 * Force a license validation check.
 */
export function useValidateLicense() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: async () => {
      const result = await fetchWithAuth(
        `${API_BASE}/api/v1/license/validate`,
        organizationId || undefined,
        {
          method: "POST",
        }
      );
      return result.data as ValidationResponse;
    },
    onSuccess: () => {
      // Invalidate license queries to refresh data
      queryClient.invalidateQueries({
        queryKey: licenseQueryKeys.license(organizationId || ""),
      });
      queryClient.invalidateQueries({
        queryKey: licenseQueryKeys.validations(organizationId || ""),
      });
    },
  });
}

/**
 * Deactivate the current license (self-hosted only).
 */
export function useDeactivateLicense() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: async () => {
      const result = await fetchWithAuth(
        `${API_BASE}/api/v1/license/deactivate`,
        organizationId || undefined,
        {
          method: "POST",
        }
      );
      return result.data as { deactivated: boolean; message: string };
    },
    onSuccess: () => {
      // Invalidate license queries to refresh data
      queryClient.invalidateQueries({
        queryKey: licenseQueryKeys.license(organizationId || ""),
      });
    },
  });
}

/**
 * Get the license portal URL.
 */
export function useLicensePortal() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: licenseQueryKeys.portal(organizationId || ""),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/license/portal`, organizationId || undefined).then(
        (res) => res.data as { url: string }
      ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get license validation history.
 */
export function useLicenseValidations(params?: { limit?: number; offset?: number }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const queryString = searchParams.toString();
  const url = `${API_BASE}/api/v1/license/validations${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: [...licenseQueryKeys.validations(organizationId || ""), params],
    queryFn: () =>
      fetchWithAuth(url, organizationId || undefined).then(
        (res) => res.data as {
          validations: LicenseValidation[];
          meta: { total: number; limit: number; offset: number; hasMore: boolean };
        }
      ),
    enabled: !!organizationId,
  });
}

/**
 * Helper to check if a feature is available.
 */
export function hasFeature(
  license: LicenseResponse | undefined,
  feature: keyof LicenseEntitlements
): boolean {
  if (!license) return false;

  const value = license.entitlements[feature];
  if (typeof value === "boolean") {
    return value;
  }
  // For numeric limits, -1 means unlimited, anything > 0 means the feature is available
  return value === -1 || value > 0;
}

/**
 * Helper to check resource limit.
 */
export function checkResourceLimit(
  license: LicenseResponse | undefined,
  resource: "monitors" | "statusPages" | "teamMembers" | "regions",
  currentCount: number
): { allowed: boolean; limit: number; unlimited: boolean } {
  if (!license) {
    return { allowed: false, limit: 0, unlimited: false };
  }

  const limit = license.entitlements[resource];
  const unlimited = limit === -1;
  const allowed = unlimited || currentCount < limit;

  return { allowed, limit, unlimited };
}

/**
 * Helper to get plan display name.
 */
export function getPlanDisplayName(plan: string): string {
  switch (plan.toLowerCase()) {
    case "free":
      return "Free";
    case "pro":
      return "Pro";
    case "business":
      return "Business";
    case "enterprise":
      return "Enterprise";
    default:
      return plan;
  }
}

/**
 * Helper to get status display info.
 */
export function getLicenseStatusInfo(status: string): {
  label: string;
  color: "green" | "yellow" | "red" | "gray";
  description: string;
} {
  switch (status) {
    case "active":
      return {
        label: "Active",
        color: "green",
        description: "Your license is active and valid.",
      };
    case "grace_period":
      return {
        label: "Grace Period",
        color: "yellow",
        description: "Your license has expired. You have a limited time to renew.",
      };
    case "downgraded":
      return {
        label: "Downgraded",
        color: "red",
        description: "Your license has expired. You are on the free tier.",
      };
    case "expired":
      return {
        label: "Expired",
        color: "red",
        description: "Your license has expired.",
      };
    case "suspended":
      return {
        label: "Suspended",
        color: "red",
        description: "Your license has been suspended.",
      };
    case "no_license":
    default:
      return {
        label: "No License",
        color: "gray",
        description: "You are on the free tier.",
      };
  }
}
