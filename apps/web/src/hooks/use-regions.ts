"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient, queryKeys } from "@/lib/api-client";

/**
 * Hook to fetch available regions and default region
 * Public endpoint - no auth required
 */
export function useRegions() {
  return useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => apiClient.regions.list(),
    staleTime: 1000 * 60 * 5, // 5 minutes - regions don't change often
    retry: 1,
  });
}
