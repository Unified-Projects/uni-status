"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import type { EventType, EventsListParams } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

export function useEvents(params?: EventsListParams) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.events.list(organizationId ?? undefined, params),
    queryFn: () => apiClient.events.list(params, organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useEvent(type: EventType, id: string) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.events.detail(type, id, organizationId ?? undefined),
    queryFn: () => apiClient.events.get(type, id, organizationId ?? undefined),
    enabled: !!type && !!id && !!organizationId,
  });
}

export function useEventSubscriptions() {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useQuery({
    queryKey: queryKeys.events.subscriptions(organizationId ?? undefined),
    queryFn: () => apiClient.events.subscriptions(organizationId ?? undefined),
    enabled: !!organizationId,
  });
}

export function useSubscribeToEvent() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ type, id }: { type: EventType; id: string }) =>
      apiClient.events.subscribe(type, id, organizationId ?? undefined),
    onSuccess: (_, { type, id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.detail(type, id, organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.subscriptions(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.lists(organizationId ?? undefined),
      });
    },
  });
}

export function useUnsubscribeFromEvent() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  return useMutation({
    mutationFn: ({ type, id }: { type: EventType; id: string }) =>
      apiClient.events.unsubscribe(type, id, organizationId ?? undefined),
    onSuccess: (_, { type, id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.detail(type, id, organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.subscriptions(organizationId ?? undefined),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.lists(organizationId ?? undefined),
      });
    },
  });
}

export function useExportEvent() {
  return {
    getExportUrl: (type: EventType, id: string, format: "ics" | "json") =>
      apiClient.events.export(type, id, format),
  };
}
