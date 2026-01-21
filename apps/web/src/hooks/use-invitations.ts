"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import type { PendingInvitation, AcceptInvitationResponse } from "@/lib/api-client";

/**
 * Hook to fetch pending invitations for the current user
 */
export function usePendingInvitations() {
  return useQuery({
    queryKey: queryKeys.userInvitations.pending(),
    queryFn: () => apiClient.invitations.listPending(),
  });
}

/**
 * Hook to accept an invitation
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => apiClient.invitations.accept(invitationId),
    onSuccess: () => {
      // Invalidate both invitations and organizations queries
      queryClient.invalidateQueries({ queryKey: queryKeys.userInvitations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
  });
}

/**
 * Hook to decline an invitation
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => apiClient.invitations.decline(invitationId),
    onSuccess: () => {
      // Invalidate invitations query
      queryClient.invalidateQueries({ queryKey: queryKeys.userInvitations.all });
    },
  });
}
