"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys, type CrowdsourcedSettings, type PaginationParams } from "@/lib/api-client";
import type { CreateStatusPageInput, UpdateStatusPageInput } from "@uni-status/shared/validators";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useStatusPages(params?: PaginationParams) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.statusPages.list(params as Record<string, unknown>),
    queryFn: () => apiClient.statusPages.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useStatusPage(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.statusPages.detail(id),
    queryFn: () => apiClient.statusPages.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useStatusPageSubscribers(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.statusPages.subscribers(id),
    queryFn: () => apiClient.statusPages.getSubscribers(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateStatusPage() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: CreateStatusPageInput) =>
      apiClient.statusPages.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.all });
    },
  });
}

export function useUpdateStatusPage() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStatusPageInput }) =>
      apiClient.statusPages.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPages.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPages.list() });
      const previousDetail = queryClient.getQueryData(queryKeys.statusPages.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.statusPages.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.statusPages.list() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }> };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.map((p) => (p.id === id ? { ...p, ...data } : p)),
          };
        }
      );
      return { previousDetail };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.statusPages.detail(id), context.previousDetail);
      }
    },
    onSettled: (updatedPage) => {
      if (updatedPage) {
        queryClient.setQueryData(queryKeys.statusPages.detail(updatedPage.id), updatedPage);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.list() });
    },
  });
}

export function useDeleteStatusPage() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.statusPages.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPages.list() });
      const previousList = queryClient.getQueryData(queryKeys.statusPages.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.statusPages.list() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }>; meta?: { total: number } };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.filter((p) => p.id !== id),
            meta: oldData.meta ? { ...oldData.meta, total: oldData.meta.total - 1 } : oldData.meta,
          };
        }
      );
      return { previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.statusPages.list(), context.previousList);
      }
    },
    onSettled: (_, __, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.statusPages.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.list() });
    },
  });
}

export function useAddStatusPageMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({
      statusPageId,
      data,
    }: {
      statusPageId: string;
      data: { monitorId: string; displayName?: string; order?: number };
    }) => apiClient.statusPages.addMonitor(statusPageId, data, organizationId ?? undefined),
    onSuccess: (_, { statusPageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.detail(statusPageId) });
    },
  });
}

export function useUpdateStatusPageMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({
      statusPageId,
      monitorId,
      data,
    }: {
      statusPageId: string;
      monitorId: string;
      data: { displayName?: string; description?: string; order?: number; group?: string | null };
    }) => apiClient.statusPages.updateMonitor(statusPageId, monitorId, data, organizationId ?? undefined),
    onMutate: async ({ statusPageId, monitorId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPages.detail(statusPageId) });
      const previousDetail = queryClient.getQueryData(queryKeys.statusPages.detail(statusPageId));
      queryClient.setQueryData(
        queryKeys.statusPages.detail(statusPageId),
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { monitors?: Array<{ monitorId: string }> };
          if (!oldData.monitors) return old;
          return {
            ...oldData,
            monitors: oldData.monitors.map((m) =>
              m.monitorId === monitorId ? { ...m, ...data } : m
            ),
          };
        }
      );
      return { previousDetail };
    },
    onError: (_, { statusPageId }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.statusPages.detail(statusPageId), context.previousDetail);
      }
    },
    onSettled: (_, __, { statusPageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.detail(statusPageId) });
    },
  });
}

export function useRemoveStatusPageMonitor() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({
      statusPageId,
      monitorId,
    }: {
      statusPageId: string;
      monitorId: string;
    }) => apiClient.statusPages.removeMonitor(statusPageId, monitorId, organizationId ?? undefined),
    onMutate: async ({ statusPageId, monitorId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPages.detail(statusPageId) });
      const previousDetail = queryClient.getQueryData(queryKeys.statusPages.detail(statusPageId));
      queryClient.setQueryData(
        queryKeys.statusPages.detail(statusPageId),
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { monitors?: Array<{ monitorId: string }> };
          if (!oldData.monitors) return old;
          return {
            ...oldData,
            monitors: oldData.monitors.filter((m) => m.monitorId !== monitorId),
          };
        }
      );
      return { previousDetail };
    },
    onError: (_, { statusPageId }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.statusPages.detail(statusPageId), context.previousDetail);
      }
    },
    onSettled: (_, __, { statusPageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.detail(statusPageId) });
    },
  });
}

export function useCrowdsourcedSettings(statusPageId: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.statusPages.crowdsourced(statusPageId),
    queryFn: () => apiClient.statusPages.getCrowdsourcedSettings(statusPageId, organizationId ?? undefined),
    enabled: !!statusPageId && !!organizationId,
  });
}

export function useUpdateCrowdsourcedSettings() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({
      statusPageId,
      data,
    }: {
      statusPageId: string;
      data: Partial<CrowdsourcedSettings>;
    }) => apiClient.statusPages.updateCrowdsourcedSettings(statusPageId, data, organizationId ?? undefined),
    onMutate: async ({ statusPageId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPages.crowdsourced(statusPageId) });
      const previousSettings = queryClient.getQueryData(queryKeys.statusPages.crowdsourced(statusPageId));
      queryClient.setQueryData(
        queryKeys.statusPages.crowdsourced(statusPageId),
        (old: unknown) => (old ? { ...old, ...data } : old)
      );
      return { previousSettings };
    },
    onError: (_, { statusPageId }, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.statusPages.crowdsourced(statusPageId), context.previousSettings);
      }
    },
    onSettled: (_, __, { statusPageId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.crowdsourced(statusPageId) });
    },
  });
}
