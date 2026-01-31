"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys, type PaginationParams } from "@/lib/api-client";
import type { CreateAlertChannelInput, CreateAlertPolicyInput } from "@uni-status/shared/validators";
import { useDashboardStore } from "@/stores/dashboard-store";

// On-Call Rotations (for alert policy routing)
export function useOncallRotations() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: ["oncall", "rotations", organizationId],
    queryFn: () => apiClient.oncall.listRotations(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

// Alert Channels
export function useAlertChannels(params?: PaginationParams) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.alerts.channels.list(params as Record<string, unknown>),
    queryFn: () => apiClient.alerts.channels.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useAlertChannel(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.alerts.channels.detail(id),
    queryFn: () => apiClient.alerts.channels.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateAlertChannel() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: CreateAlertChannelInput) =>
      apiClient.alerts.channels.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.channels.all });
    },
  });
}

export function useUpdateAlertChannel() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAlertChannelInput> }) =>
      apiClient.alerts.channels.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.channels.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.channels.list() });
      const previousDetail = queryClient.getQueryData(queryKeys.alerts.channels.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.alerts.channels.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.alerts.channels.list() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }> };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.map((c) => (c.id === id ? { ...c, ...data } : c)),
          };
        }
      );
      return { previousDetail };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.alerts.channels.detail(id), context.previousDetail);
      }
    },
    onSettled: (updatedChannel) => {
      if (updatedChannel) {
        queryClient.setQueryData(queryKeys.alerts.channels.detail(updatedChannel.id), updatedChannel);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.channels.list() });
    },
  });
}

export function useDeleteAlertChannel() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.alerts.channels.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.channels.list() });
      const previousList = queryClient.getQueryData(queryKeys.alerts.channels.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.alerts.channels.list() },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }>; meta?: { total: number } };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.filter((c) => c.id !== id),
            meta: oldData.meta ? { ...oldData.meta, total: oldData.meta.total - 1 } : oldData.meta,
          };
        }
      );
      return { previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.alerts.channels.list(), context.previousList);
      }
    },
    onSettled: (_, __, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.alerts.channels.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.channels.list() });
    },
  });
}

export function useTestAlertChannel() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.alerts.channels.test(id, organizationId ?? undefined),
  });
}

// Alert Policies
export function useAlertPolicies(params?: PaginationParams) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.alerts.policies.list(params as Record<string, unknown>),
    queryFn: () => apiClient.alerts.policies.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useAlertPolicy(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.alerts.policies.detail(id),
    queryFn: () => apiClient.alerts.policies.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateAlertPolicy() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: CreateAlertPolicyInput) =>
      apiClient.alerts.policies.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.policies.all });
    },
  });
}

export function useUpdateAlertPolicy() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAlertPolicyInput> }) =>
      apiClient.alerts.policies.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.policies.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.policies.list() });
      const previousDetail = queryClient.getQueryData(queryKeys.alerts.policies.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.alerts.policies.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.alerts.policies.list() },
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
        queryClient.setQueryData(queryKeys.alerts.policies.detail(id), context.previousDetail);
      }
    },
    onSettled: (updatedPolicy) => {
      if (updatedPolicy) {
        queryClient.setQueryData(queryKeys.alerts.policies.detail(updatedPolicy.id), updatedPolicy);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.policies.list() });
    },
  });
}

export function useDeleteAlertPolicy() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.alerts.policies.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.policies.list() });
      const previousList = queryClient.getQueryData(queryKeys.alerts.policies.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.alerts.policies.list() },
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
        queryClient.setQueryData(queryKeys.alerts.policies.list(), context.previousList);
      }
    },
    onSettled: (_, __, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.alerts.policies.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.policies.list() });
    },
  });
}

export function usePolicyMonitorCounts() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.alerts.policies.monitorCounts(),
    queryFn: () => apiClient.alerts.policies.monitorCounts(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

// Alert History
export function useAlertHistory(params?: { limit?: number; offset?: number; status?: string }) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.alerts.history.list(params),
    queryFn: () => apiClient.alerts.history.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.alerts.history.acknowledge(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.history.all });
      const previousHistory = queryClient.getQueryData(queryKeys.alerts.history.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.alerts.history.all },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string; status: string; acknowledgedAt?: string }> };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.map((alert) =>
              alert.id === id ? { ...alert, status: "acknowledged", acknowledgedAt: new Date().toISOString() } : alert
            ),
          };
        }
      );
      return { previousHistory };
    },
    onError: (_, __, context) => {
      if (context?.previousHistory) {
        queryClient.setQueryData(queryKeys.alerts.history.list(), context.previousHistory);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.history.all });
    },
  });
}
