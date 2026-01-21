"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import type { CreateMaintenanceWindowInput, UpdateMaintenanceWindowInput } from "@uni-status/shared/validators";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useMaintenanceWindows(status?: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.maintenanceWindows.list(status),
    queryFn: () => apiClient.maintenanceWindows.list(status, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useMaintenanceWindow(id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.maintenanceWindows.detail(id),
    queryFn: () => apiClient.maintenanceWindows.get(id, organizationId ?? undefined),
    enabled: !!id && !!organizationId,
  });
}

export function useCreateMaintenanceWindow() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (data: CreateMaintenanceWindowInput) =>
      apiClient.maintenanceWindows.create(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceWindows.all });
    },
  });
}

export function useUpdateMaintenanceWindow() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMaintenanceWindowInput }) =>
      apiClient.maintenanceWindows.update(id, data, organizationId ?? undefined),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.maintenanceWindows.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.maintenanceWindows.lists() });
      const previousDetail = queryClient.getQueryData(queryKeys.maintenanceWindows.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.maintenanceWindows.detail(id), { ...previousDetail, ...data });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.maintenanceWindows.lists() },
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((w: { id: string }) => (w.id === id ? { ...w, ...data } : w));
        }
      );
      return { previousDetail };
    },
    onError: (_, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.maintenanceWindows.detail(id), context.previousDetail);
      }
    },
    onSettled: (updatedWindow) => {
      if (updatedWindow) {
        queryClient.setQueryData(queryKeys.maintenanceWindows.detail(updatedWindow.id), updatedWindow);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceWindows.lists() });
    },
  });
}

export function useDeleteMaintenanceWindow() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.maintenanceWindows.delete(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.maintenanceWindows.lists() });
      const previousLists: unknown[] = [];
      queryClient.setQueriesData(
        { queryKey: queryKeys.maintenanceWindows.lists() },
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          previousLists.push(old);
          return old.filter((w: { id: string }) => w.id !== id);
        }
      );
      return { previousLists };
    },
    onError: (_, __, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach((prev) => {
          queryClient.setQueriesData({ queryKey: queryKeys.maintenanceWindows.lists() }, () => prev);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceWindows.all });
    },
  });
}

export function useEndMaintenanceEarly() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.maintenanceWindows.endEarly(id, organizationId ?? undefined),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.maintenanceWindows.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.maintenanceWindows.lists() });
      const previousDetail = queryClient.getQueryData(queryKeys.maintenanceWindows.detail(id));
      if (previousDetail) {
        queryClient.setQueryData(queryKeys.maintenanceWindows.detail(id), {
          ...previousDetail,
          status: "completed",
          endedAt: new Date().toISOString(),
        });
      }
      queryClient.setQueriesData(
        { queryKey: queryKeys.maintenanceWindows.lists() },
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((w: { id: string }) =>
            w.id === id ? { ...w, status: "completed", endedAt: new Date().toISOString() } : w
          );
        }
      );
      return { previousDetail };
    },
    onError: (_, id, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.maintenanceWindows.detail(id), context.previousDetail);
      }
    },
    onSettled: (endedWindow) => {
      if (endedWindow) {
        queryClient.setQueryData(queryKeys.maintenanceWindows.detail(endedWindow.id), endedWindow);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceWindows.lists() });
    },
  });
}

export function useActiveMaintenanceMonitors() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.maintenanceWindows.activeMonitors(),
    queryFn: () => apiClient.maintenanceWindows.getActiveMonitors(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}
