"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useDashboardAnalytics(options?: { realtimeConnected?: boolean }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const includeTrend = false;
  const realtimeConnected = options?.realtimeConnected ?? false;

  return useQuery({
    queryKey: queryKeys.analytics.dashboard(includeTrend),
    queryFn: () => apiClient.analytics.dashboard(organizationId ?? undefined, { includeTrend }),
    enabled: !!organizationId,
    // Fall back to polling only when realtime is not healthy.
    refetchInterval: () => {
      if (realtimeConnected) return false;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return false;
      }
      return 60000;
    },
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
