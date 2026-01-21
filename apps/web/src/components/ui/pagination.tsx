"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@uni-status/ui";

export const DEFAULT_PAGE_SIZE = 25;

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemsOnCurrentPage: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemsOnCurrentPage,
  onPageChange,
  itemLabel = "items",
}: PaginationProps) {
  // Don't render if only one page or no items
  if (totalPages <= 1) {
    return null;
  }

  const offset = (currentPage - 1) * pageSize;
  const startItem = offset + 1;
  const endItem = Math.min(offset + itemsOnCurrentPage, totalItems);

  // Calculate which page numbers to show (up to 5, with smart windowing)
  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if 5 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else if (currentPage <= 3) {
      // Near the start
      for (let i = 1; i <= maxVisiblePages; i++) {
        pages.push(i);
      }
    } else if (currentPage >= totalPages - 2) {
      // Near the end
      for (let i = totalPages - maxVisiblePages + 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // In the middle
      for (let i = currentPage - 2; i <= currentPage + 2; i++) {
        pages.push(i);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-between px-2">
      <div className="text-sm text-muted-foreground">
        Showing {startItem} - {endItem} of {totalItems} {itemLabel}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {pageNumbers.map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              className="w-8"
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Helper to calculate pagination values from meta response
export function getPaginationProps(
  meta: { total: number; limit: number; offset: number },
  itemsOnCurrentPage: number,
  onPageChange: (page: number) => void,
  itemLabel?: string
): PaginationProps {
  const pageSize = meta.limit;
  const currentPage = Math.floor(meta.offset / pageSize) + 1;
  const totalPages = Math.ceil(meta.total / pageSize);

  return {
    currentPage,
    totalPages,
    totalItems: meta.total,
    pageSize,
    itemsOnCurrentPage,
    onPageChange,
    itemLabel,
  };
}
