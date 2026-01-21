"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import type { CreateRoleInput, UpdateRoleInput } from "@uni-status/shared/validators";

export function useOrganizationRoles(orgId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.organizations.roles(orgId),
    queryFn: () => apiClient.organizations.roles.list(orgId),
    enabled: !!orgId && (options?.enabled ?? true),
  });
}

export function useOrganizationRole(orgId: string, roleId: string) {
  return useQuery({
    queryKey: queryKeys.organizations.role(orgId, roleId),
    queryFn: () => apiClient.organizations.roles.get(orgId, roleId),
    enabled: !!orgId && !!roleId,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: CreateRoleInput }) =>
      apiClient.organizations.roles.create(orgId, data),
    onSuccess: (_: unknown, { orgId }: { orgId: string; data: CreateRoleInput }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.roles(orgId) });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      roleId,
      data,
    }: {
      orgId: string;
      roleId: string;
      data: UpdateRoleInput;
    }) => apiClient.organizations.roles.update(orgId, roleId, data),
    onMutate: async ({ orgId, roleId, data }: { orgId: string; roleId: string; data: UpdateRoleInput }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.roles(orgId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.role(orgId, roleId) });
      const previousRoles = queryClient.getQueryData(queryKeys.organizations.roles(orgId));
      const previousRole = queryClient.getQueryData(queryKeys.organizations.role(orgId, roleId));
      queryClient.setQueryData(
        queryKeys.organizations.roles(orgId),
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { custom?: Array<{ id: string }>; predefined?: unknown[] };
          if (!oldData.custom) return old;
          return {
            ...oldData,
            custom: oldData.custom.map((role) =>
              role.id === roleId ? { ...role, ...data } : role
            ),
          };
        }
      );
      queryClient.setQueryData(
        queryKeys.organizations.role(orgId, roleId),
        (old: unknown) => (old ? { ...old, ...data } : old)
      );
      return { previousRoles, previousRole };
    },
    onError: (_: unknown, { orgId, roleId }: { orgId: string; roleId: string; data: UpdateRoleInput }, context: { previousRoles?: unknown; previousRole?: unknown } | undefined) => {
      if (context?.previousRoles) {
        queryClient.setQueryData(queryKeys.organizations.roles(orgId), context.previousRoles);
      }
      if (context?.previousRole) {
        queryClient.setQueryData(queryKeys.organizations.role(orgId, roleId), context.previousRole);
      }
    },
    onSettled: (_: unknown, __: unknown, { orgId, roleId }: { orgId: string; roleId: string; data: UpdateRoleInput }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.roles(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.role(orgId, roleId) });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, roleId }: { orgId: string; roleId: string }) =>
      apiClient.organizations.roles.delete(orgId, roleId),
    onMutate: async ({ orgId, roleId }: { orgId: string; roleId: string }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.roles(orgId) });
      const previousRoles = queryClient.getQueryData(queryKeys.organizations.roles(orgId));
      queryClient.setQueryData(
        queryKeys.organizations.roles(orgId),
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { custom?: Array<{ id: string }>; predefined?: unknown[] };
          if (!oldData.custom) return old;
          return {
            ...oldData,
            custom: oldData.custom.filter((role) => role.id !== roleId),
          };
        }
      );
      return { previousRoles };
    },
    onError: (_: unknown, { orgId }: { orgId: string; roleId: string }, context: { previousRoles?: unknown } | undefined) => {
      if (context?.previousRoles) {
        queryClient.setQueryData(queryKeys.organizations.roles(orgId), context.previousRoles);
      }
    },
    onSettled: (_: unknown, __: unknown, { orgId }: { orgId: string; roleId: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.roles(orgId) });
      // Also invalidate members as their roles may have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}

export function useAssignMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      memberId,
      roleId,
    }: {
      orgId: string;
      memberId: string;
      roleId: string;
    }) => apiClient.organizations.roles.assignToMember(orgId, memberId, roleId),
    onMutate: async ({ orgId, memberId, roleId }: { orgId: string; memberId: string; roleId: string }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.members(orgId) });
      const previousMembers = queryClient.getQueryData(queryKeys.organizations.members(orgId));
      queryClient.setQueriesData(
        { queryKey: queryKeys.organizations.members(orgId) },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string; role: string; customRoleId?: string | null }> };
          if (!oldData.data) return old;
          // Determine if roleId is a base role or custom role
          const baseRoles = ["owner", "admin", "member", "viewer"];
          const isBaseRole = baseRoles.includes(roleId);
          return {
            ...oldData,
            data: oldData.data.map((member) =>
              member.id === memberId
                ? {
                    ...member,
                    role: isBaseRole ? roleId : member.role,
                    customRoleId: isBaseRole ? null : roleId,
                  }
                : member
            ),
          };
        }
      );
      return { previousMembers };
    },
    onError: (_: unknown, { orgId }: { orgId: string; memberId: string; roleId: string }, context: { previousMembers?: unknown } | undefined) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(queryKeys.organizations.members(orgId), context.previousMembers);
      }
    },
    onSettled: (_: unknown, __: unknown, { orgId }: { orgId: string; memberId: string; roleId: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}
