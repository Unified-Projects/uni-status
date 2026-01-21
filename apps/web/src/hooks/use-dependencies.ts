"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  queryKeys,
  type MonitorDependency,
  type MonitorDependencyWithMonitor,
} from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useDependencies() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.monitorDependencies.list(),
    queryFn: () => apiClient.monitorDependencies.list(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useMonitorDependencies(monitorId: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.monitorDependencies.forMonitor(monitorId),
    queryFn: () => apiClient.monitorDependencies.getForMonitor(monitorId, organizationId ?? undefined),
    enabled: !!monitorId && !!organizationId,
  });
}

export function useCreateDependency() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: { downstreamMonitorId: string; upstreamMonitorId: string; description?: string }) =>
      apiClient.monitorDependencies.create(data, organizationId ?? undefined),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorDependencies.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitorDependencies.forMonitor(variables.downstreamMonitorId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitorDependencies.forMonitor(variables.upstreamMonitorId),
      });
    },
  });
}

export function useBulkCreateDependencies() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: { downstreamMonitorId: string; upstreamMonitorIds: string[]; description?: string }) =>
      apiClient.monitorDependencies.bulkCreate(data, organizationId ?? undefined),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorDependencies.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitorDependencies.forMonitor(variables.downstreamMonitorId),
      });
      // Invalidate all upstream monitors
      variables.upstreamMonitorIds.forEach((id) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.monitorDependencies.forMonitor(id),
        });
      });
    },
  });
}

export function useUpdateDependency() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { description?: string } }) =>
      apiClient.monitorDependencies.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.monitorDependencies.all });
      const previousDeps = queryClient.getQueryData(queryKeys.monitorDependencies.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.monitorDependencies.all },
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((d: { id: string }) => (d.id === id ? { ...d, ...data } : d));
        }
      );
      return { previousDeps };
    },
    onError: (_, __, context) => {
      if (context?.previousDeps) {
        queryClient.setQueryData(queryKeys.monitorDependencies.list(), context.previousDeps);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorDependencies.all });
    },
  });
}

export function useDeleteDependency() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.monitorDependencies.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.monitorDependencies.all });
      const previousDeps = queryClient.getQueryData(queryKeys.monitorDependencies.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.monitorDependencies.all },
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((d: { id: string }) => d.id !== id);
        }
      );
      return { previousDeps };
    },
    onError: (_, __, context) => {
      if (context?.previousDeps) {
        queryClient.setQueryData(queryKeys.monitorDependencies.list(), context.previousDeps);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorDependencies.all });
    },
  });
}
