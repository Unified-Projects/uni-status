"use client";

import { useQuery } from "@tanstack/react-query";
import {
  apiClient,
  queryKeys,
  type AuditLogsListParams,
} from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useAuditLogs(params?: AuditLogsListParams) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.auditLogs.list(params),
    queryFn: () => apiClient.auditLogs.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useAuditLogActions() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.auditLogs.actions(),
    queryFn: () => apiClient.auditLogs.actions(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useAuditLogUsers() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.auditLogs.users(),
    queryFn: () => apiClient.auditLogs.users(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useExportAuditLogs() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return {
    getExportUrl: (format: "json" | "csv", params?: { from?: string; to?: string }) => {
      return apiClient.auditLogs.export(format, params, organizationId ?? undefined);
    },
  };
}
