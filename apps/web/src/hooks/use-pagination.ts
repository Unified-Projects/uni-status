"use client";

import { useState, useCallback, useMemo } from "react";
import { DEFAULT_PAGE_SIZE } from "@/components/ui/pagination";

export interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

export interface UsePaginationReturn {
  page: number;
  pageSize: number;
  offset: number;
  setPage: (page: number) => void;
  resetPage: () => void;
  paginationParams: { limit: number; offset: number };
}

export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const { pageSize = DEFAULT_PAGE_SIZE, initialPage = 1 } = options;
  const [page, setPageState] = useState(initialPage);

  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize]);

  const setPage = useCallback((newPage: number) => {
    if (newPage >= 1) {
      setPageState(newPage);
    }
  }, []);

  const resetPage = useCallback(() => {
    setPageState(1);
  }, []);

  const paginationParams = useMemo(
    () => ({
      limit: pageSize,
      offset,
    }),
    [pageSize, offset]
  );

  return {
    page,
    pageSize,
    offset,
    setPage,
    resetPage,
    paginationParams,
  };
}
