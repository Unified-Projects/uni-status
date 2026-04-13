"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  apiClient,
  queryKeys,
  type Monitor,
  type CheckResult,
  type MonitorListParams,
} from "@/lib/api-client";
import type {
  CreateMonitorInput,
  UpdateMonitorInput,
} from "@uni-status/shared/validators";
import { useDashboardStore } from "@/stores/dashboard-store";
import { toast } from "@uni-status/ui";

type QuerySnapshot = {
  queryKey: QueryKey;
  data: unknown;
};

function captureQuerySnapshots(
  queryClient: QueryClient,
  queryKey: QueryKey,
): QuerySnapshot[] {
  return queryClient
    .getQueriesData({ queryKey })
    .map(([snapshotKey, data]) => ({
      queryKey: snapshotKey,
      data,
    }));
}

function restoreQuerySnapshots(
  queryClient: QueryClient,
  snapshots?: QuerySnapshot[],
) {
  snapshots?.forEach(({ queryKey, data }) => {
    queryClient.setQueryData(queryKey, data);
  });
}

export function useMonitors(params?: MonitorListParams) {
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useQuery({
    queryKey: queryKeys.monitors.list(
      organizationId ?? undefined,
      params as Record<string, unknown> | undefined,
    ),
    queryFn: () => apiClient.monitors.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
    placeholderData: (previousData) => previousData,
  });
}

export function useMonitor(id: string) {
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useQuery({
    queryKey: queryKeys.monitors.detail(id, organizationId ?? undefined),
    queryFn: () => apiClient.monitors.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useMonitorResults(
  id: string,
  options?: { limit?: number; offset?: number },
) {
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useQuery({
    queryKey: [
      ...queryKeys.monitors.results(id, organizationId ?? undefined),
      options,
    ],
    queryFn: () =>
      apiClient.monitors.getResults(id, options, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: (data: CreateMonitorInput) =>
      apiClient.monitors.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.analytics.dashboard(),
      });
    },
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMonitorInput }) =>
      apiClient.monitors.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      const detailQueryKey = queryKeys.monitors.detail(
        id,
        organizationId ?? undefined,
      );
      const listQueryKey = queryKeys.monitors.lists(
        organizationId ?? undefined,
      );

      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previousDetail = queryClient.getQueryData<Monitor>(detailQueryKey);
      const previousLists = captureQuerySnapshots(queryClient, listQueryKey);
      if (previousDetail) {
        queryClient.setQueryData(detailQueryKey, {
          ...previousDetail,
          ...data,
        });
      }
      queryClient.setQueriesData({ queryKey: listQueryKey }, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as { data?: Array<{ id: string }> };
        if (!oldData.data) return old;
        return {
          ...oldData,
          data: oldData.data.map((m) => (m.id === id ? { ...m, ...data } : m)),
        };
      });
      return { previousDetail, previousLists };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          queryKeys.monitors.detail(id, organizationId ?? undefined),
          context.previousDetail,
        );
      }
      restoreQuerySnapshots(queryClient, context?.previousLists);
    },
    onSettled: (updatedMonitor, _, { id }) => {
      if (updatedMonitor) {
        queryClient.setQueryData(
          queryKeys.monitors.detail(
            updatedMonitor.id,
            organizationId ?? undefined,
          ),
          updatedMonitor,
        );
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.monitors.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      const listQueryKey = queryKeys.monitors.lists(
        organizationId ?? undefined,
      );

      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previousLists = captureQuerySnapshots(queryClient, listQueryKey);
      queryClient.setQueriesData({ queryKey: listQueryKey }, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as {
          data?: Array<{ id: string }>;
          meta?: { total: number };
        };
        if (!oldData.data) return old;
        return {
          ...oldData,
          data: oldData.data.filter((m) => m.id !== id),
          meta: oldData.meta
            ? { ...oldData.meta, total: oldData.meta.total - 1 }
            : oldData.meta,
        };
      });
      return { previousLists };
    },
    onError: (_, __, context) => {
      restoreQuerySnapshots(queryClient, context?.previousLists);
    },
    onSettled: (_, __, deletedId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.monitors.detail(
          deletedId,
          organizationId ?? undefined,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.analytics.dashboard(),
      });
    },
  });
}

