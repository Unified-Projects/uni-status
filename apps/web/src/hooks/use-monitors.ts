"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys, type Monitor, type CheckResult, type PaginationParams } from "@/lib/api-client";
import type { CreateMonitorInput, UpdateMonitorInput } from "@uni-status/shared/validators";
import { useDashboardStore } from "@/stores/dashboard-store";
import { toast } from "@uni-status/ui";

export function useMonitors(params?: PaginationParams) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.monitors.list(params as Record<string, unknown>),
    queryFn: () => apiClient.monitors.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useMonitor(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.monitors.detail(id),
    queryFn: () => apiClient.monitors.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useMonitorResults(
  id: string,
  options?: { limit?: number; offset?: number }
) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: [...queryKeys.monitors.results(id), options],
    queryFn: () => apiClient.monitors.getResults(id, options, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: CreateMonitorInput) =>
      apiClient.monitors.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.dashboard() });
    },
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMonitorInput }) =>
      apiClient.monitors.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.lists() });
      const previousDetail = queryClient.getQueryData<Monitor>(queryKeys.monitors.detail(id));
      const previousLists: unknown[] = [];
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.monitors.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.monitors.lists() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }> };
          if (!oldData.data) return old;
          previousLists.push(old);
          return {
            ...oldData,
            data: oldData.data.map((m) => (m.id === id ? { ...m, ...data } : m)),
          };
        }
      );
      return { previousDetail, previousLists };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.monitors.detail(id), context.previousDetail);
      }
    },
    onSettled: (updatedMonitor, _, { id }) => {
      if (updatedMonitor) {
        queryClient.setQueryData(queryKeys.monitors.detail(updatedMonitor.id), updatedMonitor);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.lists() });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.monitors.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.lists() });
      const previousLists: unknown[] = [];
      queryClient.setQueriesData(
        { queryKey: queryKeys.monitors.lists() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }>; meta?: { total: number } };
          if (!oldData.data) return old;
          previousLists.push(old);
          return {
            ...oldData,
            data: oldData.data.filter((m) => m.id !== id),
            meta: oldData.meta ? { ...oldData.meta, total: oldData.meta.total - 1 } : oldData.meta,
          };
        }
      );
      return { previousLists };
    },
    onError: (_, __, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach((prev) => {
          queryClient.setQueriesData({ queryKey: queryKeys.monitors.lists() }, () => prev);
        });
      }
    },
    onSettled: (_, __, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.monitors.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.dashboard() });
    },
  });
}

export function usePauseMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.monitors.pause(id, organizationId ?? undefined),
    onSuccess: () => {
      toast({
        title: "Monitor paused",
        description: "Monitoring has been paused for this monitor.",
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.lists() });
      const previous = queryClient.getQueryData<Monitor>(queryKeys.monitors.detail(id));

      if (previous) {
        queryClient.setQueryData(queryKeys.monitors.detail(id), {
          ...previous,
          status: "paused" as const,
          paused: true,
        });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.monitors.lists() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string; status: string; paused: boolean }> };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.map((m) =>
              m.id === id ? { ...m, status: "paused", paused: true } : m
            ),
          };
        }
      );

      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.monitors.detail(id), context.previous);
      }
      toast({
        title: "Failed to pause monitor",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.lists() });
    },
  });
}

export function useResumeMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.monitors.resume(id, organizationId ?? undefined),
    onSuccess: () => {
      toast({
        title: "Monitor resumed",
        description: "Monitoring has been resumed for this monitor.",
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.monitors.lists() });
      const previous = queryClient.getQueryData<Monitor>(queryKeys.monitors.detail(id));

      if (previous) {
        queryClient.setQueryData(queryKeys.monitors.detail(id), {
          ...previous,
          status: "pending" as const,
          paused: false,
        });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.monitors.lists() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string; status: string; paused: boolean }> };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.map((m) =>
              m.id === id ? { ...m, status: "pending", paused: false } : m
            ),
          };
        }
      );

      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.monitors.detail(id), context.previous);
      }
      toast({
        title: "Failed to resume monitor",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.lists() });
    },
  });
}

export function useCheckMonitorNow() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.monitors.checkNow(id, organizationId ?? undefined),
    onSuccess: (_, id) => {
      toast({
        title: "Check started",
        description: "Monitor check is running. Results will appear shortly.",
      });
      // Refresh results after a short delay to allow check to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.monitors.detail(id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.monitors.results(id) });
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: "Failed to start check",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });
}
