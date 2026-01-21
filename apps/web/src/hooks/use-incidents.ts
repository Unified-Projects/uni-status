"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys, type PaginationParams } from "@/lib/api-client";
import type { CreateIncidentInput, UpdateIncidentInput, CreateIncidentUpdateInput } from "@uni-status/shared/validators";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useIncidents(params?: PaginationParams & { status?: string }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.incidents.list(params as Record<string, unknown>),
    queryFn: () => apiClient.incidents.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useIncident(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.incidents.detail(id),
    queryFn: () => apiClient.incidents.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: CreateIncidentInput) =>
      apiClient.incidents.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.dashboard() });
    },
  });
}

export function useUpdateIncident() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIncidentInput }) =>
      apiClient.incidents.update(id, data, organizationId ?? undefined),
    onSuccess: (updatedIncident) => {
      queryClient.setQueryData(
        queryKeys.incidents.detail(updatedIncident.id),
        updatedIncident
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.lists() });
    },
  });
}

export function useAddIncidentUpdate() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateIncidentUpdateInput }) =>
      apiClient.incidents.addUpdate(id, data, organizationId ?? undefined),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.lists() });
    },
  });
}

export function useResolveIncident() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.incidents.resolve(id, organizationId ?? undefined),
    onSuccess: (resolvedIncident) => {
      queryClient.setQueryData(
        queryKeys.incidents.detail(resolvedIncident.id),
        resolvedIncident
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.dashboard() });
    },
  });
}
