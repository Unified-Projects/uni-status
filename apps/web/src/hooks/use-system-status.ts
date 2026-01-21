"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import type { SystemStatus, SystemSettings, SystemSetupInput, PendingApproval, PendingApprovalStatus } from "@/lib/api-client";

/**
 * Hook to fetch system status (public endpoint)
 * Returns deployment type, self-hosted mode, and setup status
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: queryKeys.system.status(),
    queryFn: () => apiClient.system.getStatus(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to fetch full system settings (super admin only)
 */
export function useSystemSettings() {
  return useQuery({
    queryKey: queryKeys.system.settings(),
    queryFn: () => apiClient.system.getSettings(),
    retry: false,
  });
}

/**
 * Hook to complete initial system setup
 */
export function useSystemSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SystemSetupInput) => apiClient.system.setup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}

/**
 * Hook to update system settings (super admin only)
 */
export function useUpdateSystemSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { signupMode?: string }) => apiClient.system.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}

/**
 * Hook to fetch pending approvals list (admin only)
 */
export function usePendingApprovals(status?: string) {
  return useQuery({
    queryKey: queryKeys.pendingApprovals.list(status),
    queryFn: () => apiClient.pendingApprovals.list(status),
    retry: false,
  });
}

/**
 * Hook to check current user's approval status
 */
export function useMyApprovalStatus() {
  return useQuery({
    queryKey: queryKeys.pendingApprovals.myStatus(),
    queryFn: () => apiClient.pendingApprovals.getMyStatus(),
    staleTime: 1000 * 10, // 10 seconds - poll more frequently
  });
}

/**
 * Hook to approve a pending user
 */
export function useApproveUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, role, notes }: { id: string; role?: string; notes?: string }) =>
      apiClient.pendingApprovals.approve(id, { role, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovals.all });
    },
  });
}

/**
 * Hook to reject a pending user
 */
export function useRejectUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiClient.pendingApprovals.reject(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovals.all });
    },
  });
}
