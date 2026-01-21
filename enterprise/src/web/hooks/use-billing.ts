"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDashboardStore } from "@/stores/dashboard-store";

// Remove trailing /api if present to avoid double /api/api paths
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const API_BASE = RAW_API_URL.endsWith("/api") ? RAW_API_URL.slice(0, -4) : RAW_API_URL;

// Types
export interface LicenseEntitlements {
  monitors: number;
  statusPages: number;
  teamMembers: number;
  regions: number;
  auditLogs: boolean;
  sso: boolean;
  customRoles: boolean;
  slo: boolean;
  reports: boolean;
  multiRegion: boolean;
}

export interface GracePeriodInfo {
  status: "none" | "active" | "expired";
  startedAt: string | null;
  endsAt: string;
  daysRemaining: number;
}

export interface LicenseInfo {
  id: string;
  name: string | null;
  expiresAt: string | null;
  licenseeEmail: string | null;
  licenseeName: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
}

export interface BillingLicenseResponse {
  hasLicense: boolean;
  plan: "free" | "pro" | "business" | "enterprise";
  status: string;
  entitlements: LicenseEntitlements;
  gracePeriod: GracePeriodInfo | null;
  license: LicenseInfo | null;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  total: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  paidAt: string | null;
  description: string | null;
  createdAt: string;
}

export interface BillingEvent {
  id: string;
  eventType: string;
  source: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  interval: string;
  features: LicenseEntitlements;
  highlights: string[];
  recommended?: boolean;
}

export interface UsageInfo {
  usage: {
    monitors: {
      used: number;
      limit: number;
      unlimited: boolean;
      percentUsed: number;
    };
    statusPages: {
      used: number;
      limit: number;
      unlimited: boolean;
      percentUsed: number;
    };
    teamMembers: {
      used: number;
      limit: number;
      unlimited: boolean;
      percentUsed: number;
    };
  };
  features: {
    auditLogs: boolean;
    sso: boolean;
    customRoles: boolean;
    slo: boolean;
    reports: boolean;
    multiRegion: boolean;
  };
}

// Query Keys
export const billingQueryKeys = {
  license: (orgId: string) => ["billing", "license", orgId] as const,
  invoices: (orgId: string) => ["billing", "invoices", orgId] as const,
  events: (orgId: string) => ["billing", "events", orgId] as const,
  plans: () => ["billing", "plans"] as const,
  usage: (orgId: string) => ["billing", "usage", orgId] as const,
  portal: (orgId: string) => ["billing", "portal", orgId] as const,
  checkout: (orgId: string, plan: string) => ["billing", "checkout", orgId, plan] as const,
};

// API functions
async function fetchWithAuth(url: string, organizationId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const response = await fetch(url, {
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Hooks

/**
 * Get the current organization's license and entitlements.
 */
export function useBillingLicense() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: billingQueryKeys.license(organizationId || ""),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/billing/license`, organizationId || undefined).then(
        (res) => res.data as BillingLicenseResponse
      ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get invoice history.
 */
export function useBillingInvoices(params?: { limit?: number; offset?: number }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const queryString = searchParams.toString();
  const url = `${API_BASE}/api/v1/billing/invoices${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: [...billingQueryKeys.invoices(organizationId || ""), params],
    queryFn: () =>
      fetchWithAuth(url, organizationId || undefined).then(
        (res) => res.data as { invoices: Invoice[]; meta: { total: number; limit: number; offset: number; hasMore: boolean } }
      ),
    enabled: !!organizationId,
  });
}

/**
 * Get billing event history.
 */
export function useBillingEvents(params?: { limit?: number; offset?: number }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const queryString = searchParams.toString();
  const url = `${API_BASE}/api/v1/billing/events${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: [...billingQueryKeys.events(organizationId || ""), params],
    queryFn: () =>
      fetchWithAuth(url, organizationId || undefined).then(
        (res) => res.data as { events: BillingEvent[]; meta: { total: number; limit: number; offset: number; hasMore: boolean } }
      ),
    enabled: !!organizationId,
  });
}

/**
 * Get available plans.
 */
export function useBillingPlans() {
  return useQuery({
    queryKey: billingQueryKeys.plans(),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/billing/plans`).then(
        (res) => res.data.plans as Plan[]
      ),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Get current resource usage.
 */
export function useBillingUsage() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: billingQueryKeys.usage(organizationId || ""),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/billing/usage`, organizationId || undefined).then(
        (res) => res.data as UsageInfo
      ),
    enabled: !!organizationId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Get checkout URL for a specific plan.
 */
export function useCheckoutUrl(plan: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: billingQueryKeys.checkout(organizationId || "", plan),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/billing/checkout/${plan}`, organizationId || undefined).then(
        (res) => res.data as { url: string; plan: string }
      ),
    enabled: !!organizationId && !!plan,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get billing portal URL.
 */
export function useBillingPortal() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: billingQueryKeys.portal(organizationId || ""),
    queryFn: () =>
      fetchWithAuth(`${API_BASE}/api/v1/billing/portal`, organizationId || undefined).then(
        (res) => res.data as { url: string }
      ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Helper to format currency.
 */
export function formatCurrency(amount: number, currency: string = "GBP"): string {
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // Convert from smallest unit (pence/cents) to main unit
  return formatter.format(amount / 100);
}

/**
 * Helper to format date.
 */
export function formatBillingDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
