"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys, type StatusPageTheme, type StatusPageThemeColors } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useStatusPageThemes() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.statusPageThemes.list(),
    queryFn: () => apiClient.statusPageThemes.list(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useStatusPageTheme(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.statusPageThemes.detail(id),
    queryFn: () => apiClient.statusPageThemes.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateStatusPageTheme() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: { name: string; description?: string; colors: StatusPageThemeColors; isDefault?: boolean }) =>
      apiClient.statusPageThemes.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPageThemes.all });
    },
  });
}

export function useUpdateStatusPageTheme() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ name: string; description?: string; colors: StatusPageThemeColors; isDefault?: boolean }>;
    }) => apiClient.statusPageThemes.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPageThemes.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPageThemes.list() });
      const previousDetail = queryClient.getQueryData(queryKeys.statusPageThemes.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.statusPageThemes.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueriesData({ queryKey: queryKeys.statusPageThemes.list() }, (old: unknown) => {
        if (!old || !Array.isArray(old)) return old;
        return (old as StatusPageTheme[]).map((t) => (t.id === id ? { ...t, ...data } : t));
      });
      return { previousDetail };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.statusPageThemes.detail(id), context.previousDetail);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPageThemes.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPageThemes.list() });
    },
  });
}

export function useDeleteStatusPageTheme() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) => apiClient.statusPageThemes.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.statusPageThemes.list() });
      const previousList = queryClient.getQueryData(queryKeys.statusPageThemes.list());
      queryClient.setQueriesData({ queryKey: queryKeys.statusPageThemes.list() }, (old: unknown) => {
        if (!old || !Array.isArray(old)) return old;
        return (old as StatusPageTheme[]).filter((t) => t.id !== id);
      });
      return { previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.statusPageThemes.list(), context.previousList);
      }
    },
    onSettled: (_, __, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.statusPageThemes.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPageThemes.list() });
    },
  });
}
