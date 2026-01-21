"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useDashboardAnalytics() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.analytics.dashboard(),
    queryFn: () => apiClient.analytics.dashboard(organizationId ?? undefined),
    enabled: !!organizationId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useUptimeAnalytics(params?: { monitorId?: string; days?: number; granularity?: "minute" | "hour" | "day" | "auto" }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.analytics.uptime(params),
    queryFn: () => apiClient.analytics.uptime(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useResponseTimeAnalytics(monitorId: string, hours?: number) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.analytics.responseTimes(monitorId, hours),
    queryFn: () => apiClient.analytics.responseTimes(monitorId, hours, organizationId ?? undefined),
    enabled: !!monitorId && !!organizationId,
  });
}
