"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";
import type {
  CreateSSOProviderInput,
  UpdateSSOProviderInput,
  AddDomainInput,
  UpdateDomainInput,
  CreateResourceScopeInput,
} from "@/lib/api-client";

export function useSSOProviders(orgId: string) {
  return useQuery({
    queryKey: queryKeys.sso.providers(orgId),
    queryFn: () => apiClient.sso.providers.list(orgId),
    enabled: !!orgId,
  });
}

export function useCreateSSOProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: CreateSSOProviderInput }) =>
      apiClient.sso.providers.create(orgId, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.providers(orgId) });
    },
  });
}

export function useUpdateSSOProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      providerId,
      data,
    }: {
      orgId: string;
      providerId: string;
      data: UpdateSSOProviderInput;
    }) => apiClient.sso.providers.update(orgId, providerId, data),
    onMutate: async ({ orgId, providerId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sso.providers(orgId) });
      const previousProviders = queryClient.getQueryData(queryKeys.sso.providers(orgId));
      queryClient.setQueryData(
        queryKeys.sso.providers(orgId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((p: { id: string }) => (p.id === providerId ? { ...p, ...data } : p));
        }
      );
      return { previousProviders };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousProviders) {
        queryClient.setQueryData(queryKeys.sso.providers(orgId), context.previousProviders);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.providers(orgId) });
    },
  });
}

export function useDeleteSSOProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, providerId }: { orgId: string; providerId: string }) =>
      apiClient.sso.providers.delete(orgId, providerId),
    onMutate: async ({ orgId, providerId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sso.providers(orgId) });
      const previousProviders = queryClient.getQueryData(queryKeys.sso.providers(orgId));
      queryClient.setQueryData(
        queryKeys.sso.providers(orgId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((p: { id: string }) => p.id !== providerId);
        }
      );
      return { previousProviders };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousProviders) {
        queryClient.setQueryData(queryKeys.sso.providers(orgId), context.previousProviders);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.providers(orgId) });
    },
  });
}

export function useTestSSOProvider() {
  return useMutation({
    mutationFn: ({ orgId, providerId }: { orgId: string; providerId: string }) =>
      apiClient.sso.providers.test(orgId, providerId),
  });
}

export function useOrganizationDomains(orgId: string) {
  return useQuery({
    queryKey: queryKeys.sso.domains(orgId),
    queryFn: () => apiClient.sso.domains.list(orgId),
    enabled: !!orgId,
  });
}

export function useAddDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: AddDomainInput }) =>
      apiClient.sso.domains.add(orgId, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.domains(orgId) });
    },
  });
}

export function useUpdateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      domainId,
      data,
    }: {
      orgId: string;
      domainId: string;
      data: UpdateDomainInput;
    }) => apiClient.sso.domains.update(orgId, domainId, data),
    onMutate: async ({ orgId, domainId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sso.domains(orgId) });
      const previousDomains = queryClient.getQueryData(queryKeys.sso.domains(orgId));
      queryClient.setQueryData(
        queryKeys.sso.domains(orgId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((d: { id: string }) => (d.id === domainId ? { ...d, ...data } : d));
        }
      );
      return { previousDomains };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousDomains) {
        queryClient.setQueryData(queryKeys.sso.domains(orgId), context.previousDomains);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.domains(orgId) });
    },
  });
}

export function useVerifyDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, domainId }: { orgId: string; domainId: string }) =>
      apiClient.sso.domains.verify(orgId, domainId),
    onMutate: async ({ orgId, domainId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sso.domains(orgId) });
      const previousDomains = queryClient.getQueryData(queryKeys.sso.domains(orgId));
      queryClient.setQueryData(
        queryKeys.sso.domains(orgId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((d: { id: string }) =>
            d.id === domainId ? { ...d, verificationStatus: "pending" } : d
          );
        }
      );
      return { previousDomains };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousDomains) {
        queryClient.setQueryData(queryKeys.sso.domains(orgId), context.previousDomains);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.domains(orgId) });
    },
  });
}

export function useDeleteDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, domainId }: { orgId: string; domainId: string }) =>
      apiClient.sso.domains.delete(orgId, domainId),
    onMutate: async ({ orgId, domainId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sso.domains(orgId) });
      const previousDomains = queryClient.getQueryData(queryKeys.sso.domains(orgId));
      queryClient.setQueryData(
        queryKeys.sso.domains(orgId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((d: { id: string }) => d.id !== domainId);
        }
      );
      return { previousDomains };
    },
    onError: (_, { orgId }, context) => {
      if (context?.previousDomains) {
        queryClient.setQueryData(queryKeys.sso.domains(orgId), context.previousDomains);
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.domains(orgId) });
    },
  });
}

export function useResourceScopes(orgId: string, memberId: string) {
  return useQuery({
    queryKey: queryKeys.sso.resourceScopes(orgId, memberId),
    queryFn: () => apiClient.sso.resourceScopes.list(orgId, memberId),
    enabled: !!orgId && !!memberId,
  });
}

export function useCreateResourceScope() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      memberId,
      data,
    }: {
      orgId: string;
      memberId: string;
      data: CreateResourceScopeInput;
    }) => apiClient.sso.resourceScopes.create(orgId, memberId, data),
    onSuccess: (_, { orgId, memberId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.resourceScopes(orgId, memberId) });
    },
  });
}

export function useDeleteResourceScope() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      memberId,
      scopeId,
    }: {
      orgId: string;
      memberId: string;
      scopeId: string;
    }) => apiClient.sso.resourceScopes.delete(orgId, memberId, scopeId),
    onMutate: async ({ orgId, memberId, scopeId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sso.resourceScopes(orgId, memberId) });
      const previousScopes = queryClient.getQueryData(queryKeys.sso.resourceScopes(orgId, memberId));
      queryClient.setQueryData(
        queryKeys.sso.resourceScopes(orgId, memberId),
        (old: unknown) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((s: { id: string }) => s.id !== scopeId);
        }
      );
      return { previousScopes };
    },
    onError: (_, { orgId, memberId }, context) => {
      if (context?.previousScopes) {
        queryClient.setQueryData(queryKeys.sso.resourceScopes(orgId, memberId), context.previousScopes);
      }
    },
    onSettled: (_, __, { orgId, memberId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sso.resourceScopes(orgId, memberId) });
    },
  });
}