export function usePauseMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

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
      const detailQueryKey = queryKeys.monitors.detail(
        id,
        organizationId ?? undefined,
      );
      const listQueryKey = queryKeys.monitors.lists(
        organizationId ?? undefined,
      );

      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previous = queryClient.getQueryData<Monitor>(detailQueryKey);

      if (previous) {
        queryClient.setQueryData(detailQueryKey, {
          ...previous,
          status: "paused" as const,
          paused: true,
        });
      }
      queryClient.setQueriesData({ queryKey: listQueryKey }, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as {
          data?: Array<{ id: string; status: string; paused: boolean }>;
        };
        if (!oldData.data) return old;
        return {
          ...oldData,
          data: oldData.data.map((m) =>
            m.id === id ? { ...m, status: "paused", paused: true } : m,
          ),
        };
      });

      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.monitors.detail(id, organizationId ?? undefined),
          context.previous,
        );
      }
      toast({
        title: "Failed to pause monitor",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.detail(id, organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
    },
  });
}

export function useResumeMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

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
      const detailQueryKey = queryKeys.monitors.detail(
        id,
        organizationId ?? undefined,
      );
      const listQueryKey = queryKeys.monitors.lists(
        organizationId ?? undefined,
      );

      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previous = queryClient.getQueryData<Monitor>(detailQueryKey);

      if (previous) {
        queryClient.setQueryData(detailQueryKey, {
          ...previous,
          status: "pending" as const,
          paused: false,
        });
      }
      queryClient.setQueriesData({ queryKey: listQueryKey }, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as {
          data?: Array<{ id: string; status: string; paused: boolean }>;
        };
        if (!oldData.data) return old;
        return {
          ...oldData,
          data: oldData.data.map((m) =>
            m.id === id ? { ...m, status: "pending", paused: false } : m,
          ),
        };
      });

      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.monitors.detail(id, organizationId ?? undefined),
          context.previous,
        );
      }
      toast({
        title: "Failed to resume monitor",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.detail(id, organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
    },
  });
}

export function useCheckMonitorNow() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

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
        queryClient.invalidateQueries({
          queryKey: queryKeys.monitors.detail(id, organizationId ?? undefined),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.monitors.results(id, organizationId ?? undefined),
        });
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: "Failed to start check",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useDuplicateMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) =>
      apiClient.monitors.duplicate(
        id,
        name ? { name } : undefined,
        organizationId ?? undefined,
      ),
    onSuccess: () => {
      toast({
        title: "Monitor duplicated",
        description: "A copy of the monitor has been created.",
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.analytics.dashboard(),
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to duplicate monitor",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useBulkPauseMonitors() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.monitors.pauseBulk(ids, organizationId ?? undefined),
    onSuccess: (data) => {
      toast({
        title: "Monitors paused",
        description: `${data.updated} monitor(s) paused.`,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.analytics.dashboard(),
      });
    },
  });
}

export function useBulkResumeMonitors() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.monitors.resumeBulk(ids, organizationId ?? undefined),
    onSuccess: (data) => {
      toast({
        title: "Monitors resumed",
        description: `${data.updated} monitor(s) resumed.`,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.monitors.lists(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.analytics.dashboard(),
      });
    },
  });
}

export function useBulkCheckMonitors() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.monitors.checkBulk(ids, organizationId ?? undefined),
    onSuccess: (data) => {
      toast({
        title: "Checks queued",
        description: `${data.queued} monitor check(s) queued${data.skippedPaused ? `, ${data.skippedPaused} skipped (paused)` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
    },
  });
}

export function useBulkDeleteMonitors() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore(
    (state) => state.currentOrganizationId,
  );

  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.monitors.deleteBulk(ids, organizationId ?? undefined),
    onSuccess: (data) => {
      toast({
        title: "Monitors deleted",
        description: `${data.deleted} monitor(s) deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.analytics.dashboard(),
      });
    },
  });
}
