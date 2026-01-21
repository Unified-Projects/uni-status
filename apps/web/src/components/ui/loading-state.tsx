"use client";

import { Skeleton, Card, CardContent, CardHeader } from "@uni-status/ui";
import { cn } from "@uni-status/ui";

export interface LoadingStateProps {
  variant?: "card" | "table" | "list" | "stats" | "page" | "template";
  count?: number;
  className?: string;
}

export function LoadingState({
  variant = "card",
  count = 3,
  className,
}: LoadingStateProps) {
  switch (variant) {
    case "stats":
      return (
        <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      );

    case "table":
      return (
        <div className={cn("space-y-3", className)}>
          <div className="flex items-center justify-between pb-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-32" />
          </div>
          <div className="rounded-md border">
            <div className="border-b p-4">
              <div className="flex gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-24" />
                ))}
              </div>
            </div>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="border-b p-4 last:border-0">
                <div className="flex gap-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-24" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "list":
      return (
        <div className={cn("space-y-4", className)}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      );

    case "page":
      return (
        <div className={cn("space-y-6", className)}>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <LoadingState variant="stats" />
          <div className="grid gap-6 md:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
          </div>
        </div>
      );

    case "template":
      return (
        <div className={cn("space-y-2", className)}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      );

    case "card":
    default:
      return (
        <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
          {Array.from({ length: count }).map((_, i) => (
            <LoadingCard key={i} />
          ))}
        </div>
      );
  }
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center p-8", className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export function LoadingInline({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}
