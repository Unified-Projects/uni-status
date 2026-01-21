"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  queryKeys,
  type BadgeTemplateInput,
  type UpdateBadgeTemplateInput,
} from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useBadgeTemplates() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.badgeTemplates.list(),
    queryFn: () => apiClient.badgeTemplates.list(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useBadgeTemplate(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.badgeTemplates.detail(id),
    queryFn: () => apiClient.badgeTemplates.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateBadgeTemplate() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BadgeTemplateInput) =>
      apiClient.badgeTemplates.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeTemplates.list() });
    },
  });
}

export function useUpdateBadgeTemplate() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBadgeTemplateInput }) =>
      apiClient.badgeTemplates.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.badgeTemplates.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.badgeTemplates.list() });
      const previousDetail = queryClient.getQueryData(queryKeys.badgeTemplates.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.badgeTemplates.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueryData(
        queryKeys.badgeTemplates.list(),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((t: { id: string }) => (t.id === id ? { ...t, ...data } : t));
        }
      );
      return { previousDetail };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.badgeTemplates.detail(id), context.previousDetail);
      }
    },
    onSettled: (template) => {
      if (template) {
        queryClient.setQueryData(queryKeys.badgeTemplates.detail(template.id), template);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeTemplates.list() });
    },
  });
}

export function useDeleteBadgeTemplate() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.badgeTemplates.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.badgeTemplates.list() });
      const previousList = queryClient.getQueryData(queryKeys.badgeTemplates.list());
      queryClient.setQueryData(
        queryKeys.badgeTemplates.list(),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((t: { id: string }) => t.id !== id);
        }
      );
      return { previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.badgeTemplates.list(), context.previousList);
      }
    },
    onSettled: (_, __, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.badgeTemplates.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeTemplates.list() });
    },
  });
}
