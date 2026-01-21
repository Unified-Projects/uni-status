"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys, type PaginationParams } from "@/lib/api-client";
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  UpdateOrganizationCredentialsInput,
  CredentialType,
} from "@uni-status/shared/validators";

export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: () => apiClient.organizations.list(),
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: queryKeys.organizations.detail(id),
    queryFn: () => apiClient.organizations.get(id),
    enabled: !!id,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrganizationInput) =>
      apiClient.organizations.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateOrganizationInput> }) =>
      apiClient.organizations.update(id, data),
    onSuccess: (updatedOrg) => {
      queryClient.setQueryData(
        queryKeys.organizations.detail(updatedOrg.id),
        updatedOrg
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.list() });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.organizations.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.list() });
      const previousOrgs = queryClient.getQueryData(queryKeys.organizations.list());
      queryClient.setQueriesData(
        { queryKey: queryKeys.organizations.list() },
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((org: { id: string }) => org.id !== id);
        }
      );
      return { previousOrgs };
    },
    onError: (_, __, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(queryKeys.organizations.list(), context.previousOrgs);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
  });
}

// Organization Members
export function useOrganizationMembers(orgId: string, params?: PaginationParams) {
  return useQuery({
    queryKey: queryKeys.organizations.members(orgId, params as Record<string, unknown>),
    queryFn: () => apiClient.organizations.members.list(orgId, params),
    enabled: !!orgId,
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      memberId,
      role,
    }: {
      orgId: string;
      memberId: string;
      role: string;
    }) => apiClient.organizations.members.updateRole(orgId, memberId, role),
    onMutate: async ({ orgId, memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.members(orgId) });
      const previousMembers = queryClient.getQueryData(queryKeys.organizations.members(orgId));
      queryClient.setQueriesData(
        { queryKey: queryKeys.organizations.members(orgId) },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string; role: string; customRoleId?: string | null }> };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.map((member) =>
              member.id === memberId ? { ...member, role, customRoleId: null } : member
            ),
          };
        }
      );
      return { previousMembers };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(queryKeys.organizations.members(orgId), context.previousMembers);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: string; memberId: string }) =>
      apiClient.organizations.members.remove(orgId, memberId),
    onMutate: async ({ orgId, memberId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.members(orgId) });
      const previousMembers = queryClient.getQueryData(queryKeys.organizations.members(orgId));
      queryClient.setQueriesData(
        { queryKey: queryKeys.organizations.members(orgId) },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }>; meta?: { total: number } };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.filter((member) => member.id !== memberId),
            meta: oldData.meta ? { ...oldData.meta, total: oldData.meta.total - 1 } : oldData.meta,
          };
        }
      );
      return { previousMembers };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(queryKeys.organizations.members(orgId), context.previousMembers);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}

// Organization Invitations
export function useOrganizationInvitations(orgId: string, params?: PaginationParams) {
  return useQuery({
    queryKey: queryKeys.organizations.invitations(orgId, params as Record<string, unknown>),
    queryFn: () => apiClient.organizations.invitations.list(orgId, params),
    enabled: !!orgId,
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: InviteMemberInput }) =>
      apiClient.organizations.invitations.create(orgId, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.invitations(orgId) });
    },
  });
}

export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, invitationId }: { orgId: string; invitationId: string }) =>
      apiClient.organizations.invitations.cancel(orgId, invitationId),
    onMutate: async ({ orgId, invitationId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.invitations(orgId) });
      const previousInvitations = queryClient.getQueryData(queryKeys.organizations.invitations(orgId));
      queryClient.setQueriesData(
        { queryKey: queryKeys.organizations.invitations(orgId) },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as { data?: Array<{ id: string }>; meta?: { total: number } };
          if (!oldData.data) return old;
          return {
            ...oldData,
            data: oldData.data.filter((inv) => inv.id !== invitationId),
            meta: oldData.meta ? { ...oldData.meta, total: oldData.meta.total - 1 } : oldData.meta,
          };
        }
      );
      return { previousInvitations };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousInvitations) {
        queryClient.setQueryData(queryKeys.organizations.invitations(orgId), context.previousInvitations);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.invitations(orgId) });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, invitationId }: { orgId: string; invitationId: string }) =>
      apiClient.organizations.invitations.resend(orgId, invitationId),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.invitations(orgId) });
    },
  });
}

// API Keys
export function useOrganizationApiKeys(orgId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.organizations.apiKeys(orgId),
    queryFn: () => apiClient.organizations.apiKeys.list(orgId),
    enabled: !!orgId && (options?.enabled ?? true),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: { name: string; scopes?: string[]; expiresIn?: number };
    }) => apiClient.organizations.apiKeys.create(orgId, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.apiKeys(orgId) });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, keyId }: { orgId: string; keyId: string }) =>
      apiClient.organizations.apiKeys.delete(orgId, keyId),
    onMutate: async ({ orgId, keyId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.apiKeys(orgId) });
      const previousKeys = queryClient.getQueryData(queryKeys.organizations.apiKeys(orgId));
      queryClient.setQueryData(
        queryKeys.organizations.apiKeys(orgId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((key: { id: string }) => key.id !== keyId);
        }
      );
      return { previousKeys };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousKeys) {
        queryClient.setQueryData(queryKeys.organizations.apiKeys(orgId), context.previousKeys);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.apiKeys(orgId) });
    },
  });
}

// Organization Credentials (BYO Integrations)
export function useOrganizationCredentials(orgId: string) {
  return useQuery({
    queryKey: queryKeys.organizations.credentials(orgId),
    queryFn: () => apiClient.organizations.credentials.get(orgId),
    enabled: !!orgId,
  });
}

export function useUpdateCredentials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: UpdateOrganizationCredentialsInput;
    }) => apiClient.organizations.credentials.update(orgId, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.credentials(orgId) });
    },
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      type,
    }: {
      orgId: string;
      type: CredentialType;
    }) => apiClient.organizations.credentials.delete(orgId, type),
    onMutate: async ({ orgId, type }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations.credentials(orgId) });
      const previousCredentials = queryClient.getQueryData(queryKeys.organizations.credentials(orgId));
      queryClient.setQueryData(
        queryKeys.organizations.credentials(orgId),
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as Record<string, unknown>;
          const { [type]: _, ...rest } = oldData;
          return rest;
        }
      );
      return { previousCredentials };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousCredentials) {
        queryClient.setQueryData(queryKeys.organizations.credentials(orgId), context.previousCredentials);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.credentials(orgId) });
    },
  });
}

export function useTestCredential() {
  return useMutation({
    mutationFn: ({
      orgId,
      type,
      testDestination,
    }: {
      orgId: string;
      type: CredentialType;
      testDestination?: string;
    }) => apiClient.organizations.credentials.test(orgId, type, testDestination),
  });
}
